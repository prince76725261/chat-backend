const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 60 },
    isGroupChat: { type: Boolean, default: false },
    avatar: { type: String, default: "" },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    latestMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },

    // Same idea as Friendship.pairKey: guarantees exactly one 1:1 chat per pair
    // even under concurrent "open chat" taps from both sides.
    pairKey: { type: String, default: null },
  },
  { timestamps: true }
);

// The sidebar query: "my chats, most recently active first".
chatSchema.index({ users: 1, updatedAt: -1 });

// Partial unique index: applies only to 1:1 chats, group chats keep pairKey null.
chatSchema.index(
  { pairKey: 1 },
  { unique: true, partialFilterExpression: { pairKey: { $type: "string" } } }
);

chatSchema.statics.buildPairKey = function (a, b) {
  return [String(a), String(b)].sort().join("_");
};

module.exports = mongoose.model("Chat", chatSchema);
