import { useState } from "react";
import { bubbleTime } from "../lib/format";
import { Ticks, Trash, Reply } from "./Icons";

export default function MessageBubble({ message, mine, showAuthor, isGroup, onDelete, onReply }) {
  const [menu, setMenu] = useState(false);

  // Read = somebody other than the sender is in readBy.
  const readByOther = (message.readBy || []).some(
    (r) => String(r.user?._id || r.user) !== String(message.sender?._id)
  );
  const delivered = (message.deliveredTo || []).length > 0;

  if (message.isDeleted) {
    return (
      <Row mine={mine}>
        <div className="rounded-lg bg-black/5 px-3 py-2 text-sm italic text-wa-muted dark:bg-white/5 dark:text-wa-mutedDark">
          🚫 This message was deleted
        </div>
      </Row>
    );
  }

  return (
    <Row mine={mine}>
      <div
        onMouseLeave={() => setMenu(false)}
        className={`group relative max-w-[75%] rounded-lg px-2.5 py-1.5 shadow-sm animate-fade-up
          ${mine
            ? "bg-wa-bubble dark:bg-wa-bubbleDark dark:text-wa-textDark"
            : "bg-white dark:bg-wa-sidebarDark dark:text-wa-textDark"}
          ${showAuthor ? (mine ? "rounded-tr-none bubble-tail-out" : "rounded-tl-none bubble-tail-in") : ""}`}
      >
        {showAuthor && isGroup && !mine && (
          <p className="mb-0.5 text-xs font-semibold text-wa-green">{message.sender?.name}</p>
        )}

        {message.replyTo && (
          <div className="mb-1 rounded border-l-4 border-wa-green bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
            <p className="font-medium text-wa-green">{message.replyTo.sender?.name || "Reply"}</p>
            <p className="line-clamp-2 text-wa-muted dark:text-wa-mutedDark">{message.replyTo.content}</p>
          </div>
        )}

        {/* pr reserves room for the timestamp so it never overlaps the text. */}
        <p className="whitespace-pre-wrap break-words pr-14 text-[14.5px] leading-[1.35]">
          {message.content}
        </p>

        <span className="float-right -mt-3 ml-2 flex select-none items-center gap-1 text-[10.5px] text-wa-muted dark:text-wa-mutedDark">
          {bubbleTime(message.createdAt)}
          {mine && (
            message.failed ? <span className="text-red-500">!</span>
              : message.pending ? <Clock />
              : <Ticks read={readByOther} double={delivered || readByOther} className="h-3 w-4" />
          )}
        </span>

        <button
          onClick={() => setMenu((v) => !v)}
          className="absolute -top-2 right-1 hidden h-6 w-6 place-items-center rounded-full bg-black/10 text-xs group-hover:grid dark:bg-white/15"
          aria-label="Message options"
        >⌄</button>

        {menu && (
          <div className={`absolute top-5 z-10 w-40 overflow-hidden rounded-lg border border-wa-border bg-white text-sm shadow-lg dark:border-wa-borderDark dark:bg-wa-sidebarDark ${mine ? "right-0" : "left-0"}`}>
            <button
              onClick={() => { onReply(message); setMenu(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-wa-hover dark:hover:bg-wa-hoverDark">
              <Reply className="h-4 w-4" /> Reply
            </button>
            <button
              onClick={() => { onDelete(message, "me"); setMenu(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-wa-hover dark:hover:bg-wa-hoverDark">
              <Trash className="h-4 w-4" /> Delete for me
            </button>
            {mine && (
              <button
                onClick={() => { onDelete(message, "everyone"); setMenu(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-red-500 hover:bg-wa-hover dark:hover:bg-wa-hoverDark">
                <Trash className="h-4 w-4" /> Delete for everyone
              </button>
            )}
          </div>
        )}
      </div>
    </Row>
  );
}

const Row = ({ mine, children }) => (
  <div className={`flex px-2 ${mine ? "justify-end" : "justify-start"}`}>{children}</div>
);

const Clock = () => (
  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
