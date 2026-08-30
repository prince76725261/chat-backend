/**
 * Single source of truth for wire event names, imported by both the server and
 * (mirrored in) the client. Typos in a string literal are the classic realtime
 * bug — this file makes them a crash instead of silence.
 */
module.exports = {
  // client -> server
  JOIN_CHAT: "chat:join",
  LEAVE_CHAT: "chat:leave",

  // bidirectional
  TYPING: "typing",
  STOP_TYPING: "typing:stop",

  // server -> client
  MESSAGE_NEW: "message:new",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_READ: "message:read",
  MESSAGE_DELETED: "message:deleted",

  CHAT_NEW: "chat:new",
  CHAT_UPDATED: "chat:updated",

  FRIEND_REQUEST_NEW: "friend:request",
  FRIEND_REQUEST_ACCEPTED: "friend:accepted",
  FRIEND_REMOVED: "friend:removed",

  PRESENCE_ONLINE: "presence:online",
  PRESENCE_OFFLINE: "presence:offline",
  PRESENCE_SNAPSHOT: "presence:snapshot",
};
