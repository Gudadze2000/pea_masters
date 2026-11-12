"""People in an organization: Admins register them, set roles and departments, and deactivate them.
Coordinators can see the Members of the department they coordinate."""

import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.authz import Action, Actor, authorize, coordinated_members, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.models import (
    Affiliation,
    CoordinatorAssignment,
    OrganizationDomain,
    OrganizationMembership,
    OrganizationUnit,
    RoleAssignment,
    User,
    UserSession,
)
from app.units import UnitRef, find_unit

router = APIRouter(prefix="/api/v1/orgs/{org_id}/people", tags=["people"])

Role = Literal["admin", "coordinator", "member"]
Status = Literal["invited", "active", "deactivated"]
ROLE_ORDER = ["admin", "coordinator", "member"]


class PersonOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    status: Status
    roles: list[Role]
    department: UnitRef | None
    coordinates: UnitRef | None  # the department this person coordinates
    last_login_at: datetime | None


class PeopleList(BaseModel):
    people: list[PersonOut]
    can_manage: bool  # whether the caller may register and edit people here


class PersonCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=200)
    roles: list[Role] = Field(min_length=1)
    department_id: uuid.UUID | None = None
    coordinates_unit_id: uuid.UUID | None = None


class PersonUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    department_id: uuid.UUID | None = None  # send null to clear


class RolesUpdate(BaseModel):
    roles: list[Role] = Field(min_length=1)
    coordinates_unit_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=500)


class Reason(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


# --- reading ------------------------------------------------------------------------------------

def person_status(user: User, membership: OrganizationMembership) -> Status:
    if membership.status != "active" or user.status == "deactivated" or user.deleted_at is not None:
        return "deactivated"
    return "invited" if user.status == "invited" else "active"


def load_people(db: Session, org_id: uuid.UUID, user_ids: list[uuid.UUID] | None = None,
                search: str | None = None, visible_to_coordinator: uuid.UUID | None = None) -> list[PersonOut]:
    query = (select(User, OrganizationMembership)
             .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
             .where(OrganizationMembership.organization_id == org_id, User.deleted_at.is_(None)))
    if user_ids is not None:
        query = query.where(User.id.in_(user_ids))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(User.email.ilike(pattern), User.display_name.ilike(pattern)))
    if visible_to_coordinator:
        query = query.where(User.id.in_(coordinated_members(visible_to_coordinator, org_id)))
    rows = db.execute(query).all()
    ids = [user.id for user, _ in rows]
    if not ids:
        return []

    roles: dict[uuid.UUID, set[str]] = {}
    for user_id, role in db.execute(select(RoleAssignment.user_id, RoleAssignment.role).where(
            RoleAssignment.organization_id == org_id, RoleAssignment.user_id.in_(ids),
            RoleAssignment.revoked_at.is_(None))):
        roles.setdefault(user_id, set()).add(role)
    departments = {user_id: UnitRef(id=unit.id, name=unit.name) for user_id, unit in db.execute(
        select(OrganizationMembership.user_id, OrganizationUnit)
        .join(Affiliation, Affiliation.membership_id == OrganizationMembership.id)
        .join(OrganizationUnit, OrganizationUnit.id == Affiliation.unit_id)
        .where(OrganizationMembership.organization_id == org_id, OrganizationMembership.user_id.in_(ids),
               Affiliation.is_primary, Affiliation.ends_on.is_(None)))}
    coordinates = {user_id: UnitRef(id=unit.id, name=unit.name) for user_id, unit in db.execute(
        select(CoordinatorAssignment.coordinator_user_id, OrganizationUnit)
        .join(OrganizationUnit, OrganizationUnit.id == CoordinatorAssignment.unit_id)
        .where(CoordinatorAssignment.organization_id == org_id, CoordinatorAssignment.target == "unit",
               CoordinatorAssignment.coordinator_user_id.in_(ids),
               CoordinatorAssignment.ends_on.is_(None)))}

    people = [
        PersonOut(id=user.id, email=user.email, display_name=user.display_name,
                  status=person_status(user, membership),
                  roles=sorted(roles.get(user.id, set()), key=ROLE_ORDER.index),  # type: ignore[arg-type]
                  department=departments.get(user.id), coordinates=coordinates.get(user.id),
                  last_login_at=user.last_login_at)
        for user, membership in rows
    ]
    return sorted(people, key=lambda p: p.display_name.lower())


