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

/**
 * Turns an axios error into something a user can act on.
 *
 * The important case is "the API is not there at all" — no response, or an HTML
 * 404/405 from a static host because the backend was never deployed. Reporting
 * that as a generic failure sends people hunting for a problem with their input
 * when the server is simply unreachable.
 */
export const errMsg = (e, fallback = "Something went wrong") => {
  const res = e?.response;

  if (!res) {
    return e?.code === "ECONNABORTED"
      ? "The server took too long to respond. Please try again."
      : "Cannot reach the server. Check your connection, or the API may not be running.";
  }

  // A static host answering an /api/* call means no backend is deployed here.
  const looksLikeNoApi =
    (res.status === 404 || res.status === 405) && typeof res.data !== "object";
  if (looksLikeNoApi) {
    return "The API is not reachable from this site. The backend has not been deployed yet.";
  }

  if (res.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (res.status >= 500) return "The server hit an error. Please try again shortly.";

  return res.data?.details?.join(", ") || res.data?.message || fallback;
};

export default api;
