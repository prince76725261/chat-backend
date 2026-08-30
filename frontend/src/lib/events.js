// Mirrors backend/socket/events.js — keep the two in sync.
export const EV = {
  JOIN_CHAT: "chat:join",
  LEAVE_CHAT: "chat:leave",
  TYPING: "typing",
  STOP_TYPING: "typing:stop",
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
