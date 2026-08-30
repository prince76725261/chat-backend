const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const User = require("../models/userModel");
const Friendship = require("../models/friendshipModel");
const ApiError = require("../utils/ApiError");
const { emitToUser } = require("../socket");
const EVENTS = require("../socket/events");

const PUBLIC = "name username email avatar about isOnline lastSeen";

// @desc   Send a friend request
// @route  POST /api/friends/request   { userId }
// @access Protected
const sendRequest = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const { userId } = req.body;

  if (String(userId) === String(me)) {
    throw ApiError.badRequest("You cannot add yourself");
  }

  const target = await User.findById(userId);
  if (!target) throw ApiError.notFound("User not found");
  if (target.blocked.some((id) => String(id) === String(me))) {
    // Same response as success would leak nothing, but an honest 403 is fine
    // here since the blocker's identity is already known to the requester.
    throw ApiError.forbidden("You cannot send a request to this user");
  }

  const pairKey = Friendship.buildPairKey(me, userId);
  const existing = await Friendship.findOne({ pairKey });

  if (existing) {
    if (existing.status === "accepted") throw ApiError.conflict("You are already friends");
    if (existing.status === "pending") {
      // They already asked you — treat a second request as an accept.
      if (String(existing.requester) === String(userId)) {
        return acceptFriendship(existing, req, res);
      }
      throw ApiError.conflict("Request already sent");
    }
    // A previously rejected pair can try again: reopen the same document.
    existing.requester = me;
    existing.recipient = userId;
    existing.status = "pending";
    existing.respondedAt = undefined;
    await existing.save();
    await existing.populate("requester", PUBLIC);

    emitToUser(userId, EVENTS.FRIEND_REQUEST_NEW, { request: existing });
    return res.status(201).json({ success: true, request: existing });
  }

  const request = await Friendship.create({
    requester: me,
    recipient: userId,
    pairKey,
    status: "pending",
  });
  await request.populate("requester", PUBLIC);

  emitToUser(userId, EVENTS.FRIEND_REQUEST_NEW, { request });
  res.status(201).json({ success: true, request });
});

/**
 * Flip a pending request to accepted and add each user to the other's
 * denormalised friends array. The two writes must not half-apply, so they run
 * in a transaction where the deployment supports one (replica set / Atlas) and
 * fall back to sequential writes on a standalone mongod.
 */
async function acceptFriendship(request, req, res) {
  const a = request.requester;
  const b = request.recipient;

  const apply = async (session) => {
    request.status = "accepted";
    request.respondedAt = new Date();
    await request.save({ session });
    await User.updateOne({ _id: a }, { $addToSet: { friends: b } }, { session });
    await User.updateOne({ _id: b }, { $addToSet: { friends: a } }, { session });
  };

  let session;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(() => apply(session));
  } catch (err) {
    if (session) await session.endSession().catch(() => {});
    session = null;
    // Standalone mongod has no transactions; $addToSet is idempotent so a
    // retry is safe even if the first attempt partially applied.
    await apply(undefined);
  } finally {
    if (session) await session.endSession().catch(() => {});
  }

  await request.populate([
    { path: "requester", select: PUBLIC },
    { path: "recipient", select: PUBLIC },
  ]);

  emitToUser(a, EVENTS.FRIEND_REQUEST_ACCEPTED, { request });
  emitToUser(b, EVENTS.FRIEND_REQUEST_ACCEPTED, { request });

  return res.json({ success: true, request });
}

// @desc   Accept an incoming request
// @route  PUT /api/friends/request/:requestId/accept
// @access Protected
const acceptRequest = asyncHandler(async (req, res) => {
  const request = await Friendship.findById(req.params.requestId);
  if (!request || request.status !== "pending") {
    throw ApiError.notFound("Request not found");
  }
  // Only the recipient can accept — otherwise anyone could self-approve.
  if (String(request.recipient) !== String(req.user._id)) {
    throw ApiError.forbidden("Only the recipient can accept this request");
  }
  return acceptFriendship(request, req, res);
});

// @desc   Reject an incoming request
// @route  PUT /api/friends/request/:requestId/reject
// @access Protected
const rejectRequest = asyncHandler(async (req, res) => {
  const request = await Friendship.findById(req.params.requestId);
  if (!request || request.status !== "pending") throw ApiError.notFound("Request not found");
  if (String(request.recipient) !== String(req.user._id)) {
    throw ApiError.forbidden("Only the recipient can reject this request");
  }

  request.status = "rejected";
  request.respondedAt = new Date();
  await request.save();

  res.json({ success: true, request });
});

// @desc   Cancel a request I sent
// @route  DELETE /api/friends/request/:requestId
// @access Protected
const cancelRequest = asyncHandler(async (req, res) => {
  const request = await Friendship.findById(req.params.requestId);
  if (!request || request.status !== "pending") throw ApiError.notFound("Request not found");
  if (String(request.requester) !== String(req.user._id)) {
    throw ApiError.forbidden("Only the sender can cancel this request");
  }

  await request.deleteOne();
  res.json({ success: true, message: "Request cancelled" });
});

// @desc   Pending requests, split by direction
// @route  GET /api/friends/requests
// @access Protected
const listRequests = asyncHandler(async (req, res) => {
  const me = req.user._id;

  const [incoming, outgoing] = await Promise.all([
    Friendship.find({ recipient: me, status: "pending" })
      .populate("requester", PUBLIC)
      .sort({ createdAt: -1 }),
    Friendship.find({ requester: me, status: "pending" })
      .populate("recipient", PUBLIC)
      .sort({ createdAt: -1 }),
  ]);

  res.json({ success: true, incoming, outgoing });
});

// @desc   My friends
// @route  GET /api/friends
// @access Protected
const listFriends = asyncHandler(async (req, res) => {
  // Reads straight off the denormalised array — one indexed lookup, no join.
  const me = await User.findById(req.user._id).populate("friends", PUBLIC);
  res.json({ success: true, friends: me.friends });
});

// @desc   Unfriend someone
// @route  DELETE /api/friends/:userId
// @access Protected
const removeFriend = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const { userId } = req.params;

  await Promise.all([
    Friendship.deleteOne({ pairKey: Friendship.buildPairKey(me, userId) }),
    User.updateOne({ _id: me }, { $pull: { friends: userId } }),
    User.updateOne({ _id: userId }, { $pull: { friends: me } }),
  ]);

  emitToUser(userId, EVENTS.FRIEND_REMOVED, { userId: String(me) });
  res.json({ success: true, message: "Friend removed" });
});

// @desc   Block a user (removes the friendship too)
// @route  POST /api/friends/block   { userId }
// @access Protected
const blockUser = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const { userId } = req.body;

  await Promise.all([
    User.updateOne({ _id: me }, { $addToSet: { blocked: userId }, $pull: { friends: userId } }),
    User.updateOne({ _id: userId }, { $pull: { friends: me } }),
    Friendship.updateOne(
      { pairKey: Friendship.buildPairKey(me, userId) },
      { status: "blocked", respondedAt: new Date() }
    ),
  ]);

  res.json({ success: true, message: "User blocked" });
});

// @desc   Unblock a user
// @route  DELETE /api/friends/block/:userId
// @access Protected
const unblockUser = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { blocked: req.params.userId } });
  await Friendship.deleteOne({
    pairKey: Friendship.buildPairKey(req.user._id, req.params.userId),
    status: "blocked",
  });
  res.json({ success: true, message: "User unblocked" });
});

module.exports = {
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  listRequests,
  listFriends,
  removeFriend,
  blockUser,
  unblockUser,
};
