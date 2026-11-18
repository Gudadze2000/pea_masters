"""ORCID: "Connect ORCID" proves an ORCID iD belongs to the person (they sign in to ORCID, which tells PEA their
iD), and the person's public works can be imported. Uses ORCID's free Public API: OAuth with the /authenticate scope
for connecting, and a /read-public token for reading works. The client secret stays on the server.

ORCID only accepts https redirect addresses, so in development ORCID_REDIRECT_URI points to a small forwarding page
(see README) that sends the browser on to PEA's own /api/v1/orcid/callback."""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.auth.sessions import client_ip, current_user
from app.config import settings
from app.db import get_db
from app.errors import problem
from app.identifiers import normalize_orcid
from app.lookups import cached
from app.models import Profile, User
from app.profiles import ProfileOut, build_profile, profile_of
from app.wos import normalize_doi

router = APIRouter(tags=["orcid"])
log = logging.getLogger(__name__)

STATE_KEY = "orcid_state"
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
WORKS_FOR = timedelta(days=1)


def configured() -> bool:
    return bool(settings.orcid_client_id and settings.orcid_client_secret)


def api_url() -> str:
    """Public API: https://orcid.org → https://pub.orcid.org/v3.0, the sandbox likewise"""
    return settings.orcid_api_url or settings.orcid_base_url.replace("://", "://pub.", 1) + "/v3.0"


def redirect_uri() -> str:
    return settings.orcid_redirect_uri or f"{settings.public_url.rstrip('/')}/api/v1/orcid/callback"


def back_to_profile(outcome: str) -> RedirectResponse:
    """The profile page shows a message for each outcome (connected, denied, expired, taken, error, ...)"""
    return RedirectResponse(f"/profile?orcid={outcome}#identifiers", status_code=status.HTTP_303_SEE_OTHER)


# --- calls to ORCID (replaced in tests) ----------------------------------------------------------

def _token_request(**fields: str) -> dict[str, Any]:
    credentials = {"client_id": settings.orcid_client_id, "client_secret": settings.orcid_client_secret}
    response = httpx.post(f"{settings.orcid_base_url}/oauth/token", timeout=TIMEOUT,
                          headers={"Accept": "application/json"}, data={**credentials, **fields})
    response.raise_for_status()
    return response.json()


def exchange_code(code: str) -> dict[str, Any]:
    """Trades the one-time code from the sign-in for the person's ORCID iD and name."""
    return _token_request(grant_type="authorization_code", code=code, redirect_uri=redirect_uri())


_read_token: str | None = None


def read_public_token() -> str:
    """A /read-public token for this client; ORCID issues them for about 20 years, so one per process is plenty."""
    global _read_token
    if _read_token is None:
        _read_token = _token_request(grant_type="client_credentials", scope="/read-public")["access_token"]
    return _read_token


def fetch_works(orcid: str) -> dict[str, Any] | None:
    """The record's public works (ORCID's /works summary), or None when there is no such ORCID iD."""
    response = httpx.get(f"{api_url()}/{orcid}/works", timeout=TIMEOUT,
                         headers={"Accept": "application/json", "Authorization": f"Bearer {read_public_token()}"})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


# --- connecting ----------------------------------------------------------------------------------

@router.get("/api/v1/orcid/connect")
def connect(request: Request, user: User = Depends(current_user)):
    """Sends the signed-in person to ORCID to sign in there; ORCID comes back to /api/v1/orcid/callback."""
    if not configured():
        return back_to_profile("not_configured")
    state = secrets.token_urlsafe(32)
    request.session[STATE_KEY] = {"state": state, "user": str(user.id)}
    query = urlencode({"client_id": settings.orcid_client_id, "response_type": "code", "scope": "/authenticate",
                       "redirect_uri": redirect_uri(), "state": state})
    return RedirectResponse(f"{settings.orcid_base_url}/oauth/authorize?{query}",
                            status_code=status.HTTP_303_SEE_OTHER)


