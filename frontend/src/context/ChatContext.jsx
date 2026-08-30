import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";
import { EV } from "../lib/events";

const ChatContext = createContext(null);
export const useChat = () => useContext(ChatContext);

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [typingIn, setTypingIn] = useState({}); // chatId -> name
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });

  // Socket handlers close over state; a ref keeps them reading the live value
  // without having to tear down and re-subscribe on every chat switch.
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current = activeChat; }, [activeChat]);

  const loadChats = useCallback(async () => {
    const { data } = await api.get("/chats");
    setChats(data.chats);
  }, []);

  const loadRequests = useCallback(async () => {
    const { data } = await api.get("/friends/requests");
    setFriendRequests({ incoming: data.incoming, outgoing: data.outgoing });
  }, []);

  useEffect(() => {
    if (!user) {
      setChats([]); setActiveChat(null); setMessages([]);
      setFriendRequests({ incoming: [], outgoing: [] });
      return;
    }
    loadChats();
    loadRequests();
  }, [user, loadChats, loadRequests]);

  /** Move a chat to the top of the sidebar and refresh its preview. */
  const bumpChat = useCallback((chatId, message) => {
    setChats((prev) => {
      const idx = prev.findIndex((c) => String(c._id) === String(chatId));
      if (idx === -1) return prev;
      const chat = { ...prev[idx], latestMessage: message, updatedAt: new Date().toISOString() };
      const isActive = String(activeRef.current?._id) === String(chatId);
      const fromMe = String(message?.sender?._id) === String(user?._id);
      if (!isActive && !fromMe) chat.unreadCount = (chat.unreadCount || 0) + 1;
      return [chat, ...prev.filter((_, i) => i !== idx)];
    });
  }, [user]);

  const openChat = useCallback(async (chat) => {
    setActiveChat(chat);
    setMessages([]);
    setCursor(null);
    setLoadingMsgs(true);
    socket?.emit(EV.JOIN_CHAT, chat._id);

    try {
      const { data } = await api.get(`/messages/${chat._id}`, { params: { limit: 30 } });
      setMessages(data.messages);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);

      await api.put(`/messages/${chat._id}/read`);
      setChats((prev) =>
        prev.map((c) => (String(c._id) === String(chat._id) ? { ...c, unreadCount: 0 } : c))
      );
    } finally {
      setLoadingMsgs(false);
    }
  }, [socket]);

  /** Infinite scroll upward: fetch the page before the oldest loaded message. */
  const loadOlder = useCallback(async () => {
    if (!activeChat || !cursor || loadingMsgs) return;
    setLoadingMsgs(true);
    try {
      const { data } = await api.get(`/messages/${activeChat._id}`, {
        params: { limit: 30, cursor },
      });
      setMessages((prev) => [...data.messages, ...prev]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } finally {
      setLoadingMsgs(false);
    }
  }, [activeChat, cursor, loadingMsgs]);

  const sendMessage = useCallback(async (content, replyTo = null) => {
    if (!activeChat || !content.trim()) return;

    // Optimistic echo: render immediately with a temp id, then reconcile with
    // the server's copy. clientId makes the send idempotent if we retry.
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = {
      _id: clientId,
      clientId,
      chat: activeChat._id,
      sender: user,
      content: content.trim(),
      type: "text",
      replyTo,
      readBy: [],
      deliveredTo: [],
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { data } = await api.post("/messages", {
        chatId: activeChat._id,
        content: content.trim(),
        replyTo: replyTo?._id || null,
        clientId,
      });
      setMessages((prev) => prev.map((m) => (m._id === clientId ? data.message : m)));
      bumpChat(activeChat._id, data.message);
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m._id === clientId ? { ...m, pending: false, failed: true } : m))
      );
    }
  }, [activeChat, user, bumpChat]);

  // ---- socket subscriptions -------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const onNew = ({ message, chatId }) => {
      const isActive = String(activeRef.current?._id) === String(chatId);
      if (isActive) {
        setMessages((prev) => {
          // Guard against the echo of our own optimistic send arriving twice.
          if (prev.some((m) => String(m._id) === String(message._id))) return prev;
          if (message.clientId && prev.some((m) => m.clientId === message.clientId)) return prev;
          return [...prev, message];
        });
        api.put(`/messages/${chatId}/read`).catch(() => {});
      }
      bumpChat(chatId, message);
    };

    const onRead = ({ chatId, readerId }) => {
      if (String(activeRef.current?._id) !== String(chatId)) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.readBy?.some((r) => String(r.user) === String(readerId))
            ? m
            : { ...m, readBy: [...(m.readBy || []), { user: readerId, at: new Date() }] }
        )
      );
    };

    const onDeleted = ({ chatId, messageId }) => {
      if (String(activeRef.current?._id) !== String(chatId)) return;
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(messageId) ? { ...m, isDeleted: true, content: "" } : m))
      );
    };

    const onTyping = ({ chatId, name }) => setTypingIn((p) => ({ ...p, [chatId]: name }));
    const onStopTyping = ({ chatId }) =>
      setTypingIn((p) => { const n = { ...p }; delete n[chatId]; return n; });

    const onChatNew = ({ chat }) =>
      setChats((prev) =>
        prev.some((c) => String(c._id) === String(chat._id)) ? prev : [chat, ...prev]
      );
    const onChatUpdated = ({ chat }) =>
      setChats((prev) => prev.map((c) => (String(c._id) === String(chat._id) ? { ...c, ...chat } : c)));

    const onFriendReq = ({ request }) =>
      setFriendRequests((p) => ({ ...p, incoming: [request, ...p.incoming] }));
    const onFriendAccepted = () => { loadRequests(); };

    socket.on(EV.MESSAGE_NEW, onNew);
    socket.on(EV.MESSAGE_READ, onRead);
    socket.on(EV.MESSAGE_DELETED, onDeleted);
    socket.on(EV.TYPING, onTyping);
    socket.on(EV.STOP_TYPING, onStopTyping);
    socket.on(EV.CHAT_NEW, onChatNew);
    socket.on(EV.CHAT_UPDATED, onChatUpdated);
    socket.on(EV.FRIEND_REQUEST_NEW, onFriendReq);
    socket.on(EV.FRIEND_REQUEST_ACCEPTED, onFriendAccepted);

    return () => {
      socket.off(EV.MESSAGE_NEW, onNew);
      socket.off(EV.MESSAGE_READ, onRead);
      socket.off(EV.MESSAGE_DELETED, onDeleted);
      socket.off(EV.TYPING, onTyping);
      socket.off(EV.STOP_TYPING, onStopTyping);
      socket.off(EV.CHAT_NEW, onChatNew);
      socket.off(EV.CHAT_UPDATED, onChatUpdated);
      socket.off(EV.FRIEND_REQUEST_NEW, onFriendReq);
      socket.off(EV.FRIEND_REQUEST_ACCEPTED, onFriendAccepted);
    };
  }, [socket, bumpChat, loadRequests]);

  return (
    <ChatContext.Provider
      value={{
        chats, setChats, activeChat, setActiveChat, openChat,
        messages, setMessages, sendMessage, loadOlder, hasMore, loadingMsgs,
        typingIn, loadChats, friendRequests, loadRequests,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
