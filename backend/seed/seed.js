/**
 * Development seed: wipes the collections and creates a small social graph so
 * the UI has something to show. Never run this against production data.
 *
 *   npm run seed
 */
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const Friendship = require("../models/friendshipModel");

const PASSWORD = "Password123";

const PEOPLE = [
  { name: "Prince Agarwal", username: "prince", email: "prince@demo.com", about: "Building things." },
  { name: "Aisha Khan", username: "aisha", email: "aisha@demo.com", about: "Coffee first." },
  { name: "Rohit Sharma", username: "rohit", email: "rohit@demo.com", about: "Available" },
  { name: "Meera Nair", username: "meera", email: "meera@demo.com", about: "At the gym 🏋️" },
  { name: "Sam Okafor", username: "sam", email: "sam@demo.com", about: "Busy" },
];

const avatarFor = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=25D366&color=fff&bold=true`;

(async () => {
  await connectDB();
  console.log("[seed] clearing collections…");
  await Promise.all([
    User.deleteMany({}),
    Chat.deleteMany({}),
    Message.deleteMany({}),
    Friendship.deleteMany({}),
  ]);

  // create() (not insertMany) so the pre-save hook hashes each password.
  const users = [];
  for (const p of PEOPLE) {
    users.push(await User.create({ ...p, password: PASSWORD, avatar: avatarFor(p.name) }));
  }
  console.log(`[seed] created ${users.length} users`);

  const [prince, aisha, rohit, meera] = users;

  // Prince is friends with Aisha and Rohit; Meera has a pending request out.
  const befriend = async (a, b) => {
    await Friendship.create({
      requester: a._id,
      recipient: b._id,
      pairKey: Friendship.buildPairKey(a._id, b._id),
      status: "accepted",
      respondedAt: new Date(),
    });
    await User.updateOne({ _id: a._id }, { $addToSet: { friends: b._id } });
    await User.updateOne({ _id: b._id }, { $addToSet: { friends: a._id } });
  };

  await befriend(prince, aisha);
  await befriend(prince, rohit);
  await befriend(aisha, rohit);

  await Friendship.create({
    requester: meera._id,
    recipient: prince._id,
    pairKey: Friendship.buildPairKey(meera._id, prince._id),
    status: "pending",
  });
  console.log("[seed] friendships + 1 pending request created");

  // One 1:1 conversation with a little history.
  const dm = await Chat.create({
    isGroupChat: false,
    users: [prince._id, aisha._id],
    pairKey: Chat.buildPairKey(prince._id, aisha._id),
  });

  const script = [
    [aisha, "Hey Prince! Did you get the designs?"],
    [prince, "Just opened them — the chat list looks great 👌"],
    [aisha, "Thanks! I softened the bubble corners a bit."],
    [prince, "Noticed. Shipping it today."],
  ];

  let last;
  for (const [sender, content] of script) {
    last = await Message.create({
      chat: dm._id,
      sender: sender._id,
      content,
      readBy: [{ user: sender._id }],
    });
  }
  await Chat.updateOne({ _id: dm._id }, { latestMessage: last._id });

  // One group.
  const group = await Chat.create({
    name: "Weekend Plans",
    isGroupChat: true,
    users: [prince._id, aisha._id, rohit._id],
    admins: [prince._id],
  });
  const gm = await Message.create({
    chat: group._id,
    sender: rohit._id,
    content: "Trek on Saturday? 🥾",
    readBy: [{ user: rohit._id }],
  });
  await Chat.updateOne({ _id: group._id }, { latestMessage: gm._id });

  console.log("[seed] chats + messages created");
  console.log(`\n  Log in with any of these — password: ${PASSWORD}`);
  PEOPLE.forEach((p) => console.log(`    ${p.email}  (@${p.username})`));
  console.log();

  await mongoose.connection.close();
  process.exit(0);
})().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
