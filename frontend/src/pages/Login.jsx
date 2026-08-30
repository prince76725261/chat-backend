import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errMsg } from "../api/client";
import AuthShell from "../components/AuthShell";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(form.identifier, form.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errMsg(err, "Could not sign in"));
    } finally {
      setBusy(false);
    }
  };

  const demo = () => setForm({ identifier: "prince@demo.com", password: "Password123" });

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your chats">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email or username</span>
          <input
            className="field" autoFocus autoComplete="username" required
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Password</span>
          <input
            className="field" type="password" autoComplete="current-password" required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
          />
        </label>

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <button type="button" onClick={demo}
          className="w-full text-center text-sm text-wa-muted underline-offset-2 hover:underline dark:text-wa-mutedDark">
          Use demo account
        </button>

        <p className="pt-2 text-center text-sm text-wa-muted dark:text-wa-mutedDark">
          New here?{" "}
          <Link to="/register" className="font-medium text-wa-green hover:underline">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
