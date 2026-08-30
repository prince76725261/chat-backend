const asyncHandler = require("express-async-handler");
const Chat = require("../models/chatModel");
const User = require("../models/userModel");
const Message = require("../models/messageModel");
const ApiError = require("../utils/ApiError");
const { emitToUsers } = require("../socket");
const EVENTS = require("../socket/events");

const PUBLIC = "name username email avatar about isOnline lastSeen";

const hydrate = (query) =>
  query
    .populate("users", PUBLIC)
    .populate("admins", PUBLIC)
    .populate({ path: "latestMessage", populate: { path: "sender", select: "name username avatar" } });

// @desc   Open (or create) the 1:1 chat with a friend
// @route  POST /api/chats   { userId }
// @access Protected
const accessChat = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const { userId } = req.body;

  if (String(userId) === String(me)) throw ApiError.badRequest("Cannot chat with yourself");

  // The product rule: you may only DM people you are actually friends with.
  const isFriend = req.user.friends.some((id) => String(id) === String(userId));
  if (!isFriend) throw ApiError.forbidden("You can only message your friends");

  const pairKey = Chat.buildPairKey(me, userId);

  // Upsert keyed on pairKey. Both users tapping "message" at the same instant
  // race here; the unique partial index makes one of them lose and re-read
  // rather than creating a duplicate conversation.
  let chat = await Chat.findOneAndUpdate(
    { pairKey },
    { $setOnInsert: { pairKey, isGroupChat: false, users: [me, userId] } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  chat = await hydrate(Chat.findById(chat._id));
  emitToUsers([me, userId], EVENTS.CHAT_NEW, { chat });

  res.json({ success: true, chat });
});

// @desc   All my conversations, most recent first
// @route  GET /api/chats
// @access Protected
const fetchChats = asyncHandler(async (req, res) => {
  const chats = await hydrate(
    Chat.find({ users: req.user._id }).sort({ updatedAt: -1 })
  );

  // Unread counts in one aggregation instead of N queries, one per chat.
  const counts = await Message.aggregate([
    {
      $match: {
        chat: { $in: chats.map((c) => c._id) },
        sender: { $ne: req.user._id },
        "readBy.user": { $ne: req.user._id },
        isDeleted: false,
      },
    },
    { $group: { _id: "$chat", count: { $sum: 1 } } },
  ]);
  const unread = new Map(counts.map((c) => [String(c._id), c.count]));

  res.json({
    success: true,
    chats: chats.map((c) => ({ ...c.toObject(), unreadCount: unread.get(String(c._id)) || 0 })),
  });
});

// @desc   Create a group
// @route  POST /api/chats/group   { name, users: [] }
// @access Protected
const createGroupChat = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const { name, users } = req.body;

  // You can only pull friends into a group you create.
  const friendSet = new Set(req.user.friends.map(String));
  const outsider = users.find((id) => !friendSet.has(String(id)));
  if (outsider) throw ApiError.forbidden("You can only add friends to a group");

  const members = [...new Set([...users.map(String), String(me)])];

  const created = await Chat.create({
    name,
    isGroupChat: true,
    users: members,
    admins: [me],
  });

  const chat = await hydrate(Chat.findById(created._id));
  emitToUsers(members, EVENTS.CHAT_NEW, { chat });

  res.status(201).json({ success: true, chat });
});

/** Loads a group and asserts the caller is an admin of it. */
const loadGroupAsAdmin = async (chatId, userId) => {
  const chat = await Chat.findById(chatId);
  if (!chat) throw ApiError.notFound("Chat not found");
  if (!chat.isGroupChat) throw ApiError.badRequest("Not a group chat");
  if (!chat.admins.some((id) => String(id) === String(userId))) {
    throw ApiError.forbidden("Only a group admin can do that");
  }
  return chat;
};

// @desc   Rename a group
// @route  PUT /api/chats/group/rename
// @access Protected (admin)
const renameGroup = asyncHandler(async (req, res) => {
  const { chatId, name } = req.body;
  const group = await loadGroupAsAdmin(chatId, req.user._id);

  group.name = name;
  await group.save();

  const chat = await hydrate(Chat.findById(chatId));
  emitToUsers(chat.users.map((u) => u._id), EVENTS.CHAT_UPDATED, { chat });

  res.json({ success: true, chat });
});

// @desc   Add a member
// @route  PUT /api/chats/group/add
// @access Protected (admin)
const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;
  await loadGroupAsAdmin(chatId, req.user._id);

  const target = await User.findById(userId);
  if (!target) throw ApiError.notFound("User not found");

  await Chat.updateOne({ _id: chatId }, { $addToSet: { users: userId } });

  const chat = await hydrate(Chat.findById(chatId));
  emitToUsers(chat.users.map((u) => u._id), EVENTS.CHAT_UPDATED, { chat });

  res.json({ success: true, chat });
});

// @desc   Remove a member, or leave the group yourself
// @route  PUT /api/chats/group/remove
// @access Protected (admin, or self-removal)
const removeFromGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;
  const leavingSelf = String(userId) === String(req.user._id);

  const chat = leavingSelf
    ? await Chat.findById(chatId)
    : await loadGroupAsAdmin(chatId, req.user._id);

  if (!chat) throw ApiError.notFound("Chat not found");
  if (!chat.users.some((id) => String(id) === String(req.user._id))) {
    throw ApiError.forbidden("You are not in this chat");
  }

  await Chat.updateOne(
    { _id: chatId },
    { $pull: { users: userId, admins: userId } }
  );

  const updated = await hydrate(Chat.findById(chatId));

  // A group with no admins left is unmanageable — promote the oldest member.
  if (updated.users.length && !updated.admins.length) {
    await Chat.updateOne({ _id: chatId }, { $addToSet: { admins: updated.users[0]._id } });
  }

  const fresh = await hydrate(Chat.findById(chatId));
  emitToUsers([...fresh.users.map((u) => u._id), userId], EVENTS.CHAT_UPDATED, { chat: fresh });

  res.json({ success: true, chat: fresh });
});

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
};
