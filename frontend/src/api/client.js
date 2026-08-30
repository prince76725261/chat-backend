import axios from "axios";

// In dev the Vite proxy serves /api from the same origin, so a relative base
// works and cookies are same-site. In production the API lives on its own
// domain, so VITE_API_URL must point at it.
export const API_ORIGIN = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  // Required for the httpOnly refresh cookie, and for cross-site cookies
  // once the API is on a different domain than the app.
  withCredentials: true,
});

// The access token lives in memory only. Keeping it out of localStorage means
// an XSS payload cannot simply read it back out of storage.
let accessToken = null;
let onAuthFailure = () => {};

export const setAccessToken = (t) => { accessToken = t; };
export const getAccessToken = () => accessToken;
export const setAuthFailureHandler = (fn) => { onAuthFailure = fn; };

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Single-flight refresh: if ten requests 401 at once we must not fire ten
// refresh calls, or rotation invalidates the token mid-flight for the others.
let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    const isRefreshCall = original?.url?.includes("/auth/refresh");
    if (status !== 401 || original?._retried || isRefreshCall) {
      return Promise.reject(error);
    }

    original._retried = true;
    try {
      refreshing = refreshing || api.post("/auth/refresh").finally(() => { refreshing = null; });
      const { data } = await refreshing;
      setAccessToken(data.accessToken);
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (err) {
      // Refresh itself failed — the session is genuinely over.
      setAccessToken(null);
      onAuthFailure();
      return Promise.reject(err);
    }
  }
);

/** Pulls the server's human-readable message out of an axios error. */
export const errMsg = (e, fallback = "Something went wrong") =>
  e?.response?.data?.details?.join(", ") || e?.response?.data?.message || fallback;

export default api;
