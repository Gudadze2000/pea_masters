"""ORM mapping of the identity tables. The tables themselves are created by Alembic migrations
(migrations/sql), which follow the full PEA schema; keep the two in step."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Text, func
from sqlalchemy.dialects.postgresql import ENUM, INET, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def pg_enum(name: str, *values: str) -> ENUM:
    return ENUM(*values, name=name, create_type=False)


RoleKind = pg_enum("role_kind", "root", "admin", "coordinator", "member")
AccountStatus = pg_enum("account_status", "invited", "active", "deactivated")
OrgStatus = pg_enum("org_status", "active", "deactivated")
MembershipStatus = pg_enum("membership_status", "active", "inactive")
AuthProvider = pg_enum("auth_provider", "password", "google", "microsoft", "oidc", "orcid")
ActorKind = pg_enum("actor_kind", "user", "system", "ai_agent")


class Base(DeclarativeBase):
    # every timestamp column in the schema is timestamptz
    type_annotation_map = {datetime: DateTime(timezone=True)}


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class Organization(Timestamps, Base):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[dict[str, str]] = mapped_column(JSONB)  # {"ka": ..., "en": ...}
    kind: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(OrgStatus, server_default="active")
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    deleted_at: Mapped[datetime | None]


class OrganizationDomain(Timestamps, Base):
    __tablename__ = "organization_domains"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    domain: Mapped[str] = mapped_column(Text)
    verified_at: Mapped[datetime | None]
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    allow_self_signup: Mapped[bool] = mapped_column(server_default="false")


class User(Timestamps, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    email: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    given_name: Mapped[str | None] = mapped_column(Text)
    family_name: Mapped[str | None] = mapped_column(Text)
    preferred_locale: Mapped[str] = mapped_column(Text, server_default="ka")
    status: Mapped[str] = mapped_column(AccountStatus, server_default="active")
    last_login_at: Mapped[datetime | None]
    deleted_at: Mapped[datetime | None]


class AuthIdentity(Base):
    __tablename__ = "auth_identities"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    provider: Mapped[str] = mapped_column(AuthProvider)
    provider_subject: Mapped[str] = mapped_column(Text)  # Google's "sub": stable even if the email changes
    email: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_used_at: Mapped[datetime | None]


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    # SHA-256 of the cookie value; the value itself is never stored
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)


class OrganizationMembership(Timestamps, Base):
    __tablename__ = "organization_memberships"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    status: Mapped[str] = mapped_column(MembershipStatus, server_default="active")
    employee_number: Mapped[str | None] = mapped_column(Text)
    joined_on: Mapped[date | None]
    left_on: Mapped[date | None]


class RoleAssignment(Base):
    __tablename__ = "role_assignments"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id"))  # null only for root
    role: Mapped[str] = mapped_column(RoleKind)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    granted_at: Mapped[datetime] = mapped_column(server_default=func.now())
    revoked_at: Mapped[datetime | None]


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    occurred_at: Mapped[datetime]
    actor_kind: Mapped[str] = mapped_column(ActorKind)
    actor_user_id: Mapped[uuid.UUID | None]
    acting_role: Mapped[str | None] = mapped_column(RoleKind)
    organization_id: Mapped[uuid.UUID | None]
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str | None] = mapped_column(Text)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    reason: Mapped[str | None] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(INET)
    prev_hash: Mapped[str | None] = mapped_column(Text)
    row_hash: Mapped[str] = mapped_column(Text)
