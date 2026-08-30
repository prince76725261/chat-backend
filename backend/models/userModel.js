const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_.]+$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select:false so no query can leak the hash by accident. Login opts back in.
    password: { type: String, required: true, select: false },
    avatar: {
      type: String,
      default: "",
    },
    about: { type: String, default: "Hey there! I am using ChatApp.", maxlength: 140 },

    // Denormalised friend list: the hot read ("is X my friend?", "show my
    // friends") happens on every chat open, so we keep it on the user doc and
    // treat the Friendship collection as the source of truth for state changes.
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    blocked: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Text-ish search over name/username/email is served by these.
userSchema.index({ name: "text", username: "text" });

userSchema.pre("save", async function (next) {
  // Only re-hash when the password actually changed, otherwise every profile
  // update would double-hash and lock the user out.
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    name: this.name,
    username: this.username,
    email: this.email,
    avatar: this.avatar,
    about: this.about,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen,
  };
};

module.exports = mongoose.model("User", userSchema);
