import { useEffect, useRef, useState } from "react";
import { useChat } from "../context/ChatContext";
import { useSocket } from "../context/SocketContext";
import { EV } from "../lib/events";
import { Send, X } from "./Icons";

const EMOJI = ["😀","😂","🥹","😍","😎","🤔","👍","🙏","🎉","🔥","❤️","😢","😮","🥳","💯","👏"];

export default function MessageInput({ replyTo, onClearReply }) {
  const { activeChat, sendMessage } = useChat();
  const { socket } = useSocket();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const typingRef = useRef(false);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { if (replyTo) inputRef.current?.focus(); }, [replyTo]);

  // Emit "typing" once, then a debounced "stop typing" — not one event per key.
  const signalTyping = () => {
    if (!socket || !activeChat) return;
    if (!typingRef.current) {
      typingRef.current = true;
      socket.emit(EV.TYPING, { chatId: activeChat._id });
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      typingRef.current = false;
      socket.emit(EV.STOP_TYPING, { chatId: activeChat._id });
    }, 1500);
  };

  const stopTyping = () => {
    clearTimeout(timerRef.current);
    if (typingRef.current && socket && activeChat) {
      typingRef.current = false;
      socket.emit(EV.STOP_TYPING, { chatId: activeChat._id });
    }
  };

  // Leaving the chat while "typing" is latched would strand the indicator on
  // the other side, so always release it on unmount / chat switch.
  useEffect(() => stopTyping, [activeChat]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    sendMessage(body, replyTo);
    setText("");
    setShowEmoji(false);
    onClearReply?.();
    stopTyping();
  };

  return (
    <div className="border-t border-wa-border bg-wa-sidebar dark:border-wa-borderDark dark:bg-wa-sidebarDark">
      {replyTo && (
        <div className="flex items-start gap-2 border-l-4 border-wa-green bg-black/5 px-4 py-2 dark:bg-white/5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-wa-green">{replyTo.sender?.name}</p>
            <p className="truncate text-xs text-wa-muted dark:text-wa-mutedDark">{replyTo.content}</p>
          </div>
          <button onClick={onClearReply} className="icon-btn h-7 w-7"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showEmoji && (
        <div className="flex flex-wrap gap-1 border-b border-wa-border px-3 py-2 dark:border-wa-borderDark">
          {EMOJI.map((e) => (
            <button key={e} onClick={() => { setText((t) => t + e); inputRef.current?.focus(); }}
              className="rounded p-1 text-xl transition hover:bg-black/5 dark:hover:bg-white/10">{e}</button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setShowEmoji((v) => !v)}
          className="icon-btn text-xl" aria-label="Emoji">😊</button>

        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => { setText(e.target.value); signalTyping(); }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line.
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          placeholder="Type a message"
          className="max-h-32 flex-1 resize-none rounded-lg bg-white px-3.5 py-2.5 text-sm outline-none dark:bg-wa-panelDark dark:text-wa-textDark"
          style={{ height: "auto" }}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
          }}
        />

        <button type="submit" disabled={!text.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-wa-green text-white transition hover:bg-wa-greenDark disabled:opacity-50"
          aria-label="Send">
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