@router.get("/api/v1/orcid/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
             db: Session = Depends(get_db)):
    """Where ORCID sends the person back. Checks the state (same person, same browser, this sign-in), then stores
    the ORCID iD as proven."""
    saved = request.session.pop(STATE_KEY, None)
    try:
        user = current_user(request, db)
    except HTTPException:
        return RedirectResponse("/login", status_code=status.HTTP_303_SEE_OTHER)
    if error:
        return back_to_profile("denied")  # they chose "Deny" on ORCID
    if (not saved or not state or not code or saved.get("user") != str(user.id)
            or not secrets.compare_digest(saved.get("state", ""), state)):
        return back_to_profile("expired")
    try:
        orcid = normalize_orcid(exchange_code(code).get("orcid") or "")
    except (httpx.HTTPError, ValueError, KeyError):
        log.warning("ORCID sign-in could not be completed", exc_info=True)
        return back_to_profile("error")

    taken = db.scalar(select(Profile.user_id).where(Profile.orcid_verified_at.is_not(None),
                                                    Profile.identifiers["orcid"].astext == orcid,
                                                    Profile.user_id != user.id))
    if taken:
        return back_to_profile("taken")

    profile = profile_of(db, user.id)
    before = dict(profile.identifiers)
    profile.identifiers = {**before, "orcid": orcid}
    profile.orcid_verified_at = datetime.now(UTC)
    audit.record(db, "profile.orcid_connected", entity_type="profile", entity_id=user.id, actor_user_id=user.id,
                 before={"orcid": before.get("orcid")}, after={"orcid": orcid}, ip=client_ip(request))
    db.commit()
    return back_to_profile("connected")


@router.delete("/api/v1/orcid/connection", response_model=ProfileOut)
def disconnect(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Keeps the ORCID iD but no longer marks it as proven, so it can be changed again."""
    profile = profile_of(db, user.id)
    if profile.orcid_verified_at is not None:
        profile.orcid_verified_at = None
        audit.record(db, "profile.orcid_disconnected", entity_type="profile", entity_id=user.id, actor_user_id=user.id,
                     before={"orcid": profile.identifiers.get("orcid")}, ip=client_ip(request))
        db.commit()
    return build_profile(db, user)


# --- works ---------------------------------------------------------------------------------------

class OrcidWork(BaseModel):
    put_code: int
    title: str
    type: str | None  # journal-article, book-chapter, conference-paper, ...
    year: int | None
    journal: str | None
    doi: str | None
    url: str | None


class OrcidWorks(BaseModel):
    orcid: str
    verified: bool
    works: list[OrcidWork]  # newest first
    checked_at: datetime


def to_works(record: dict[str, Any]) -> list[OrcidWork]:
    works = []
    for group in record.get("group") or []:
        summaries = group.get("work-summary") or []
        if not summaries:
            continue
        summary = summaries[0]  # ORCID groups the same work from several sources; the first is the preferred one
        title = (((summary.get("title") or {}).get("title")) or {}).get("value")
        if not title:
            continue
        ids = ((summary.get("external-ids") or {}).get("external-id")) or []
        doi = next((normalize_doi(i.get("external-id-value") or "") for i in ids if i.get("external-id-type") == "doi"),
                   None)
        year = (((summary.get("publication-date") or {}).get("year")) or {}).get("value")
        works.append(OrcidWork(
            put_code=summary.get("put-code") or 0, title=title.strip(), type=summary.get("type"),
            year=int(year) if year and year.isdigit() else None,
            journal=((summary.get("journal-title") or {}).get("value")), doi=doi,
            url=((summary.get("url") or {}).get("value")),
        ))
    works.sort(key=lambda work: work.year or 0, reverse=True)
    return works


@router.get("/api/v1/orcid/me/works", response_model=OrcidWorks)
def my_works(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The public works on the person's ORCID record (the iD on their profile). Cached for a day."""
    profile = db.get(Profile, user.id)
    orcid = (profile.identifiers if profile else {}).get("orcid")
    if not orcid:
        raise problem(status.HTTP_409_CONFLICT, "no_orcid", "Add or connect your ORCID iD on your profile first.")
    if not configured():
        raise problem(status.HTTP_503_SERVICE_UNAVAILABLE, "orcid_not_configured",
                      "ORCID isn't set up on this server yet.")
    try:
        record, checked_at = cached(db, "orcid.works", orcid, lambda: fetch_works(orcid), WORKS_FOR, WORKS_FOR)
    except (httpx.HTTPError, ValueError, KeyError):
        log.warning("ORCID works could not be read", exc_info=True)
        raise problem(status.HTTP_503_SERVICE_UNAVAILABLE, "orcid_unavailable",
                      "ORCID couldn't be reached. Try again later.") from None
    if record is None:
        raise problem(status.HTTP_404_NOT_FOUND, "orcid_not_found",
                      f"ORCID has no record {orcid}. Check the iD on your profile.")
    return OrcidWorks(orcid=orcid, verified=profile.orcid_verified_at is not None, works=to_works(record),
                      checked_at=checked_at)
