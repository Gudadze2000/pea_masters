"""Sign in with Google (OpenID Connect, authorization code flow with PKCE).

Only people with a verified email in a Google Workspace domain that an organization has verified
(organization_domains) and an active membership in that organization can sign in.
"""

from typing import Any

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.auth.sessions import client_ip, create_session, set_session_cookie
from app.config import settings
from app.db import SessionLocal
from app.models import (
    AuthIdentity,
    Organization,
    OrganizationDomain,
    OrganizationMembership,
    RoleAssignment,
    User,
)
from app.names import official_name

router = APIRouter(prefix="/api/v1/auth/google", tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    # Authlib adds state and nonce itself; S256 turns on PKCE
    client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
)


def app_url(path: str) -> str:
    return settings.public_url.rstrip("/") + path


def fail(code: str) -> RedirectResponse:
    """Back to the login page, which shows a message for each code."""
    return RedirectResponse(app_url(f"/login?error={code}"), status_code=303)


def verified_domain(db: Session, domain: str) -> OrganizationDomain | None:
    return db.scalar(select(OrganizationDomain).where(
        func.lower(OrganizationDomain.domain) == domain.lower(),
        OrganizationDomain.verified_at.is_not(None),
    ))


def domain_is_known(domain: str) -> bool:
    with SessionLocal() as db:
        return verified_domain(db, domain) is not None


@router.get("/login")
async def google_login(request: Request, email: str | None = None):
    """Starts sign-in. With ?email=, rejects other domains early and pre-selects that account at Google."""
    params: dict[str, str] = {"prompt": "select_account"}
    if email:
        email = email.strip().lower()
        local, _, domain = email.rpartition("@")
        if not local or not domain or not await run_in_threadpool(domain_is_known, domain):
            return fail("not_organization_account")
        # Both are only hints to Google's account chooser; the callback checks the real values
        params |= {"login_hint": email, "hd": domain}
    return await oauth.google.authorize_redirect(request, settings.google_redirect_uri, **params)


@router.get("/callback")
async def google_callback(request: Request):
    if request.query_params.get("error"):  # the person closed or cancelled Google's screen
        return fail("cancelled")
    try:
        # Exchanges the code and validates the ID token: signature, issuer, audience, expiry, nonce
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return fail("google_failed")

    claims = dict(token.get("userinfo") or {})
    raw, error = await run_in_threadpool(
        complete_login, claims, client_ip(request), request.headers.get("user-agent"))
    if raw is None:
        return fail(error)
    response = RedirectResponse(app_url("/home"), status_code=303)
    set_session_cookie(response, raw)
    return response


def sync_official_name(db: Session, user: User, claims: dict[str, Any], org_id: Any, ip: str | None) -> None:
    """Uses the name from ISU's Google directory unless someone deliberately corrected it in PEA."""
    display, given, family = official_name(claims)
    if user.name_source == "manual" or not display:
        return
    changed = user.display_name != display
    before = {"display_name": user.display_name, "name_source": user.name_source}
    user.display_name, user.given_name, user.family_name = display, given, family
    if changed:
        audit.record(db, "person.name_from_google", entity_type="user", entity_id=user.id, actor_user_id=user.id,
                     organization_id=org_id, before=before,
                     after={"display_name": display, "name_source": "google"}, ip=ip)
    user.name_source = "google"


def complete_login(claims: dict[str, Any], ip: str | None, user_agent: str | None) -> tuple[str | None, str]:
    """Checks the verified Google claims against our data. Returns (session token, "") or (None, error code)."""
    with SessionLocal() as db:
        email = str(claims.get("email") or "").lower()
        subject = str(claims.get("sub") or "")

        def deny(code: str, user: User | None = None, org_id: Any = None) -> tuple[None, str]:
            user_id = user.id if user else None  # read before the rollback discards it
            db.rollback()  # keep nothing from this attempt except the audit entry
            audit.record(db, "auth.login.denied", entity_type="user", entity_id=user_id,
                         actor_user_id=user_id, organization_id=org_id,
                         after={"provider": "google", "email": email}, reason=code, ip=ip)
            db.commit()
            return None, code

        if not subject or not email:
            return deny("google_failed")
        if claims.get("email_verified") is not True:
            return deny("email_not_verified")
        # hd = the Google Workspace domain of the account; personal @gmail.com accounts have none
        hosted_domain = claims.get("hd")
        domain = verified_domain(db, hosted_domain) if hosted_domain else None
        if domain is None:
            return deny("not_organization_account")
        org_id = domain.organization_id

        identity = db.scalar(select(AuthIdentity).where(
            AuthIdentity.provider == "google", AuthIdentity.provider_subject == subject))
        if identity:
            # Returning user: matched on Google's permanent account id, not on the email
            user = db.get(User, identity.user_id)
        else:
            # First Google sign-in: link to the account an Admin registered for this email
            user = db.scalar(select(User).where(func.lower(User.email) == email, User.deleted_at.is_(None)))
            if user is None and domain.allow_self_signup:
                user = User(email=email, display_name=official_name(claims)[0] or email)
                db.add(user)
                db.flush()
                db.add(OrganizationMembership(user_id=user.id, organization_id=org_id))
                db.add(RoleAssignment(user_id=user.id, organization_id=org_id, role="member"))
            if user is None:
                return deny("not_registered", org_id=org_id)
            identity = AuthIdentity(user_id=user.id, provider="google", provider_subject=subject, email=email)
            db.add(identity)

        if user is None or user.deleted_at is not None or user.status == "deactivated":
            return deny("account_disabled", user, org_id)

        membership = db.scalar(select(OrganizationMembership).where(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.status == "active"))
        if membership is None:
            return deny("not_registered", user, org_id)
        org = db.get(Organization, org_id)
        if org is None or org.status != "active" or org.deleted_at is not None:
            return deny("organization_inactive", user, org_id)

        if user.status == "invited":  # registered by an Admin, signing in for the first time
            user.status = "active"
        sync_official_name(db, user, claims, org_id, ip)
        user.last_login_at = func.now()
        identity.last_used_at = func.now()
        identity.email = email

        raw, session = create_session(db, user.id, ip, user_agent)
        audit.record(db, "auth.login.succeeded", entity_type="session", entity_id=session.id,
                     actor_user_id=user.id, organization_id=org_id, after={"provider": "google"}, ip=ip)
        db.commit()
        return raw, ""
