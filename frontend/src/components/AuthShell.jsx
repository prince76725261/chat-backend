import { useTheme } from "../context/ThemeContext";
import { Moon, Sun, Chats } from "./Icons";

/** Shared split layout for the login and register screens. */
export default function AuthShell({ title, subtitle, children }) {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex min-h-screen bg-wa-sidebar dark:bg-[#0b141a]">
      {/* Brand panel — decorative, so it is hidden on small screens. */}
      <aside className="hidden flex-1 flex-col justify-center bg-wa-greenDark px-14 text-white lg:flex">
        <Chats className="mb-6 h-14 w-14" />
        <h1 className="text-4xl font-bold leading-tight">Simple. Secure.<br />Reliable messaging.</h1>
        <p className="mt-5 max-w-md text-white/80">
          Message your friends in real time, see when they are typing, and know
          the moment your message is read.
        </p>
        <ul className="mt-8 space-y-2 text-white/75">
          <li>• End-to-end friend requests before anyone can message you</li>
          <li>• Live presence and read receipts over WebSockets</li>
          <li>• Group chats with admin controls</li>
        </ul>
      </aside>

      <main className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-[520px]">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="mt-1 text-sm text-wa-muted dark:text-wa-mutedDark">{subtitle}</p>
            </div>
            <button onClick={toggle} className="icon-btn" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
