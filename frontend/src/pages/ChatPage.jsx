import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useTheme } from "../context/ThemeContext";
import ChatList from "../components/ChatList";
import FriendsPanel from "../components/FriendsPanel";
import ChatWindow from "../components/ChatWindow";
import NewGroupModal from "../components/NewGroupModal";
import Avatar from "../components/Avatar";
import { Chats, Users, Logout, Moon, Sun, Plus } from "../components/Icons";

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { activeChat, setActiveChat, friendRequests } = useChat();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState("chats");
  const [showGroup, setShowGroup] = useState(false);

  const pending = friendRequests.incoming.length;

  return (
    <div className="flex h-screen overflow-hidden bg-wa-sidebar dark:bg-[#0b141a]">
      {/* On mobile only one pane is visible at a time; md+ shows both. */}
      <aside
        className={`flex w-full flex-col border-r border-wa-border bg-wa-sidebar dark:border-wa-borderDark dark:bg-wa-sidebarDark
          md:flex md:w-[380px] md:shrink-0 ${activeChat ? "hidden" : "flex"}`}
      >
        <header className="flex items-center gap-2 px-3 py-2.5">
          <Avatar src={user.avatar} name={user.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-wa-muted dark:text-wa-mutedDark">@{user.username}</p>
          </div>

          <button onClick={() => setShowGroup(true)} className="icon-btn" title="New group">
            <Plus className="h-5 w-5" />
          </button>
          <button onClick={toggle} className="icon-btn" title="Toggle theme">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button onClick={logout} className="icon-btn" title="Log out">
            <Logout className="h-5 w-5" />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-wa-border px-3 pb-2 dark:border-wa-borderDark">
          <TabBtn active={tab === "chats"} onClick={() => setTab("chats")} icon={<Chats className="h-4 w-4" />} label="Chats" />
          <TabBtn active={tab === "friends"} onClick={() => setTab("friends")} icon={<Users className="h-4 w-4" />} label="Friends" badge={pending} />
        </nav>

        <div className="flex-1 overflow-hidden">
          {tab === "chats" ? <ChatList /> : <FriendsPanel />}
        </div>
      </aside>

      <main className={`flex-1 ${activeChat ? "flex" : "hidden md:flex"} flex-col`}>
        <ChatWindow onBack={() => setActiveChat(null)} />
      </main>

      {showGroup && <NewGroupModal onClose={() => setShowGroup(false)} />}
    </div>
  );
}

const TabBtn = ({ active, onClick, icon, label, badge }) => (
  <button
    onClick={onClick}
    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition
      ${active
        ? "bg-wa-green/12 text-wa-greenDark dark:bg-wa-green/20 dark:text-wa-bubble"
        : "text-wa-muted hover:bg-black/5 dark:text-wa-mutedDark dark:hover:bg-white/10"}`}
  >
    {icon} {label}
    {badge > 0 && (
      <span className="rounded-full bg-wa-green px-1.5 text-[10px] font-semibold text-white">{badge}</span>
    )}
  </button>
);
