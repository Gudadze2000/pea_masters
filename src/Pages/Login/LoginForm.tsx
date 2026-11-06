import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      const response = await fetch("/_agent-native/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: String(fields.get("email") ?? "").trim(),
          password: String(fields.get("password") ?? ""),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Check your email and password and try again.");
      }
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
      setPending(false);
    }
  }

  return (
<div className="card">
          <h2 id="form-heading">Sign in</h2>
          <p className="lead">Use your email address.</p>

          {error && <div className="banner" role="alert"><div><strong>Cannot sign in</strong><p>{error}</p></div></div>}
          <form id="sign-in-form" onSubmit={handleSubmit} aria-busy={pending}>
            <div className="field">
              <label htmlFor="email">University email *</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                <input id="email" name="email" type="email" autoComplete="username" placeholder="name.surname@iliauni.edu.ge" required />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password *</label>
              <div className="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••••" required />
              </div>
            </div>

            <button className="submit" id="submit" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
          </form>
          <p style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}><a href="/profiles" style={{ color: "var(--primary)", fontWeight: 500 }}>Continue as guest</a></p>
          <div className="note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
            <span>Accounts are created by an administrator. Use the email your administrator registered.</span>
          </div>
        </div>
  );
}
