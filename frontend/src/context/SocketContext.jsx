import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getAccessToken, API_ORIGIN } from "../api/client";
import { useAuth } from "./AuthContext";
import { EV } from "../lib/events";

const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.close();
      socketRef.current = null;
      setSocket(null);
      setOnlineIds(new Set());
      return;
    }

    // Empty string => same origin, which is what the Vite proxy gives us in dev.
    const s = io(API_ORIGIN, {
      // The server authenticates the handshake, so the token goes here rather
      // than in a header (browsers cannot set headers on a WebSocket upgrade).
      auth: { token: getAccessToken() },
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
    });

    // On reconnect the old access token may have expired; hand over the current
    // one so the handshake does not fail in a loop.
    s.io.on("reconnect_attempt", () => { s.auth = { token: getAccessToken() }; });

    s.on(EV.PRESENCE_SNAPSHOT, ({ online }) => setOnlineIds(new Set(online.map(String))));
    s.on(EV.PRESENCE_ONLINE, ({ userId }) =>
      setOnlineIds((prev) => new Set(prev).add(String(userId)))
    );
    s.on(EV.PRESENCE_OFFLINE, ({ userId }) =>
      setOnlineIds((prev) => {
        const next = new Set(prev);
        next.delete(String(userId));
        return next;
      })
    );

    socketRef.current = s;
    setSocket(s);
    return () => { s.close(); socketRef.current = null; };
  }, [user]);

  const isOnline = (id) => onlineIds.has(String(id));

  return (
    <SocketContext.Provider value={{ socket, onlineIds, isOnline }}>
      {children}
    </SocketContext.Provider>
  );
}
