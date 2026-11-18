from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app import crossref, cv, orcid, people, positions, profile_entries, profiles, research_output, units, wos
from app.auth import google, sessions
from app.config import settings
from app.db import get_db

app = FastAPI(title="PEA API", redoc_url=None,
              docs_url="/api/docs" if settings.docs_enabled else None,
              openapi_url="/api/openapi.json" if settings.docs_enabled else None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Headers for every API response. (The website's own pages get theirs from the web server, see DEPLOY.md.)"""
    response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Cache-Control", "no-store")  # personal data: never kept by shared caches (files set their own)
    if settings.production:
        headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return response

# Short-lived cookie that only carries the Google sign-in state (state, nonce, PKCE verifier) during the
# round trip to Google. The login itself is the separate pea_session cookie (app/auth/sessions.py).
app.add_middleware(
    SessionMiddleware, secret_key=settings.session_secret, session_cookie="pea_oauth",
    max_age=600, same_site="lax", https_only=settings.secure_cookies,
)

app.include_router(google.router)
app.include_router(sessions.router)
app.include_router(units.router)
app.include_router(people.router)
app.include_router(positions.router)
app.include_router(profiles.router)
app.include_router(profile_entries.router)
app.include_router(cv.router)
app.include_router(wos.router)
app.include_router(crossref.router)
app.include_router(research_output.router)
app.include_router(orcid.router)


@app.get("/api/v1/health", tags=["meta"])
def health(db: Session = Depends(get_db)):
    """For monitoring: 200 when the API and its database answer, 503 otherwise."""
    try:
        db.execute(text("select 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "database unavailable"}, status_code=503)
    return {"status": "ok"}
