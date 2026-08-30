import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useSocket } from "../context/SocketContext";
import { chatTitle, chatAvatar, dayDivider, lastSeenText, otherUser } from "../lib/format";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { Back, Users } from "./Icons";

const sameDay = (a, b) =>
  a && b && new Date(a).toDateString() === new Date(b).toDateString();

export default function ChatWindow({ onBack }) {
  const { user } = useAuth();
  const { activeChat, messages, setMessages, typingIn, hasMore, loadOlder, loadingMsgs } = useChat();
  const { isOnline } = useSocket();
  const [replyTo, setReplyTo] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const prevHeight = useRef(0);
  const pinnedToBottom = useRef(true);

  const other = activeChat ? otherUser(activeChat, user._id) : null;
  const typing = activeChat ? typingIn[activeChat._id] : null;

  // Only auto-scroll when the user is already at the bottom; yanking them down
  // while they read history is the classic chat-UI annoyance.
  useEffect(() => {
    if (pinnedToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, typing]);

  // Prepending older messages shifts the viewport; restore the offset so the
  // message the user was reading stays under the cursor.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !prevHeight.current) return;
    if (el.scrollHeight > prevHeight.current && el.scrollTop < 80) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
    }
    prevHeight.current = 0;
  }, [messages]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 60 && hasMore && !loadingMsgs) {
      prevHeight.current = el.scrollHeight;
      loadOlder();
    }
  };

  useEffect(() => { setReplyTo(null); pinnedToBottom.current = true; }, [activeChat?._id]);

  const handleDelete = async (message, scope) => {
    try {
      await api.delete(`/messages/${message._id}`, { params: { scope } });
      setMessages((prev) =>
        scope === "everyone"
          ? prev.map((m) => (m._id === message._id ? { ...m, isDeleted: true, content: "" } : m))
          : prev.filter((m) => m._id !== message._id)
      );
    } catch { /* the server rejected it; leave the message as-is */ }
  };

  if (!activeChat) return <Placeholder />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-wa-border bg-wa-sidebar px-3 py-2 dark:border-wa-borderDark dark:bg-wa-sidebarDark">
        <button onClick={onBack} className="icon-btn md:hidden" aria-label="Back">
          <Back className="h-5 w-5" />
        </button>

        <button onClick={() => setShowInfo((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar
            src={chatAvatar(activeChat, user._id)}
            name={chatTitle(activeChat, user._id)}
            size={40}
            online={!activeChat.isGroupChat && isOnline(other?._id)}
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{chatTitle(activeChat, user._id)}</p>
            <p className="truncate text-xs text-wa-muted dark:text-wa-mutedDark">
              {typing ? (
                <span className="text-wa-green">
                  {activeChat.isGroupChat ? `${typing} is typing…` : "typing…"}
                </span>
              ) : activeChat.isGroupChat ? (
                activeChat.users.map((u) => (String(u._id) === String(user._id) ? "You" : u.name.split(" ")[0])).join(", ")
              ) : (
                lastSeenText(other, isOnline(other?._id))
              )}
            </p>
          </div>
        </button>

        {activeChat.isGroupChat && (
          <span className="flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs text-wa-muted dark:bg-white/10 dark:text-wa-mutedDark">
            <Users className="h-3.5 w-3.5" /> {activeChat.users.length}
          </span>
        )}
      </header>

      {showInfo && (
        <div className="border-b border-wa-border bg-white px-4 py-3 text-sm dark:border-wa-borderDark dark:bg-wa-panelDark">
          {activeChat.isGroupChat ? (
            <>
              <p className="mb-1 font-medium">Members</p>
              <ul className="space-y-1 text-wa-muted dark:text-wa-mutedDark">
                {activeChat.users.map((u) => (
                  <li key={u._id}>
                    @{u.username}
                    {activeChat.admins?.some((a) => String(a._id || a) === String(u._id)) && (
                      <span className="ml-2 rounded bg-wa-green/15 px-1.5 text-[10px] text-wa-greenDark dark:text-wa-bubble">admin</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="font-medium">@{other?.username}</p>
              <p className="text-wa-muted dark:text-wa-mutedDark">{other?.about}</p>
            </>
          )}
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="chat-wallpaper flex-1 space-y-1 overflow-y-auto py-3">
        {hasMore && (
          <p className="py-2 text-center text-xs text-wa-muted dark:text-wa-mutedDark">
            {loadingMsgs ? "Loading earlier messages…" : "Scroll up for older messages"}
          </p>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = String(m.sender?._id) === String(user._id);
          // Start a new "cluster" when the day or the author changes.
          const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const showAuthor = newDay || String(prev?.sender?._id) !== String(m.sender?._id);

          return (
            <div key={m._id}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium text-wa-muted shadow-sm dark:bg-wa-sidebarDark dark:text-wa-mutedDark">
                    {dayDivider(m.createdAt)}
                  </span>
                </div>
              )}
              <div className={showAuthor ? "mt-2" : ""}>
                <MessageBubble
                  message={m}
                  mine={mine}
                  showAuthor={showAuthor}
                  isGroup={activeChat.isGroupChat}
                  onDelete={handleDelete}
                  onReply={setReplyTo}
                />
              </div>
            </div>
          );
        })}

        {typing && (
          <div className="flex px-2">
            <div className="flex gap-1 rounded-lg bg-white px-3 py-2.5 shadow-sm dark:bg-wa-sidebarDark">
              {[0, 0.2, 0.4].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-blink rounded-full bg-wa-muted dark:bg-wa-mutedDark"
                  style={{ animationDelay: `${d}s` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <MessageInput replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
    </div>
  );
}

const Placeholder = () => (
  <div className="flex h-full flex-col items-center justify-center border-l border-wa-border bg-wa-sidebar px-8 text-center dark:border-wa-borderDark dark:bg-[#222e35]">
    <div className="mb-6 grid h-28 w-28 place-items-center rounded-full bg-wa-green/10 text-5xl">💬</div>
    <h2 className="text-2xl font-light text-wa-text dark:text-wa-textDark">ChatApp for Web</h2>
    <p className="mt-3 max-w-md text-sm text-wa-muted dark:text-wa-mutedDark">
      Pick a conversation from the left, or add a friend to start a new one.
      Messages are delivered in real time over a WebSocket.
    </p>
  </div>
);
