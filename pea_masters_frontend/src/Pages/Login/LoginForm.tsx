import { useState } from "react";
import { useSearchParams } from "react-router";
import { googleSignInUrl, useAuth } from "@/lib/auth";

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="google-mark">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

// Codes the backend puts in /login?error=… when it refuses a sign-in
const errorMessages: Record<string, { title: string; text: string }> = {
  not_organization_account: {
    title: "Not an organization account",
    text: "Sign in with your university Google account, for example name.surname@iliauni.edu.ge. Personal Gmail accounts can't be used.",
  },
  not_registered: {
    title: "Account not registered",
    text: "Your email isn't registered in PEA yet. Ask your organization's PEA administrator to add you.",
  },
  account_disabled: { title: "Account deactivated", text: "This account has been deactivated. Contact your organization's PEA administrator." },
  organization_inactive: { title: "Organization unavailable", text: "Your organization's access to PEA is currently turned off." },
  email_not_verified: { title: "Email not verified", text: "Google hasn't verified this email address, so it can't be used to sign in." },
  cancelled: { title: "Sign-in cancelled", text: "You closed Google's sign-in. Try again when you're ready." },
  google_failed: { title: "Google sign-in didn't finish", text: "Something went wrong while talking to Google. Please try again." },
};
const unknownError = { title: "Cannot sign in", text: "Something went wrong. Please try again." };
const offlineError = { title: "Server unavailable", text: "PEA's server can't be reached right now. Please try again in a moment." };

export function LoginForm() {
  const [params] = useSearchParams();
  const { status } = useAuth();
  const [pending, setPending] = useState(false);
  const errorCode = params.get("error");
  const error = status === "offline" ? offlineError : errorCode ? errorMessages[errorCode] ?? unknownError : null;

  function continueWithGoogle() {
    if (pending) return;
    setPending(true);
    // Leaves the app for Google's account chooser; the backend checks the chosen account when Google sends it back
    window.location.assign(googleSignInUrl());
  }

  return (
    <div className="card">
      <h2 id="form-heading">Sign in</h2>
      <p className="lead">Use your university Google account, for example name.surname@iliauni.edu.ge.</p>

      {error && <div className="banner" role="alert"><div><strong>{error.title}</strong><p>{error.text}</p></div></div>}

      <button className="submit google-submit" id="submit" type="button" onClick={continueWithGoogle} disabled={pending} aria-busy={pending}>
        <GoogleIcon />
        {pending ? "Redirecting to Google…" : "Continue with Google"}
      </button>

      <div className="note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span>Only members of a registered organization can sign in. Your administrator adds new accounts.</span>
      </div>
    </div>
  );
}
