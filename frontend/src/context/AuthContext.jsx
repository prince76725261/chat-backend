import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import api, { setAccessToken, setAuthFailureHandler, errMsg } from "../api/client";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* best effort */ }
    setAccessToken(null);
    setUser(null);
  }, []);

  // On a hard refresh the in-memory access token is gone but the httpOnly
  // refresh cookie survives — so we silently restore the session from it.
  useEffect(() => {
    setAuthFailureHandler(() => { setAccessToken(null); setUser(null); });
    (async () => {
      try {
        const { data } = await api.post("/auth/refresh");
        setAccessToken(data.accessToken);
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const login = async (identifier, password) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const value = useMemo(
    () => ({ user, setUser, booting, login, register, logout, errMsg }),
    [user, booting, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
