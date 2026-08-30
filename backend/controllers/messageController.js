const asyncHandler = require("express-async-handler");
const Message = require("../models/messageModel");
const Chat = require("../models/chatModel");
const ApiError = require("../utils/ApiError");
const { emitToUsers, isOnline } = require("../socket");
const EVENTS = require("../socket/events");

const SENDER = "name username avatar isOnline";

/** Asserts the caller is a participant, and returns the chat. */
const loadChatAsMember = async (chatId, userId) => {
  const chat = await Chat.findById(chatId).select("users isGroupChat name");
  if (!chat) throw ApiError.notFound("Chat not found");
  if (!chat.users.some((id) => String(id) === String(userId))) {
    throw ApiError.forbidden("You are not a participant in this chat");
  }
  return chat;
};

// @desc   Message history, newest-first, cursor paginated
// @route  GET /api/messages/:chatId?cursor=<ISO date>&limit=30
// @access Protected
const getMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  await loadChatAsMember(chatId, req.user._id);

  const limit = Math.min(Number(req.query.limit) || 30, 100);

  // Cursor (keyset) pagination rather than skip/limit: skip has to walk and
  // discard every skipped document, so page 500 of a long chat gets slower and
  // slower. A createdAt cursor is O(log n) into the {chat, createdAt} index and
  // never shifts when new messages arrive mid-scroll.
  const filter = { chat: chatId, deletedFor: { $ne: req.user._id } };
  if (req.query.cursor) {
    const cursor = new Date(req.query.cursor);
    if (!Number.isNaN(cursor.valueOf())) filter.createdAt = { $lt: cursor };
  }

  const rows = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1) // one extra row tells us whether another page exists
    .populate("sender", SENDER)
    .populate({ path: "replyTo", select: "content sender type", populate: { path: "sender", select: "name" } });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  res.json({
    success: true,
    // Reversed so the client can append straight into a bottom-anchored list.
    messages: page.reverse(),
    nextCursor: hasMore ? page[0].createdAt.toISOString() : null,
    hasMore,
  });
});

// @desc   Send a message
// @route  POST /api/messages   { chatId, content, type?, replyTo?, clientId? }
// @access Protected
const sendMessage = asyncHandler(async (req, res) => {
  const { chatId, content, type, replyTo, clientId } = req.body;
  const chat = await loadChatAsMember(chatId, req.user._id);

  let message;
  try {
    message = await Message.create({
      chat: chatId,
      sender: req.user._id,
      content,
      type,
      replyTo: replyTo || null,
      clientId: clientId || null,
      // The sender has trivially read their own message.
      readBy: [{ user: req.user._id }],
      // Anyone with a live socket right now is treated as delivered immediately.
      deliveredTo: chat.users
        .filter((id) => String(id) !== String(req.user._id) && isOnline(id))
        .map((user) => ({ user })),
    });
  } catch (err) {
    // Duplicate clientId => this is a retry of a send that already succeeded.
    // Return the original instead of creating a second copy.
    if (err.code === 11000 && clientId) {
      message = await Message.findOne({ chat: chatId, clientId });
    } else {
      throw err;
    }
  }

  await message.populate([
    { path: "sender", select: SENDER },
    { path: "replyTo", select: "content sender type", populate: { path: "sender", select: "name" } },
  ]);

  // Keep the sidebar preview and its sort order in sync.
  await Chat.updateOne({ _id: chatId }, { latestMessage: message._id, updatedAt: new Date() });

  // Fan out to every participant's personal room, so all their devices update
  // even if they do not currently have this chat open.
  emitToUsers(chat.users, EVENTS.MESSAGE_NEW, { message, chatId });

  res.status(201).json({ success: true, message });
});

// @desc   Mark every unread message in a chat as read
// @route  PUT /api/messages/:chatId/read
// @access Protected
const markChatRead = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const chat = await loadChatAsMember(chatId, req.user._id);

  const now = new Date();
  const result = await Message.updateMany(
    {
      chat: chatId,
      sender: { $ne: req.user._id },
      "readBy.user": { $ne: req.user._id },
    },
    {
      // $addToSet on a subdocument array would still allow a duplicate with a
      // different `at`, so the "not already present" guard lives in the filter.
      $push: { readBy: { user: req.user._id, at: now } },
      $addToSet: { deliveredTo: { user: req.user._id, at: now } },
    }
  );

  if (result.modifiedCount > 0) {
    emitToUsers(chat.users, EVENTS.MESSAGE_READ, {
      chatId,
      readerId: String(req.user._id),
      at: now,
    });
  }

  res.json({ success: true, updated: result.modifiedCount });
});

// @desc   Delete a message (for me, or for everyone if I sent it)
// @route  DELETE /api/messages/:messageId?scope=me|everyone
// @access Protected
const deleteMessage = asyncHandler(async (req, res) => {
  const scope = req.query.scope === "everyone" ? "everyone" : "me";
  const message = await Message.findById(req.params.messageId);
  if (!message) throw ApiError.notFound("Message not found");

  const chat = await loadChatAsMember(message.chat, req.user._id);

  if (scope === "everyone") {
    if (String(message.sender) !== String(req.user._id)) {
      throw ApiError.forbidden("You can only delete your own messages for everyone");
    }
    message.isDeleted = true;
    message.content = "";
    await message.save();

    emitToUsers(chat.users, EVENTS.MESSAGE_DELETED, {
      chatId: String(chat._id),
      messageId: String(message._id),
      scope,
    });
  } else {
    await Message.updateOne(
      { _id: message._id },
      { $addToSet: { deletedFor: req.user._id } }
    );
  }

  res.json({ success: true, message: "Message deleted" });
});

module.exports = { getMessages, sendMessage, markChatRead, deleteMessage };
