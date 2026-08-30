const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const Friendship = require("../models/friendshipModel");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// @desc   Search people by name / username / email
// @route  GET /api/users?search=&limit=
// @access Protected
const searchUsers = asyncHandler(async (req, res) => {
  const term = (req.query.search || "").trim();
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  if (!term) return res.json({ success: true, users: [] });

  // Escaped so a user typing "a(b" can't blow up the regex engine.
  const rx = new RegExp(escapeRegex(term), "i");

  const users = await User.find({
    _id: { $ne: req.user._id },
    $or: [{ name: rx }, { username: rx }, { email: rx }],
  })
    .limit(limit)
    .select("name username email avatar about isOnline lastSeen");

  // Annotate each result with the relationship, so the UI can render the right
  // button (Add / Pending / Message) without an extra round trip per row.
  const ids = users.map((u) => u._id);
  const links = await Friendship.find({
    pairKey: { $in: ids.map((id) => Friendship.buildPairKey(req.user._id, id)) },
  });
  const byPair = new Map(links.map((l) => [l.pairKey, l]));

  const annotated = users.map((u) => {
    const link = byPair.get(Friendship.buildPairKey(req.user._id, u._id));
    let relation = "none";
    if (link?.status === "accepted") relation = "friends";
    else if (link?.status === "pending") {
      relation = String(link.requester) === String(req.user._id) ? "outgoing" : "incoming";
    }
    return { ...u.toObject(), relation, requestId: link?._id ?? null };
  });

  res.json({ success: true, users: annotated });
});

// @desc   Fetch one profile
// @route  GET /api/users/:userId
// @access Protected
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select(
    "name username email avatar about isOnline lastSeen"
  );
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, user });
});

// @desc   Update my own profile
// @route  PUT /api/users/me
// @access Protected
const updateProfile = asyncHandler(async (req, res) => {
  const { name, about, avatar } = req.body;
  if (name !== undefined) req.user.name = name;
  if (about !== undefined) req.user.about = about;
  if (avatar !== undefined) req.user.avatar = avatar;

  await req.user.save();
  res.json({ success: true, user: req.user.toPublic() });
});

module.exports = { searchUsers, getUser, updateProfile };
