import { createAuthPlugin } from "@agent-native/core/server";

const loginHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in — Personnel Evaluation</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      html, body { margin: 0; min-height: 100%; }
      body {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 22px;
        color: #1e1a1b;
        background: #ffffff;
        -webkit-font-smoothing: antialiased;
      }
      .page { display: flex; min-height: 100vh; }
      .brand {
        width: 640px;
        flex: 0 0 640px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 64px;
        background: #6f1b28;
        color: #ffffff;
      }
      .logo-row { display: flex; align-items: center; gap: 12px; }
      .logo {
        width: 44px; height: 44px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        background: #ffffff; color: #6f1b28;
        font-size: 14px; font-weight: 500;
      }
      .logo-title { font-size: 15px; font-weight: 600; line-height: 22px; }
      .logo-sub { font-size: 12px; font-weight: 500; line-height: 16px; color: #e9bfc5; }
      .hero { max-width: 480px; }
      .hero h1 { margin: 0; font-size: 32px; font-weight: 600; line-height: 40px; letter-spacing: -0.01em; }
      .hero p { margin: 16px 0 0; color: #e9bfc5; }
      .features { display: flex; flex-direction: column; gap: 20px; }
      .feature { display: flex; gap: 14px; }
      .feature-icon {
        width: 36px; height: 36px; flex: 0 0 36px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        background: #8c2433;
      }
      .feature-icon svg { width: 18px; height: 18px; }
      .feature-title { font-size: 14px; font-weight: 500; line-height: 22px; }
      .feature-text { font-size: 13px; line-height: 20px; color: #e9bfc5; }
      .form-panel {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .lang {
        position: absolute;
        top: 28px;
        right: 32px;
        display: flex;
        gap: 2px;
        padding: 3px;
        border-radius: 8px;
        background: #efecec;
      }
      .lang span {
        display: block; width: 37px; height: 24px; line-height: 24px;
        border-radius: 6px; text-align: center;
        font-size: 12px; font-weight: 500; color: #5e5658;
      }
      .lang span[aria-current="true"] { background: #ffffff; color: #1e1a1b; }
      .card { width: 400px; max-width: 100%; }
      .card h2 { margin: 0; font-size: 24px; font-weight: 600; line-height: 32px; }
      .card .lead { margin: 6px 0 0; color: #5e5658; }
      .field { margin-top: 24px; }
      .field label { display: block; font-size: 13px; font-weight: 500; line-height: 20px; color: #443d3f; }
      .input-wrap { position: relative; margin-top: 6px; }
      .input-wrap svg {
        position: absolute; left: 13px; top: 12px;
        width: 16px; height: 16px; color: #7c7476; pointer-events: none;
      }
      .input-wrap input {
        width: 100%; height: 40px; padding: 0 12px 0 37px;
        border: 1px solid #cfc9ca; border-radius: 8px;
        background: #ffffff; color: #1e1a1b;
        font: inherit; font-size: 14px;
        outline: none;
      }
      .input-wrap input::placeholder { color: #a79fa1; }
      .input-wrap input:focus { border-color: #8c2433; box-shadow: 0 0 0 3px #fbf2f3; }
      .submit {
        margin-top: 24px; width: 100%; height: 40px;
        border: 0; border-radius: 8px;
        background: #8c2433; color: #ffffff;
        font: inherit; font-size: 14px; font-weight: 500;
        cursor: pointer;
      }
      .submit:hover { background: #6f1b28; }
      .submit:disabled { opacity: 0.6; cursor: default; }
      .switch { margin: 16px 0 0; text-align: center; font-size: 13px; color: #5e5658; }
      .switch a { color: #8c2433; font-weight: 500; text-decoration: none; margin-left: 4px; }
      .switch a:hover { text-decoration: underline; }
      .note {
        margin-top: 24px; display: flex; gap: 8px;
        padding: 12px;
        border-radius: 10px;
        background: #f7f5f5;
        color: #5e5658; font-size: 12px; font-weight: 500; line-height: 16px;
      }
      .note svg, .banner svg { flex: 0 0 16px; width: 16px; height: 16px; margin-top: 0; }
      .banner {
        display: flex; gap: 12px;
        padding: 16px;
        margin-top: 24px;
        border-radius: 10px;
        background: #fbe7e7;
        color: #5e5658;
      }
      .banner svg { color: #b42b2b; width: 20px; height: 20px; flex-basis: 20px; }
      .banner strong { display: block; font-size: 14px; font-weight: 500; color: #b42b2b; }
      .banner p { margin: 4px 0 0; font-size: 13px; line-height: 20px; }
      @media (max-width: 900px) {
        .brand { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <aside class="brand">
        <div>
          <div class="logo-row">
            <div class="logo">PEA</div>
            <div>
              <div class="logo-title">Personnel Evaluation</div>
              <div class="logo-sub">Ilia State University</div>
            </div>
          </div>
        </div>
        <div class="hero">
          <h1>Your academic record, evaluated clearly.</h1>
          <p>Maintain your researcher profile, submit scored evaluation records with evidence, and follow the review in one place.</p>
        </div>
        <div class="features">
          <div class="feature">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/></svg>
            </div>
            <div>
              <div class="feature-title">One profile, always current</div>
              <div class="feature-text">Update your personal profile at any time.</div>
            </div>
          </div>
          <div class="feature">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m9 15 2 2 4-4"/></svg>
            </div>
            <div>
              <div class="feature-title">Evidence-based evaluation</div>
              <div class="feature-text">Attach PDFs or images to every record you submit.</div>
            </div>
          </div>
          <div class="feature">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </div>
            <div>
              <div class="feature-title">Clear deadlines</div>
              <div class="feature-text">Email reminders before the faculty deadline.</div>
            </div>
          </div>
        </div>
      </aside>

      <main class="form-panel">
        <div class="lang" aria-hidden="true">
          <span>KA</span>
          <span aria-current="true">EN</span>
        </div>

        <div class="card">
          <h2 id="form-heading">Sign in</h2>
          <p class="lead">Use your email address.</p>

          <div class="banner" id="error" role="alert" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
            <div>
              <strong>Cannot sign in</strong>
              <p id="error-body"></p>
            </div>
          </div>

          <form id="sign-in-form" novalidate>
            <div class="field">
              <label for="email">University email *</label>
              <div class="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                <input id="email" name="email" type="email" autocomplete="username" placeholder="name.surname@iliauni.edu.ge" required />
              </div>
            </div>

            <div class="field">
              <label for="password">Password *</label>
              <div class="input-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                <input id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••••" required />
              </div>
            </div>

            <button class="submit" id="submit" type="submit">Sign in</button>
            <p class="switch">
              <span id="switch-text">No account yet?</span>
              <a href="#" id="switch-mode">Create one</a>
            </p>
          </form>

          <div class="note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
            <span>Sign in with your account. New accounts can be created here with an email and a password of at least 8 characters.</span>
          </div>
        </div>
      </main>
    </div>

    <script>
      (function () {
        var form = document.getElementById("sign-in-form");
        var email = document.getElementById("email");
        var password = document.getElementById("password");
        var submit = document.getElementById("submit");
        var error = document.getElementById("error");
        var errorBody = document.getElementById("error-body");

        var mode = "signin";
        var switchText = document.getElementById("switch-text");
        var switchLink = document.getElementById("switch-mode");
        var heading = document.getElementById("form-heading");

        function setMode(next) {
          mode = next;
          var signup = mode === "signup";
          submit.textContent = signup ? "Create account" : "Sign in";
          password.setAttribute("autocomplete", signup ? "new-password" : "current-password");
          switchText.textContent = signup ? "Already have an account?" : "No account yet?";
          switchLink.textContent = signup ? "Sign in" : "Create one";
          if (heading) heading.textContent = signup ? "Create account" : "Sign in";
          error.hidden = true;
        }

        switchLink.addEventListener("click", function (event) {
          event.preventDefault();
          setMode(mode === "signin" ? "signup" : "signin");
        });

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          error.hidden = true;
          submit.disabled = true;
          var endpoint = mode === "signup" ? "/_agent-native/auth/register" : "/_agent-native/auth/login";
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ email: email.value.trim(), password: password.value }),
          })
            .then(function (res) {
              return res.json().catch(function () { return {}; });
            })
            .then(function (data) {
              if (data && data.ok) {
                window.location.href = "/";
                return;
              }
              throw new Error((data && data.error) || "Check your email and password and try again.");
            })
            .catch(function (err) {
              errorBody.textContent = err.message;
              error.hidden = false;
              submit.disabled = false;
            });
        });
      })();
    </script>
  </body>
</html>`;

// Email/password auth with optional Google OAuth (enabled automatically when
// GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set).
export default createAuthPlugin({
  rootAuth: false, // auth is not serverd on / by default
  loginHtml,
});
