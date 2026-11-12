"""Login sessions: an opaque random token in an httpOnly cookie, stored only as a SHA-256 hash."""

import hashlib
import ipaddress
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.models import Organization, OrganizationMembership, RoleAssignment, User, UserSession

COOKIE_NAME = "pea_session"

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def client_ip(request: Request) -> str | None:
    """The caller's IP address, or None when it isn't one (the column is PostgreSQL inet)."""
    host = request.client.host if request.client else None
    try:
        return str(ipaddress.ip_address(host)) if host else None
    except ValueError:
        return None


def create_session(db: Session, user_id: uuid.UUID, ip: str | None, user_agent: str | None) -> tuple[str, UserSession]:
    raw = secrets.token_urlsafe(32)
    row = UserSession(
        user_id=user_id,
        token_hash=hash_token(raw),
        expires_at=datetime.now(UTC) + timedelta(hours=settings.session_hours),
        ip=ip,
        user_agent=(user_agent or "")[:500] or None,
    )
    db.add(row)
    db.flush()
    return raw, row


def set_session_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        COOKIE_NAME, raw, max_age=settings.session_hours * 3600, path="/",
        httponly=True, secure=settings.secure_cookies, samesite="lax",
    )


def find_session(db: Session, request: Request) -> UserSession | None:
    raw = request.cookies.get(COOKIE_NAME)
    if not raw:
        return None
    return db.scalar(select(UserSession).where(
        UserSession.token_hash == hash_token(raw),
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > func.now(),
    ))


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Dependency for any endpoint that needs a signed-in user. Responds 401 otherwise."""
    session = find_session(db, request)
    user = db.get(User, session.user_id) if session else None
    if user is None or user.status != "active" or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    return user


class OrganizationAccess(BaseModel):
    id: uuid.UUID
    slug: str
    name: dict[str, str]
    roles: list[str]


class Me(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    given_name: str | None
    family_name: str | None
    preferred_locale: str
    is_root: bool
    organizations: list[OrganizationAccess]


ROLE_ORDER = ["admin", "coordinator", "member"]


@router.get("/me", response_model=Me)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Me:
    """Who is signed in, and their roles in each organization they're an active member of."""
    roles = db.execute(select(RoleAssignment.organization_id, RoleAssignment.role).where(
        RoleAssignment.user_id == user.id, RoleAssignment.revoked_at.is_(None))).all()
    orgs = db.scalars(
        select(Organization)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(OrganizationMembership.user_id == user.id, OrganizationMembership.status == "active",
               Organization.status == "active", Organization.deleted_at.is_(None))
        .order_by(Organization.slug)
    ).all()
    return Me(
        id=user.id, email=user.email, display_name=user.display_name,
        given_name=user.given_name, family_name=user.family_name,
        preferred_locale=user.preferred_locale,
        is_root=any(role == "root" for _, role in roles),
        organizations=[
            OrganizationAccess(
                id=org.id, slug=org.slug, name=org.name,
                roles=sorted({role for org_id, role in roles if org_id == org.id}, key=ROLE_ORDER.index),
            )
            for org in orgs
        ],
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    session = find_session(db, request)
    if session:
        session.revoked_at = func.now()
        audit.record(db, "auth.logout", entity_type="session", entity_id=session.id,
                     actor_user_id=session.user_id, ip=client_ip(request))
        db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, secure=settings.secure_cookies, samesite="lax")
    return response
