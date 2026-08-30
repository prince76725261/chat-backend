import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useSocket } from "../context/SocketContext";
import { chatTitle, chatAvatar, listTime, otherUser } from "../lib/format";
import Avatar from "./Avatar";
import { Search, Ticks } from "./Icons";

export default function ChatList() {
  const { user } = useAuth();
  const { chats, activeChat, openChat, typingIn } = useChat();
  const { isOnline } = useSocket();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter((c) => chatTitle(c, user._id).toLowerCase().includes(term));
  }, [chats, q, user]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wa-muted dark:text-wa-mutedDark" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or start a new chat"
            className="w-full rounded-lg bg-white py-2 pl-9 pr-3 text-sm outline-none dark:bg-wa-panelDark dark:text-wa-textDark"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-wa-muted dark:text-wa-mutedDark">
            {chats.length === 0
              ? "No conversations yet. Add a friend from the Friends tab to start chatting."
              : "No chats match that search."}
          </p>
        )}

        {filtered.map((chat) => {
          const other = otherUser(chat, user._id);
          const active = String(activeChat?._id) === String(chat._id);
          const typing = typingIn[chat._id];
          const last = chat.latestMessage;
          const mine = String(last?.sender?._id) === String(user._id);

          return (
            <button
              key={chat._id}
              onClick={() => openChat(chat)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition
                ${active ? "bg-wa-hover dark:bg-wa-hoverDark" : "hover:bg-wa-hover dark:hover:bg-wa-hoverDark/60"}`}
            >
              <Avatar
                src={chatAvatar(chat, user._id)}
                name={chatTitle(chat, user._id)}
                online={!chat.isGroupChat && isOnline(other?._id)}
              />

              <div className="min-w-0 flex-1 border-b border-wa-border pb-2.5 dark:border-wa-borderDark">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{chatTitle(chat, user._id)}</span>
                  <span className={`shrink-0 text-[11px] ${chat.unreadCount ? "text-wa-green" : "text-wa-muted dark:text-wa-mutedDark"}`}>
                    {listTime(last?.createdAt || chat.updatedAt)}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-sm text-wa-muted dark:text-wa-mutedDark">
                    {typing ? (
                      <em className="not-italic text-wa-green">
                        {chat.isGroupChat ? `${typing} is typing…` : "typing…"}
                      </em>
                    ) : (
                      <>
                        {mine && last && !last.isDeleted && (
                          <Ticks read={(last.readBy?.length || 0) > 1} className="h-3 w-4 shrink-0" />
                        )}
                        <span className="truncate">
                          {last?.isDeleted
                            ? "This message was deleted"
                            : last
                            ? `${chat.isGroupChat && !mine && last.sender ? last.sender.name.split(" ")[0] + ": " : ""}${last.content}`
                            : "Say hello 👋"}
                        </span>
                      </>
                    )}
                  </span>

                  {chat.unreadCount > 0 && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-wa-green px-1.5 text-[11px] font-semibold text-white">
                      {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
