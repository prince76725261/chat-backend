const mongoose = require("mongoose");

const receiptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, trim: true, maxlength: 4000 },
    type: { type: String, enum: ["text", "image", "system"], default: "text" },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },

    // WhatsApp's tick model: sent (one tick) -> delivered (two grey) -> read (two blue).
    deliveredTo: [receiptSchema],
    readBy: [receiptSchema],

    // Soft delete. "Delete for me" adds to deletedFor; "delete for everyone"
    // sets isDeleted and blanks content but keeps the row for ordering.
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isDeleted: { type: Boolean, default: false },

    // Idempotency key from the client so a retried send never duplicates.
    clientId: { type: String, default: null },
  },
  { timestamps: true }
);

// The single most important index in the app: paginate one chat's history
// newest-first. Compound so the sort is served by the index, not in memory.
messageSchema.index({ chat: 1, createdAt: -1, _id: -1 });
messageSchema.index(
  { chat: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: "string" } } }
);

module.exports = mongoose.model("Message", messageSchema);
