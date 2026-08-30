import { format, isToday, isYesterday, isThisWeek } from "date-fns";

/** Sidebar timestamp: time today, "Yesterday", weekday this week, else a date. */
export const listTime = (d) => {
  if (!d) return "";
  const date = new Date(d);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "dd/MM/yyyy");
};

export const bubbleTime = (d) => (d ? format(new Date(d), "HH:mm") : "");

export const dayDivider = (d) => {
  const date = new Date(d);
  if (isToday(date)) return "TODAY";
  if (isYesterday(date)) return "YESTERDAY";
  return format(date, "d MMMM yyyy").toUpperCase();
};

export const lastSeenText = (user, online) => {
  if (online) return "online";
  if (!user?.lastSeen) return "";
  const d = new Date(user.lastSeen);
  return isToday(d)
    ? `last seen today at ${format(d, "HH:mm")}`
    : `last seen ${format(d, "d MMM 'at' HH:mm")}`;
};

/** The other participant of a 1:1 chat. */
export const otherUser = (chat, meId) =>
  chat?.users?.find((u) => String(u._id) !== String(meId)) || chat?.users?.[0];

export const chatTitle = (chat, meId) =>
  chat?.isGroupChat ? chat.name : otherUser(chat, meId)?.name || "Unknown";

export const chatAvatar = (chat, meId) =>
  chat?.isGroupChat ? chat.avatar : otherUser(chat, meId)?.avatar;

export const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
