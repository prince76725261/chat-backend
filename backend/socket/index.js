const { Server } = require("socket.io");
const User = require("../models/userModel");
const { verifyAccessToken } = require("../utils/tokens");
const { clientOrigins } = require("../config/env");
const EVENTS = require("./events");

let io = null;

/**
 * In-process presence registry: userId -> Set(socketId).
 * A user can have many sockets (phone + two browser tabs), so presence is
 * "the set is non-empty", not "a socket connected".
 *
 * NOTE: this Map is per-process. Running more than one Node instance requires
 * @socket.io/redis-adapter plus Redis-backed presence — see docs/ARCHITECTURE.md.
 */
const online = new Map();

const addSocket = (userId, socketId) => {
  if (!online.has(userId)) online.set(userId, new Set());
  online.get(userId).add(socketId);
  return online.get(userId).size;
};

const removeSocket = (userId, socketId) => {
  const set = online.get(userId);
  if (!set) return 0;
  set.delete(socketId);
  if (!set.size) online.delete(userId);
  return set.size;
};

const isOnline = (userId) => online.has(String(userId));
const onlineUserIds = () => [...online.keys()];

/** Every socket auto-joins a room named after its user id, so we can address a
 *  person rather than a connection and reach all their devices at once. */
const emitToUser = (userId, event, payload) => {
  if (io) io.to(String(userId)).emit(event, payload);
};

const emitToUsers = (userIds, event, payload) => {
  userIds.forEach((id) => emitToUser(id, event, payload));
};

const initSocket = (server) => {
  io = new Server(server, {
    pingTimeout: 60000,
    cors: {
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        const ok =
          clientOrigins.includes(origin) ||
          /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
        cb(ok ? null : new Error("Origin not allowed"), ok);
      },
      credentials: true,
    },
  });

  // Authenticate at the handshake. An unauthenticated socket is never allowed
  // to exist, so no event handler has to re-check identity.
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || "").replace("Bearer ", "");
      if (!token) return next(new Error("Missing auth token"));

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select("_id name username avatar friends");
      if (!user) return next(new Error("User not found"));

      socket.userId = String(user._id);
      socket.user = user;
      next();
    } catch {
      next(new Error("Unauthorized socket connection"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    const count = addSocket(userId, socket.id);
    socket.join(userId);

    // First socket for this user => they just came online. Tell their friends.
    if (count === 1) {
      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
      emitToUsers(socket.user.friends, EVENTS.PRESENCE_ONLINE, { userId });
    }

    // Let the freshly connected client paint presence dots immediately.
    socket.emit(EVENTS.PRESENCE_SNAPSHOT, {
      online: socket.user.friends.map(String).filter(isOnline),
    });

    socket.on(EVENTS.JOIN_CHAT, (chatId) => chatId && socket.join(`chat:${chatId}`));
    socket.on(EVENTS.LEAVE_CHAT, (chatId) => chatId && socket.leave(`chat:${chatId}`));

    socket.on(EVENTS.TYPING, ({ chatId }) => {
      if (!chatId) return;
      socket.to(`chat:${chatId}`).emit(EVENTS.TYPING, {
        chatId,
        userId,
        name: socket.user.name,
      });
    });

    socket.on(EVENTS.STOP_TYPING, ({ chatId }) => {
      if (!chatId) return;
      socket.to(`chat:${chatId}`).emit(EVENTS.STOP_TYPING, { chatId, userId });
    });

    socket.on("disconnect", async () => {
      const left = removeSocket(userId, socket.id);
      // Only go offline when the user's *last* device disconnects.
      if (left === 0) {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
        emitToUsers(socket.user.friends, EVENTS.PRESENCE_OFFLINE, { userId, lastSeen });
      }
    });
  });

  console.log("[socket] initialised");
  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO, emitToUser, emitToUsers, isOnline, onlineUserIds };
