from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.auth import google, sessions
from app.config import settings

app = FastAPI(title="PEA API", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

# Short-lived cookie that only carries the Google sign-in state (state, nonce, PKCE verifier) during the
# round trip to Google. The login itself is the separate pea_session cookie (app/auth/sessions.py).
app.add_middleware(
    SessionMiddleware, secret_key=settings.session_secret, session_cookie="pea_oauth",
    max_age=600, same_site="lax", https_only=settings.secure_cookies,
)

app.include_router(google.router)
app.include_router(sessions.router)


@app.get("/api/v1/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
