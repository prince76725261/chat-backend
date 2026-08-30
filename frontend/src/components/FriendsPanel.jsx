import { useCallback, useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useSocket } from "../context/SocketContext";
import Avatar from "./Avatar";
import { Search, Check, X, UserPlus, Chats } from "./Icons";

const TABS = ["Friends", "Requests", "Find people"];

export default function FriendsPanel() {
  const { user } = useAuth();
  const { openChat, loadChats, friendRequests, loadRequests, chats } = useChat();
  const { isOnline } = useSocket();

  const [tab, setTab] = useState("Friends");
  const [friends, setFriends] = useState([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [notice, setNotice] = useState("");

  const loadFriends = useCallback(async () => {
    const { data } = await api.get("/friends");
    setFriends(data.friends);
  }, []);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  // Debounced search so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (tab !== "Find people") return;
    const term = q.trim();
    if (!term) { setResults([]); return; }

    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/users", { params: { search: term } });
        setResults(data.users);
      } catch (e) { setNotice(errMsg(e)); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, tab]);

  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(""), 2500); };

  const act = async (fn, okMsg) => {
    try {
      await fn();
      await Promise.all([loadFriends(), loadRequests()]);
      if (q.trim()) {
        const { data } = await api.get("/users", { params: { search: q.trim() } });
        setResults(data.users);
      }
      flash(okMsg);
    } catch (e) { flash(errMsg(e)); }
  };

  const startChat = async (friend) => {
    try {
      // Reuse the existing conversation if the sidebar already has it.
      const existing = chats.find(
        (c) => !c.isGroupChat && c.users.some((u) => String(u._id) === String(friend._id))
      );
      if (existing) return openChat(existing);

      const { data } = await api.post("/chats", { userId: friend._id });
      await loadChats();
      openChat(data.chat);
    } catch (e) { flash(errMsg(e)); }
  };

  const pendingCount = friendRequests.incoming.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 rounded-lg px-2 py-2 text-xs font-medium transition
              ${tab === t
                ? "bg-wa-green/12 text-wa-greenDark dark:bg-wa-green/20 dark:text-wa-bubble"
                : "text-wa-muted hover:bg-black/5 dark:text-wa-mutedDark dark:hover:bg-white/10"}`}
          >
            {t}
            {t === "Requests" && pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-wa-green px-1.5 text-[10px] font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <p className="mx-3 mt-2 rounded-lg bg-wa-green/10 px-3 py-1.5 text-xs text-wa-greenDark dark:text-wa-bubble">
          {notice}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-1 py-2">
        {tab === "Friends" && (
          friends.length === 0 ? (
            <Empty text="No friends yet. Use “Find people” to send a request." />
          ) : friends.map((f) => (
            <Row key={f._id} person={f} online={isOnline(f._id)}>
              <button onClick={() => startChat(f)} className="icon-btn text-wa-green" title="Message">
                <Chats className="h-5 w-5" />
              </button>
            </Row>
          ))
        )}

        {tab === "Requests" && (
          <>
            <Section label={`Incoming (${friendRequests.incoming.length})`} />
            {friendRequests.incoming.length === 0 && <Empty text="No incoming requests." />}
            {friendRequests.incoming.map((r) => (
              <Row key={r._id} person={r.requester} online={isOnline(r.requester?._id)}>
                <button
                  onClick={() => act(() => api.put(`/friends/request/${r._id}/accept`), "Friend added")}
                  className="icon-btn text-wa-green" title="Accept">
                  <Check className="h-5 w-5" />
                </button>
                <button
                  onClick={() => act(() => api.put(`/friends/request/${r._id}/reject`), "Request rejected")}
                  className="icon-btn text-red-500" title="Reject">
                  <X className="h-5 w-5" />
                </button>
              </Row>
            ))}

            <Section label={`Sent (${friendRequests.outgoing.length})`} />
            {friendRequests.outgoing.length === 0 && <Empty text="No pending sent requests." />}
            {friendRequests.outgoing.map((r) => (
              <Row key={r._id} person={r.recipient} online={isOnline(r.recipient?._id)}>
                <button
                  onClick={() => act(() => api.delete(`/friends/request/${r._id}`), "Request cancelled")}
                  className="rounded-lg px-2 py-1 text-xs text-wa-muted hover:bg-black/5 dark:text-wa-mutedDark dark:hover:bg-white/10">
                  Cancel
                </button>
              </Row>
            ))}
          </>
        )}

        {tab === "Find people" && (
          <>
            <div className="relative mx-2 mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wa-muted dark:text-wa-mutedDark" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                placeholder="Search by name, @username or email"
                className="w-full rounded-lg bg-white py-2 pl-9 pr-3 text-sm outline-none dark:bg-wa-panelDark dark:text-wa-textDark"
              />
            </div>

            {!q.trim() && <Empty text="Start typing to find people." />}
            {q.trim() && results.length === 0 && <Empty text="Nobody matched that search." />}

            {results.map((p) => (
              <Row key={p._id} person={p} online={isOnline(p._id)}>
                {p.relation === "friends" && (
                  <button onClick={() => startChat(p)} className="icon-btn text-wa-green" title="Message">
                    <Chats className="h-5 w-5" />
                  </button>
                )}
                {p.relation === "none" && (
                  <button
                    onClick={() => act(() => api.post("/friends/request", { userId: p._id }), "Request sent")}
                    className="icon-btn text-wa-green" title="Add friend">
                    <UserPlus className="h-5 w-5" />
                  </button>
                )}
                {p.relation === "outgoing" && (
                  <span className="text-xs text-wa-muted dark:text-wa-mutedDark">Pending</span>
                )}
                {p.relation === "incoming" && (
                  <button
                    onClick={() => act(() => api.put(`/friends/request/${p.requestId}/accept`), "Friend added")}
                    className="rounded-lg bg-wa-green px-2.5 py-1 text-xs font-medium text-white">
                    Accept
                  </button>
                )}
              </Row>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const Section = ({ label }) => (
  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-wa-muted dark:text-wa-mutedDark">
    {label}
  </p>
);

const Empty = ({ text }) => (
  <p className="px-6 py-6 text-center text-sm text-wa-muted dark:text-wa-mutedDark">{text}</p>
);

const Row = ({ person, online, children }) => (
  <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-wa-hover dark:hover:bg-wa-hoverDark/60">
    <Avatar src={person?.avatar} name={person?.name} size={42} online={online} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{person?.name}</p>
      <p className="truncate text-xs text-wa-muted dark:text-wa-mutedDark">@{person?.username}</p>
    </div>
    <div className="flex shrink-0 items-center gap-1">{children}</div>
  </div>
);
