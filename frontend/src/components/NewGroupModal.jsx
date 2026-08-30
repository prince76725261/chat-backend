import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { useChat } from "../context/ChatContext";
import Avatar from "./Avatar";
import { X } from "./Icons";

export default function NewGroupModal({ onClose }) {
  const { loadChats, openChat } = useChat();
  const [friends, setFriends] = useState([]);
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/friends").then(({ data }) => setFriends(data.friends)).catch(() => {});
  }, []);

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async () => {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/chats/group", { name: name.trim(), users: picked });
      await loadChats();
      openChat(data.chat);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // A group needs the creator plus at least two others.
  const canCreate = name.trim().length > 0 && picked.length >= 2;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-wa-panelDark"
      >
        <header className="flex items-center justify-between border-b border-wa-border px-4 py-3 dark:border-wa-borderDark">
          <h3 className="font-semibold">New group</h3>
          <button onClick={onClose} className="icon-btn"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-3 p-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          <input className="field" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-wa-muted dark:text-wa-mutedDark">
            Select at least 2 friends ({picked.length} selected)
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {friends.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-wa-muted dark:text-wa-mutedDark">
              You need friends before you can make a group.
            </p>
          )}
          {friends.map((f) => (
            <label key={f._id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-wa-hover dark:hover:bg-wa-hoverDark">
              <input type="checkbox" checked={picked.includes(f._id)} onChange={() => toggle(f._id)}
                className="h-4 w-4 accent-[#00a884]" />
              <Avatar src={f.avatar} name={f.name} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.name}</p>
                <p className="truncate text-xs text-wa-muted dark:text-wa-mutedDark">@{f.username}</p>
              </div>
            </label>
          ))}
        </div>

        <footer className="border-t border-wa-border p-3 dark:border-wa-borderDark">
          <button onClick={create} disabled={!canCreate || busy} className="btn-primary w-full">
            {busy ? "Creating…" : "Create group"}
          </button>
        </footer>
      </div>
    </div>
  );
}
