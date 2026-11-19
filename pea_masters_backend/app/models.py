"""ORM mapping of the identity tables. The tables themselves are created by Alembic migrations
(migrations/sql), which follow the full PEA schema; keep the two in step."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Numeric, Text, func
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
    name_source: Mapped[str] = mapped_column(Text, server_default="registration")  # registration | google | manual
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
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    revoke_reason: Mapped[str | None] = mapped_column(Text)


class UnitType(Timestamps, Base):
    __tablename__ = "unit_types"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[dict[str, str]] = mapped_column(JSONB)
    sort_order: Mapped[int] = mapped_column(server_default="0")


class OrganizationUnit(Timestamps, Base):
    """A department, faculty or other part of an organization."""
    __tablename__ = "organization_units"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organization_units.id"))
    unit_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("unit_types.id"))
    name: Mapped[dict[str, str]] = mapped_column(JSONB)  # {"ka": ..., "en": ...}
    code: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None]
    deleted_at: Mapped[datetime | None]


class Affiliation(Timestamps, Base):
    """A person's place in a unit over time. Current while ends_on is null; a transfer ends one row and adds another."""
    __tablename__ = "affiliations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    membership_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organization_memberships.id"))
    unit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organization_units.id"))
    position_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("positions.id"))  # academic position held there
    is_primary: Mapped[bool] = mapped_column(server_default="false")
    starts_on: Mapped[date]
    ends_on: Mapped[date | None]
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class Position(Timestamps, Base):
    """An academic position, e.g. Professor or Associate Professor. Managed by Admins."""
    __tablename__ = "positions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[dict[str, str]] = mapped_column(JSONB)  # {"ka": ..., "en": ...}
    category: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None]


ScanStatus = pg_enum("scan_status", "pending", "clean", "infected", "failed")


class File(Base):
    """An uploaded file's metadata; the bytes live in storage under storage_key (app/storage.py)."""
    __tablename__ = "files"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id"))
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    original_name: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(Text)  # detected from the content, not trusted from the browser
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(Text)
    scan_status: Mapped[str] = mapped_column(ScanStatus, server_default="pending")
    uploaded_at: Mapped[datetime] = mapped_column(server_default=func.now())
    deleted_at: Mapped[datetime | None]
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    purpose: Mapped[str] = mapped_column(Text, server_default="photo")  # photo | document (stricter access)


class Profile(Base):
    """General information: biography per language and photo. One per person, shared across organizations."""
    __tablename__ = "profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    biography: Mapped[dict[str, str]] = mapped_column(JSONB, server_default="{}")  # {"en": html, "ka": html}
    # {"orcid": ..., "researcher_id": ..., "scopus_id": ...}, see app/identifiers.py
    identifiers: Mapped[dict[str, str]] = mapped_column(JSONB, server_default="{}")
    orcid_verified_at: Mapped[datetime | None]  # set by "Connect ORCID" (app/orcid.py)
    research: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")  # app/profile_entries.py
    teaching: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    photo_file_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("files.id"))
    is_public: Mapped[bool] = mapped_column(server_default="false")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


AssignmentTarget = pg_enum("assignment_target", "member", "unit")


class CoordinatorAssignment(Base):
    """Which Members a Coordinator handles: everyone in a unit, or one person. Current while ends_on is null."""
    __tablename__ = "coordinator_assignments"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    coordinator_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    target: Mapped[str] = mapped_column(AssignmentTarget)
    member_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    unit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organization_units.id"))
    include_subunits: Mapped[bool] = mapped_column(server_default="true")
    starts_on: Mapped[date] = mapped_column(server_default=func.current_date())
    ends_on: Mapped[date | None]
    assigned_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


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


class WosLookup(Base):
    """A cached Web of Science answer for one DOI (app/wos.py). record is null when the DOI isn't indexed."""
    __tablename__ = "wos_lookups"
    doi: Mapped[str] = mapped_column(Text, primary_key=True)
    record: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())


