import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ChatProvider } from "./context/ChatContext";
import { ThemeProvider } from "./context/ThemeContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ChatPage from "./pages/ChatPage";

/** Blocks a route until the silent-refresh boot check has finished, so a
 *  logged-in user is never flashed the login screen on reload. */
function Guard({ children, authed }) {
  const { user, booting } = useAuth();
  if (booting) return <Splash />;
  if (authed && !user) return <Navigate to="/login" replace />;
  if (!authed && user) return <Navigate to="/" replace />;
  return children;
}

const Splash = () => (
  <div className="grid h-screen place-items-center bg-wa-sidebar dark:bg-[#0b141a]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-wa-green border-t-transparent" />
      <p className="text-sm text-wa-muted dark:text-wa-mutedDark">Loading your chats…</p>
    </div>
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <ChatProvider>
              <Routes>
                <Route path="/login" element={<Guard><Login /></Guard>} />
                <Route path="/register" element={<Guard><Register /></Guard>} />
                <Route path="/" element={<Guard authed><ChatPage /></Guard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ChatProvider>
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
