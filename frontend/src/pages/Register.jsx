import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errMsg } from "../api/client";
import AuthShell from "../components/AuthShell";

const rules = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "Contains a letter", test: (p) => /[a-zA-Z]/.test(p) },
  { label: "Contains a number", test: (p) => /[0-9]/.test(p) },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const allGood = rules.every((r) => r.test(form.password));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register({
        ...form,
        username: form.username.toLowerCase(),
        // Deterministic placeholder avatar so every account has a face.
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name || form.username)}&background=25D366&color=fff&bold=true`,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(errMsg(err, "Could not create the account"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="It only takes a moment">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Full name</span>
          <input className="field" required autoFocus value={form.name} onChange={set("name")} placeholder="Prince Agarwal" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Username</span>
          <div className="flex items-center gap-2">
            <span className="text-wa-muted dark:text-wa-mutedDark">@</span>
            <input className="field" required minLength={3} pattern="[a-zA-Z0-9_.]+"
              value={form.username} onChange={set("username")} placeholder="prince" />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input className="field" type="email" required value={form.email} onChange={set("email")} placeholder="you@example.com" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Password</span>
          <input className="field" type="password" required autoComplete="new-password"
            value={form.password} onChange={set("password")} placeholder="••••••••" />
        </label>

        {form.password && (
          <ul className="space-y-1 text-xs">
            {rules.map((r) => {
              const ok = r.test(form.password);
              return (
                <li key={r.label} className={ok ? "text-wa-green" : "text-wa-muted dark:text-wa-mutedDark"}>
                  {ok ? "✓" : "○"} {r.label}
                </li>
              );
            })}
          </ul>
        )}

        <button className="btn-primary w-full" disabled={busy || !allGood}>
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="pt-2 text-center text-sm text-wa-muted dark:text-wa-mutedDark">
          Already registered?{" "}
          <Link to="/login" className="font-medium text-wa-green hover:underline">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
