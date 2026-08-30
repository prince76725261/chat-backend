const mongoose = require("mongoose");

/**
 * One document per relationship, not two. `requester` is whoever sent the
 * request; direction matters for "incoming vs outgoing" but the pair is
 * deduplicated by a normalised `pairKey`, so A->B and B->A can never both exist.
 */
const friendshipSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
      index: true,
    },
    // "<smallerId>_<largerId>" — order-independent identity for the pair.
    pairKey: { type: String, required: true, unique: true },
    respondedAt: Date,
  },
  { timestamps: true }
);

friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

friendshipSchema.statics.buildPairKey = function (a, b) {
  return [String(a), String(b)].sort().join("_");
};

module.exports = mongoose.model("Friendship", friendshipSchema);
