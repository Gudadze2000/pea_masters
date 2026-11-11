import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AuthError, minPasswordLength, register, signIn, signInAsGuest } from "@/lib/auth";

export type AuthMode = "signin" | "register";

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
);
const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
);

export function LoginForm({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";

  function enterApp() {
    navigate("/home", { replace: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "");
    const password = String(fields.get("password") ?? "");
    setError("");

    if (isRegister && password !== String(fields.get("confirmPassword") ?? "")) {
      setError("The passwords do not match.");
      return;
    }

    setPending(true);
    try {
      if (isRegister) await register({ name: String(fields.get("name") ?? ""), email, password });
      else await signIn(email, password);
      enterApp();
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  function continueAsGuest() {
    signInAsGuest();
    enterApp();
  }

  return (
    <div className="card">
      <h2 id="form-heading">{isRegister ? "Create an account" : "Sign in"}</h2>
      <p className="lead">{isRegister ? "Register with your university email." : "Use your email address."}</p>

      {error && <div className="banner" role="alert"><div><strong>{isRegister ? "Cannot create account" : "Cannot sign in"}</strong><p>{error}</p></div></div>}

      {/* key resets the fields when switching between sign in and register */}
      <form key={mode} id="auth-form" onSubmit={handleSubmit} aria-busy={pending} aria-labelledby="form-heading">
        {isRegister && (
          <div className="field">
            <label htmlFor="name">Full name *</label>
            <div className="input-wrap">
              <UserIcon />
              <input id="name" name="name" type="text" autoComplete="name" placeholder="Name Surname" required />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="email">University email *</label>
          <div className="input-wrap">
            <MailIcon />
            <input id="email" name="email" type="email" autoComplete={isRegister ? "email" : "username"} placeholder="name.surname@iliauni.edu.ge" required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Password *</label>
          <div className="input-wrap">
            <LockIcon />
            <input
              id="password" name="password" type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder="••••••••••" required
              minLength={isRegister ? minPasswordLength : undefined}
              aria-describedby={isRegister ? "password-hint" : undefined}
            />
          </div>
          {isRegister && <p id="password-hint" className="hint">At least {minPasswordLength} characters.</p>}
        </div>

        {isRegister && (
          <div className="field">
            <label htmlFor="confirmPassword">Confirm password *</label>
            <div className="input-wrap">
              <LockIcon />
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" placeholder="••••••••••" required />
            </div>
          </div>
        )}

        <button className="submit" id="submit" type="submit" disabled={pending}>
          {isRegister ? (pending ? "Creating account…" : "Create account") : (pending ? "Signing in…" : "Sign in")}
        </button>
      </form>

      <p className="switch-mode">
        {isRegister
          ? <>Already have an account? <Link to="/login">Sign in</Link></>
          : <>New to PEA? <Link to="/register">Create an account</Link></>}
      </p>

      <div className="divider" role="separator"><span>or</span></div>
      <button type="button" className="guest" onClick={continueAsGuest} disabled={pending}>Continue as guest</button>

      <div className="note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span>Prototype: accounts are saved only in this browser until the server is connected.</span>
      </div>
    </div>
  );
}