def one_person(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> PersonOut:
    found = load_people(db, org_id, [user_id])
    if not found:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "This person isn't part of the organization.")
    return found[0]


def membership_of(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> OrganizationMembership:
    membership = db.scalar(select(OrganizationMembership).where(
        OrganizationMembership.organization_id == org_id, OrganizationMembership.user_id == user_id))
    user = db.get(User, user_id)
    if membership is None or user is None or user.deleted_at is not None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "This person isn't part of the organization.")
    return membership


@router.get("", response_model=PeopleList)
def list_people(org_id: uuid.UUID, q: str | None = None,
                actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.VIEW_PEOPLE, org_id)
    coordinator_only = role == "coordinator"
    people = load_people(db, org_id, search=q, visible_to_coordinator=actor.user.id if coordinator_only else None)
    if coordinator_only:  # Coordinators see active Members only
        people = [p for p in people if p.status != "deactivated"]
    return PeopleList(people=people, can_manage=role in ("admin", "root"))


@router.get("/{user_id}", response_model=PersonOut)
def get_person(org_id: uuid.UUID, user_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    authorize(db, actor, Action.VIEW_PEOPLE, org_id, target_user_id=user_id)
    return one_person(db, org_id, user_id)


# --- rules shared by the changes below ----------------------------------------------------------

def other_active_admins(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(RoleAssignment)
        .join(OrganizationMembership, (OrganizationMembership.user_id == RoleAssignment.user_id)
              & (OrganizationMembership.organization_id == RoleAssignment.organization_id))
        .join(User, User.id == RoleAssignment.user_id)
        .where(RoleAssignment.organization_id == org_id, RoleAssignment.role == "admin",
               RoleAssignment.revoked_at.is_(None), RoleAssignment.user_id != user_id,
               OrganizationMembership.status == "active", User.status != "deactivated", User.deleted_at.is_(None))
    ) or 0


def ensure_not_last_admin(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    if other_active_admins(db, org_id, user_id) == 0:
        raise problem(status.HTTP_409_CONFLICT, "last_admin",
                      "This is the organization's only Admin. Make someone else an Admin first.")


def set_department(db: Session, membership: OrganizationMembership, unit_id: uuid.UUID | None, actor: Actor) -> None:
    """Moves the person to another home department. The old affiliation is ended, not deleted."""
    current = db.scalar(select(Affiliation).where(
        Affiliation.membership_id == membership.id, Affiliation.is_primary, Affiliation.ends_on.is_(None)))
    if current and current.unit_id == unit_id:
        return
    if unit_id is not None:
        find_unit(db, membership.organization_id, unit_id)
    if current:
        current.ends_on = date.today()
        db.flush()
    if unit_id is not None:
        db.add(Affiliation(membership_id=membership.id, unit_id=unit_id, is_primary=True,
                           starts_on=date.today(), created_by=actor.user.id))


def end_coordination(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db.execute(update(CoordinatorAssignment).where(
        CoordinatorAssignment.organization_id == org_id, CoordinatorAssignment.coordinator_user_id == user_id,
        CoordinatorAssignment.target == "unit", CoordinatorAssignment.ends_on.is_(None)
    ).values(ends_on=func.current_date()))


def apply_roles(db: Session, org_id: uuid.UUID, user_id: uuid.UUID, roles: list[str],
                coordinates_unit_id: uuid.UUID | None, actor: Actor, reason: str | None) -> None:
    wanted = set(roles)
    if "coordinator" in wanted and coordinates_unit_id is None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "coordinator_needs_department",
                      "Choose the department this Coordinator is responsible for.")
    current_rows = db.scalars(select(RoleAssignment).where(
        RoleAssignment.organization_id == org_id, RoleAssignment.user_id == user_id,
        RoleAssignment.revoked_at.is_(None))).all()
    current = {row.role for row in current_rows}

    if "admin" in current and "admin" not in wanted:
        ensure_not_last_admin(db, org_id, user_id)
    for row in current_rows:
        if row.role not in wanted:
            row.revoked_at = func.now()
            row.revoked_by = actor.user.id
            row.revoke_reason = reason
    for role in wanted - current:
        db.add(RoleAssignment(user_id=user_id, organization_id=org_id, role=role, granted_by=actor.user.id))

    assignment = db.scalar(select(CoordinatorAssignment).where(
        CoordinatorAssignment.organization_id == org_id, CoordinatorAssignment.coordinator_user_id == user_id,
        CoordinatorAssignment.target == "unit", CoordinatorAssignment.ends_on.is_(None)))
    target_unit = coordinates_unit_id if "coordinator" in wanted else None
    if assignment and assignment.unit_id == target_unit:
        return
    if assignment:
        assignment.ends_on = date.today()
        db.flush()
    if target_unit is not None:
        unit = find_unit(db, org_id, target_unit)
        holder = db.scalar(select(User).join(
            CoordinatorAssignment, CoordinatorAssignment.coordinator_user_id == User.id).where(
            CoordinatorAssignment.unit_id == unit.id, CoordinatorAssignment.target == "unit",
            CoordinatorAssignment.ends_on.is_(None)))
        if holder is not None:
            raise problem(status.HTTP_409_CONFLICT, "department_has_coordinator",
                          f"{unit.name.get('en', 'This department')} already has a Coordinator: {holder.display_name}. "
                          "Remove their Coordinator role first.")
        db.add(CoordinatorAssignment(organization_id=org_id, coordinator_user_id=user_id, target="unit",
                                     unit_id=unit.id, include_subunits=True, assigned_by=actor.user.id))


def snapshot(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    db.flush()
    p = one_person(db, org_id, user_id)
    return {"display_name": p.display_name, "status": p.status, "roles": p.roles,
            "department": str(p.department.id) if p.department else None,
            "coordinates": str(p.coordinates.id) if p.coordinates else None}


def commit_or_conflict(db: Session) -> None:
    """The database rules (one Coordinator per department, one home department per person) are the last word
    when two Admins change the same thing at once."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise problem(status.HTTP_409_CONFLICT, "conflict",
                      "Someone else changed this at the same time. Reload the page and try again.") from None


# --- changes ------------------------------------------------------------------------------------

@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
def register_person(org_id: uuid.UUID, body: PersonCreate,
                    actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_PEOPLE, org_id)
    email = str(body.email).strip().lower()
    domain = email.rpartition("@")[2]
    allowed = db.scalars(select(OrganizationDomain.domain).where(
        OrganizationDomain.organization_id == org_id, OrganizationDomain.verified_at.is_not(None))).all()
    if domain not in {d.lower() for d in allowed}:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "email_domain",
                      f"Use an address from the organization's domain ({', '.join(sorted(allowed)) or 'none set up'}).")

    user = db.scalar(select(User).where(func.lower(User.email) == email, User.deleted_at.is_(None)))
    if user is None:
        user = User(email=email, display_name=body.display_name.strip(), status="invited")
        db.add(user)
        db.flush()
    elif db.scalar(select(OrganizationMembership.id).where(
            OrganizationMembership.organization_id == org_id, OrganizationMembership.user_id == user.id)):
        raise problem(status.HTTP_409_CONFLICT, "already_registered", f"{email} is already registered here.")
    membership = OrganizationMembership(user_id=user.id, organization_id=org_id)
    db.add(membership)
    db.flush()

    apply_roles(db, org_id, user.id, body.roles, body.coordinates_unit_id, actor, None)
    set_department(db, membership, body.department_id, actor)
    audit.record(db, "person.registered", entity_type="user", entity_id=user.id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, after=snapshot(db, org_id, user.id), ip=actor.ip)
    commit_or_conflict(db)
    return one_person(db, org_id, user.id)


@router.patch("/{user_id}", response_model=PersonOut)
def update_person(org_id: uuid.UUID, user_id: uuid.UUID, body: PersonUpdate,
                  actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_PEOPLE, org_id, target_user_id=user_id)
    membership = membership_of(db, org_id, user_id)
    before = snapshot(db, org_id, user_id)
    if body.display_name is not None:
        db.get(User, user_id).display_name = body.display_name.strip()  # type: ignore[union-attr]
    if "department_id" in body.model_fields_set:
        set_department(db, membership, body.department_id, actor)
    audit.record(db, "person.updated", entity_type="user", entity_id=user_id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, before=before, after=snapshot(db, org_id, user_id),
                 ip=actor.ip)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)


@router.put("/{user_id}/roles", response_model=PersonOut)
def set_roles(org_id: uuid.UUID, user_id: uuid.UUID, body: RolesUpdate,
              actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_PEOPLE, org_id, target_user_id=user_id)
    membership_of(db, org_id, user_id)
    before = snapshot(db, org_id, user_id)
    apply_roles(db, org_id, user_id, body.roles, body.coordinates_unit_id, actor, body.reason)
    audit.record(db, "person.roles_changed", entity_type="user", entity_id=user_id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, before=before, after=snapshot(db, org_id, user_id),
                 reason=body.reason, ip=actor.ip)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)


@router.post("/{user_id}/deactivate", response_model=PersonOut)
def deactivate_person(org_id: uuid.UUID, user_id: uuid.UUID, body: Reason | None = None,
                      actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_PEOPLE, org_id, target_user_id=user_id)
    if user_id == actor.user.id:
        raise problem(status.HTTP_409_CONFLICT, "cannot_deactivate_self", "You can't deactivate your own account.")
    membership = membership_of(db, org_id, user_id)
    if membership.status != "active":
        raise problem(status.HTTP_409_CONFLICT, "already_deactivated", "This person is already deactivated.")
    if db.scalar(select(RoleAssignment.id).where(
            RoleAssignment.organization_id == org_id, RoleAssignment.user_id == user_id,
            RoleAssignment.role == "admin", RoleAssignment.revoked_at.is_(None))):
        ensure_not_last_admin(db, org_id, user_id)
    reason = body.reason if body else None
    before = snapshot(db, org_id, user_id)

    membership.status = "inactive"
    membership.left_on = date.today()
    # A deactivated Coordinator stops coordinating, so the department can get a new one
    db.execute(update(RoleAssignment).where(
        RoleAssignment.organization_id == org_id, RoleAssignment.user_id == user_id,
        RoleAssignment.role == "coordinator", RoleAssignment.revoked_at.is_(None)
    ).values(revoked_at=func.now(), revoked_by=actor.user.id, revoke_reason="deactivated"))
    end_coordination(db, org_id, user_id)
    # Signed out everywhere, immediately
    db.execute(update(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
               .values(revoked_at=func.now()))

    audit.record(db, "person.deactivated", entity_type="user", entity_id=user_id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, before=before, after=snapshot(db, org_id, user_id),
                 reason=reason, ip=actor.ip)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)


@router.post("/{user_id}/reactivate", response_model=PersonOut)
def reactivate_person(org_id: uuid.UUID, user_id: uuid.UUID, body: Reason | None = None,
                      actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_PEOPLE, org_id, target_user_id=user_id)
    membership = membership_of(db, org_id, user_id)
    if membership.status == "active":
        raise problem(status.HTTP_409_CONFLICT, "already_active", "This person is already active.")
    before = snapshot(db, org_id, user_id)
    membership.status = "active"
    membership.left_on = None
    audit.record(db, "person.reactivated", entity_type="user", entity_id=user_id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, before=before, after=snapshot(db, org_id, user_id),
                 reason=body.reason if body else None, ip=actor.ip)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)