class WosAuthorSearch(Base):
    """A cached Web of Science search for one researcher's documents (app/wos.py), all pages together."""
    __tablename__ = "wos_author_searches"
    query: Mapped[str] = mapped_column(Text, primary_key=True)
    total: Mapped[int]
    hits: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ExternalLookup(Base):
    """A cached answer from an outside service (app/lookups.py); record is null when it found nothing."""
    __tablename__ = "external_lookups"
    source: Mapped[str] = mapped_column(Text, primary_key=True)
    key: Mapped[str] = mapped_column(Text, primary_key=True)
    record: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ProfileEntry(Base):
    """One entry of a profile section: an award, a degree, a language, a video lecture... (app/profile_entries.py)"""
    __tablename__ = "profile_entries"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    section: Mapped[str] = mapped_column(Text)
    values: Mapped[dict[str, str]] = mapped_column("entry_values", JSONB, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class ProfileEntryFile(Base):
    """A supporting document attached to a profile entry"""
    __tablename__ = "profile_entry_files"
    entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profile_entries.id", ondelete="CASCADE"), primary_key=True)
    file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("files.id"), primary_key=True)
    position: Mapped[int] = mapped_column(server_default="0")


class Cv(Base):
    """The CV builder's CV for one person (app/cv.py)"""
    __tablename__ = "cvs"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class EvaluationPeriod(Base):
    """An evaluation round set up by an organization's Admins (app/evaluations.py)"""
    __tablename__ = "evaluation_periods"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(Text)
    starts_on: Mapped[date]
    ends_on: Mapped[date]  # the deadline, inclusive (Tbilisi time)
    publication_from: Mapped[int]
    publication_to: Mapped[int]
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
    archived_at: Mapped[datetime | None]


class EvaluationForm(Base):
    """A form a coordinator created (the built-in ISU form isn't stored: app/evaluation_forms/)"""
    __tablename__ = "evaluation_forms"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(Text)  # English
    name_ka: Mapped[str] = mapped_column(Text, server_default="")
    description: Mapped[str] = mapped_column(Text, server_default="")
    structure: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())
    archived_at: Mapped[datetime | None]


class Evaluation(Base):
    """A form sent to one researcher for one evaluation period (app/sent_evaluations.py)"""
    __tablename__ = "evaluations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    period_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("evaluation_periods.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    form_ref: Mapped[str] = mapped_column(Text)  # a built-in key or a custom form's id
    form_name: Mapped[str] = mapped_column(Text)
    form_name_ka: Mapped[str] = mapped_column(Text, server_default="")
    form_structure: Mapped[dict[str, Any]] = mapped_column(JSONB)  # the form as it was when sent
    sent_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    sent_at: Mapped[datetime] = mapped_column(server_default=func.now())
    started_at: Mapped[datetime | None]  # first entry added: the form can't be replaced or withdrawn any more
    state: Mapped[str] = mapped_column(Text, server_default="draft")  # draft | submitted | updating
    submitted_at: Mapped[datetime | None]
    submission: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)  # the entries as last submitted
    withdrawn_at: Mapped[datetime | None]
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class EvaluationEntry(Base):
    """One entry on an evaluation: an article, a semester's teaching, a grant…"""
    __tablename__ = "evaluation_entries"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    evaluation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("evaluations.id", ondelete="CASCADE"))
    item_id: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    detail: Mapped[str] = mapped_column(Text, server_default="")
    points: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))  # only on items whose entries state their points
    hidden: Mapped[bool] = mapped_column(server_default="false")
    status: Mapped[str] = mapped_column(Text, server_default="draft")  # draft | submitted | approved | rejected
    review_comment: Mapped[str | None] = mapped_column(Text)
    wos: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class EvaluationEntryFile(Base):
    """Evidence attached to an evaluation entry (an uploaded document)"""
    __tablename__ = "evaluation_entry_files"
    entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("evaluation_entries.id", ondelete="CASCADE"),
                                                primary_key=True)
    file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("files.id"), primary_key=True)
    position: Mapped[int] = mapped_column(server_default="0")
