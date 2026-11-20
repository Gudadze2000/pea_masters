"""People in an organization.

Admins register anyone, set roles and departments, and deactivate people. Coordinators
register Researchers into their own department, correct their names, and deactivate or reactivate them; they
can't grant roles, move people between departments, or act on other Coordinators and Admins.
"Member" in the database is shown as "Researcher" in the app."""

import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, TypeAdapter, ValidationError
from sqlalchemy import func, literal, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.authz import (
    Action,
    Actor,
    authorize,
    coordinated_members,
    get_actor,
    get_organization,
    target_user_id_in_scope,
)
from app.db import get_db
from app.errors import problem
from app.models import (
    Affiliation,
    CoordinatorAssignment,
    OrganizationDomain,
    OrganizationMembership,
    OrganizationUnit,
    Position,
    RoleAssignment,
    User,
    UserSession,
)
from app.names import name_from_email
from app.positions import find_position
from app.units import UnitRef, find_department

router = APIRouter(prefix="/api/v1/orgs/{org_id}/people", tags=["people"])

Role = Literal["admin", "coordinator", "member"]
Status = Literal["invited", "active", "deactivated"]
NameSource = Literal["registration", "google", "manual"]
ROLE_ORDER = ["admin", "coordinator", "member"]


class PersonOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    name_source: NameSource  # registration (replaced at first sign-in) | google (official) | manual (kept)
    status: Status
    roles: list[Role]
    department: UnitRef | None
    faculty: UnitRef | None  # the department's faculty
    position: UnitRef | None  # academic position, e.g. Associate Professor
    coordinates: UnitRef | None  # the department this person coordinates
    last_login_at: datetime | None


class PeopleList(BaseModel):
    people: list[PersonOut]
    can_register: bool  # Admins, and Coordinators for their own department
    can_manage_roles: bool  # Admins: roles, moving people between departments, structure


class PersonCreate(BaseModel):
    email: EmailStr
    # Optional: guessed from name.surname.N@ addresses; replaced by the official Google name at first sign-in
    display_name: str | None = Field(default=None, max_length=200)
    roles: list[Role] = Field(min_length=1)
    department_id: uuid.UUID | None = None
    coordinates_unit_id: uuid.UUID | None = None
    position_id: uuid.UUID | None = None  # Admins only; needs a department


class PersonUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    department_id: uuid.UUID | None = None  # send null to clear
    position_id: uuid.UUID | None = None  # Admins only; send null to clear


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
        query = query.where(User.id.in_(coordinated_members(visible_to_coordinator, org_id, include_inactive=True)))
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
    positions = {user_id: UnitRef(id=p.id, name=p.name) for user_id, p in db.execute(
        select(OrganizationMembership.user_id, Position)
        .join(Affiliation, Affiliation.membership_id == OrganizationMembership.id)
        .join(Position, Position.id == Affiliation.position_id)
        .where(OrganizationMembership.organization_id == org_id, OrganizationMembership.user_id.in_(ids),
               Affiliation.is_primary, Affiliation.ends_on.is_(None)))}
    department_parents = dict(db.execute(select(OrganizationUnit.id, OrganizationUnit.parent_id).where(
        OrganizationUnit.id.in_([d.id for d in departments.values()]))).all())
    faculty_ids = {p for p in department_parents.values() if p}
    faculties = {u.id: UnitRef(id=u.id, name=u.name) for u in db.scalars(
        select(OrganizationUnit).where(OrganizationUnit.id.in_(faculty_ids)))} if faculty_ids else {}

    def faculty_of(user_id: uuid.UUID) -> UnitRef | None:
        department = departments.get(user_id)
        parent = department_parents.get(department.id) if department else None
        return faculties.get(parent) if parent else None

    coordinates = {user_id: UnitRef(id=unit.id, name=unit.name) for user_id, unit in db.execute(
        select(CoordinatorAssignment.coordinator_user_id, OrganizationUnit)
        .join(OrganizationUnit, OrganizationUnit.id == CoordinatorAssignment.unit_id)
        .where(CoordinatorAssignment.organization_id == org_id, CoordinatorAssignment.target == "unit",
               CoordinatorAssignment.coordinator_user_id.in_(ids),
               CoordinatorAssignment.ends_on.is_(None)))}

    people = [
        PersonOut(id=user.id, email=user.email, display_name=user.display_name,
                  name_source=user.name_source,  # type: ignore[arg-type]
                  status=person_status(user, membership),
                  roles=sorted(roles.get(user.id, set()), key=ROLE_ORDER.index),  # type: ignore[arg-type]
                  department=departments.get(user.id), faculty=faculty_of(user.id), position=positions.get(user.id),
                  coordinates=coordinates.get(user.id),
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
    return PeopleList(people=people, can_register=True, can_manage_roles=role in ("admin", "root"))


@router.get("/{user_id}", response_model=PersonOut)
def get_person(org_id: uuid.UUID, user_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    authorize(db, actor, Action.VIEW_PEOPLE, org_id, target_user_id=user_id)
    return one_person(db, org_id, user_id)


# --- rules shared by the changes below ----------------------------------------------------------

def coordinated_departments(db: Session, org_id: uuid.UUID, coordinator_id: uuid.UUID) -> list[uuid.UUID]:
    return list(db.scalars(select(CoordinatorAssignment.unit_id).where(
        CoordinatorAssignment.organization_id == org_id, CoordinatorAssignment.coordinator_user_id == coordinator_id,
        CoordinatorAssignment.target == "unit", CoordinatorAssignment.ends_on.is_(None))))


def coordinator_may_act_on(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Coordinators act on Researchers only, never on other Coordinators or Admins."""
    roles = set(db.scalars(select(RoleAssignment.role).where(
        RoleAssignment.organization_id == org_id, RoleAssignment.user_id == user_id,
        RoleAssignment.revoked_at.is_(None))))
    if roles - {"member"}:
        raise problem(status.HTTP_403_FORBIDDEN, "researchers_only",
                      "Coordinators can only manage Researchers. Ask an Admin.")


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
        find_department(db, membership.organization_id, unit_id)
    if current:
        current.ends_on = date.today()
        db.flush()
    if unit_id is not None:  # the academic position moves with them
        db.add(Affiliation(membership_id=membership.id, unit_id=unit_id, is_primary=True, starts_on=date.today(),
                           position_id=current.position_id if current else None, created_by=actor.user.id))


def set_position(db: Session, membership: OrganizationMembership, position_id: uuid.UUID | None,
                 actor: Actor) -> None:
    """Gives the person an academic position in their department. Like a move, the old row is ended, not changed."""
    db.flush()
    current = db.scalar(select(Affiliation).where(
        Affiliation.membership_id == membership.id, Affiliation.is_primary, Affiliation.ends_on.is_(None)))
    if current is None:
        if position_id is None:
            return
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "position_needs_department",
                      "Choose their department first: the academic position is held in a department.")
    if current.position_id == position_id:
        return
    if position_id is not None:
        find_position(db, membership.organization_id, position_id)
    current.ends_on = date.today()
    db.flush()
    db.add(Affiliation(membership_id=membership.id, unit_id=current.unit_id, is_primary=True, starts_on=date.today(),
                       position_id=position_id, created_by=actor.user.id))


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
        unit = find_department(db, org_id, target_unit)
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
            "position": str(p.position.id) if p.position else None,
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

def allowed_domains(db: Session, org_id: uuid.UUID) -> list[str]:
    return sorted(d.lower() for d in db.scalars(select(OrganizationDomain.domain).where(
        OrganizationDomain.organization_id == org_id, OrganizationDomain.verified_at.is_not(None))))


def add_person(db: Session, org_id: uuid.UUID, body: PersonCreate, actor: Actor, role: str,
               *, domains: list[str] | None = None, audited: bool = True, quick_audit: bool = False,
               reason: str | None = None) -> uuid.UUID:
    """Registers one person in the caller's transaction, or raises a problem. Shared by the "Add person" form and the
    spreadsheet import, so both follow exactly the same rules. The caller commits.
    The import passes the organization's domains (looked up once for all rows) and quick_audit: the audit entry is
    built from what was just saved instead of reading the person back, which is the same for a new registration."""
    department_id = body.department_id
    if role == "coordinator":
        if set(body.roles) != {"member"} or body.coordinates_unit_id is not None:
            raise problem(status.HTTP_403_FORBIDDEN, "researchers_only",
                          "Coordinators can register Researchers only. Ask an Admin for other roles.")
        coordinated = coordinated_departments(db, org_id, actor.user.id)
        if department_id is None and len(coordinated) == 1:
            department_id = coordinated[0]
        if department_id not in coordinated:
            raise problem(status.HTTP_403_FORBIDDEN, "own_department_only",
                          "You can register Researchers in your own department only.")
        if body.position_id is not None:
            raise problem(status.HTTP_403_FORBIDDEN, "admins_set_positions", "Only Admins set academic positions.")
    email = str(body.email).strip().lower()
    domain = email.rpartition("@")[2]
    allowed = domains if domains is not None else allowed_domains(db, org_id)
    if domain not in allowed:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "email_domain",
                      f"Use an address from the organization's domain ({', '.join(sorted(allowed)) or 'none set up'}).")

    user = db.scalar(select(User).where(func.lower(User.email) == email, User.deleted_at.is_(None)))
    if user is None:
        display_name = (body.display_name or "").strip() or name_from_email(email)
        if not display_name:
            raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "name_required",
                          "Enter their name: it can't be worked out from this email address.")
        user = User(email=email, display_name=display_name, name_source="registration", status="invited")
        db.add(user)
        db.flush()
    elif db.scalar(select(OrganizationMembership.id).where(
            OrganizationMembership.organization_id == org_id, OrganizationMembership.user_id == user.id)):
        raise problem(status.HTTP_409_CONFLICT, "already_registered", f"{email} is already registered here.")
    membership = OrganizationMembership(user_id=user.id, organization_id=org_id)
    db.add(membership)
    db.flush()

    apply_roles(db, org_id, user.id, body.roles, body.coordinates_unit_id, actor, None)
    set_department(db, membership, department_id, actor)
    if body.position_id is not None:
        set_position(db, membership, body.position_id, actor)
    db.flush()
    if audited:
        if quick_audit:  # the same fields snapshot() reads back; a new membership is always active
            coordinates = body.coordinates_unit_id if "coordinator" in body.roles else None
            after = {"display_name": user.display_name,
                     "status": "deactivated" if user.status == "deactivated" or user.deleted_at else
                     "invited" if user.status == "invited" else "active",
                     "roles": [r for r in ROLE_ORDER if r in set(body.roles)],
                     "department": str(department_id) if department_id else None,
                     "position": str(body.position_id) if body.position_id else None,
                     "coordinates": str(coordinates) if coordinates else None}
        else:
            after = snapshot(db, org_id, user.id)
        audit.record(db, "person.registered", entity_type="user", entity_id=user.id, actor_user_id=actor.user.id,
                     acting_role=role, organization_id=org_id, after=after, reason=reason, ip=actor.ip)
    return user.id


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
def register_person(org_id: uuid.UUID, body: PersonCreate,
                    actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.REGISTER_PEOPLE, org_id)
    user_id = add_person(db, org_id, body, actor, role)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)


# --- spreadsheet import -------------------------------------------------------------------------

IMPORT_LIMIT = 1000
EMAIL = TypeAdapter(EmailStr)
FORMULA_START = ("=", "+", "-", "@")
LIST_REASON = "From a list (Add several people)"  # in the audit log


class ImportRow(BaseModel):
    """One row, as the browser read it from the spreadsheet (or the page) and the person checked it. Plain strings,
    so a bad cell is reported on its own row instead of failing the whole list."""
    email: str = Field(max_length=320)
    action: Literal["add", "deactivate"] = "add"
    # The rest only for "add"
    display_name: str | None = Field(default=None, max_length=200)
    roles: list[Role] = Field(default_factory=lambda: ["member"], max_length=3)
    department_id: uuid.UUID | None = None  # a Coordinator coordinates this department too


class ImportIn(BaseModel):
    rows: list[ImportRow] = Field(min_length=1, max_length=IMPORT_LIMIT)
    save: bool = False  # false: only check every row and report; nothing is saved
    reason: str | None = Field(default=None, max_length=500)  # kept in the audit log for deactivations


class ImportResult(BaseModel):
    email: str
    code: str | None  # null: this row is fine
    message: str | None


class ImportOut(BaseModel):
    results: list[ImportResult]  # in the order of the rows sent
    errors: int
    registered: int  # both 0 unless saved
    deactivated: int


def import_row_problem(row: ImportRow, seen: set[str]) -> HTTPException | None:
    """Checks that don't need the database."""
    email = row.email.strip().lower()
    try:
        EMAIL.validate_python(email)
    except ValidationError:
        return problem(422, "invalid_email", "This isn't a valid email address.")
    if email in seen:
        return problem(422, "duplicate_row", "This email is in the list more than once.")
    if row.action == "deactivate":
        return None
    if (row.display_name or "").strip().startswith(FORMULA_START):
        return problem(422, "formula", "A name can't start with =, +, - or @ (that's how spreadsheet formulas start).")
    if not row.roles:
        return problem(422, "roles_required", "Choose at least one role.")
    if "coordinator" in row.roles and row.department_id is None:
        return problem(422, "coordinator_needs_department", "A Coordinator needs the department they coordinate.")
    return None


def deactivate_by_email(db: Session, org_id: uuid.UUID, email: str, actor: Actor, role: str, reason: str | None,
                        audited: bool) -> None:
    user_id = db.scalar(select(User.id).join(OrganizationMembership, OrganizationMembership.user_id == User.id).where(
        OrganizationMembership.organization_id == org_id, func.lower(User.email) == email, User.deleted_at.is_(None)))
    in_scope = user_id is not None and (role != "coordinator" or db.scalar(
        select(literal(True)).where(target_user_id_in_scope(actor.user.id, org_id, user_id))))
    if not in_scope:  # Coordinators aren't told whether someone outside their department exists
        where = " in your department" if role == "coordinator" else ""
        raise problem(404, "not_registered", f"Nobody with this email is registered{where}.")
    deactivate_member(db, org_id, user_id, actor, role, reason, audited=audited)


@router.post("/import", response_model=ImportOut)
def import_people(org_id: uuid.UUID, body: ImportIn,
                  actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """Registers and deactivates up to 1000 people from a list the browser has read from a spreadsheet or the page
    (the file itself never reaches the server). Admins act on anyone; Coordinators register Researchers into their
    own department and deactivate their own Researchers, the same rules as the single-person buttons, which this
    reuses. Each row runs in its own savepoint, so one bad row is reported without hiding the others. Saved only when
    asked to and every row is fine: all or nothing. People already registered are reported, never changed."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.REGISTER_PEOPLE, org_id)

    results: list[ImportResult] = []
    seen: set[str] = set()
    domains = allowed_domains(db, org_id)
    for row in body.rows:
        email = row.email.strip().lower()
        error = import_row_problem(row, seen)
        seen.add(email)
        if error is None:
            try:
                with db.begin_nested():  # a refused row is undone on its own
                    if row.action == "deactivate":
                        deactivate_by_email(db, org_id, email, actor, role, body.reason or LIST_REASON,
                                            audited=body.save)
                    else:
                        person = PersonCreate.model_construct(
                            email=email, display_name=(row.display_name or "").strip() or None, roles=row.roles,
                            department_id=row.department_id,
                            coordinates_unit_id=row.department_id if "coordinator" in row.roles else None,
                            position_id=None)
                        add_person(db, org_id, person, actor, role, domains=domains, audited=body.save,
                                   quick_audit=True, reason=LIST_REASON)
            except HTTPException as refused:
                error = refused
            except IntegrityError:
                error = problem(409, "conflict", "This row clashes with another one in the list.")
        detail = error.detail if error is not None else {}
        results.append(ImportResult(email=row.email.strip(), code=detail.get("code"), message=detail.get("message")))

    errors = sum(1 for result in results if result.code)
    if not body.save or errors:
        db.rollback()
        return ImportOut(results=results, errors=errors, registered=0, deactivated=0)
    deactivated = sum(1 for row in body.rows if row.action == "deactivate")
    registered = len(body.rows) - deactivated
    audit.record(db, "people.imported", entity_type="organization", entity_id=org_id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, after={"registered": registered, "deactivated": deactivated},
                 reason=body.reason, ip=actor.ip)
    commit_or_conflict(db)
    return ImportOut(results=results, errors=0, registered=registered, deactivated=deactivated)


@router.patch("/{user_id}", response_model=PersonOut)
def update_person(org_id: uuid.UUID, user_id: uuid.UUID, body: PersonUpdate,
                  actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.EDIT_PEOPLE, org_id, target_user_id=user_id)
    membership = membership_of(db, org_id, user_id)
    if role == "coordinator":
        coordinator_may_act_on(db, org_id, user_id)
        if "department_id" in body.model_fields_set:
            raise problem(status.HTTP_403_FORBIDDEN, "admins_move_people",
                          "Only Admins can move people to another department.")
        if "position_id" in body.model_fields_set:
            raise problem(status.HTTP_403_FORBIDDEN, "admins_set_positions", "Only Admins set academic positions.")
    before = snapshot(db, org_id, user_id)
    user = db.get(User, user_id)
    if body.display_name is not None and body.display_name.strip() and body.display_name.strip() != user.display_name:
        user.display_name = body.display_name.strip()  # type: ignore[union-attr]
        user.name_source = "manual"  # a deliberate correction: Google's name won't replace it
    if "department_id" in body.model_fields_set:
        set_department(db, membership, body.department_id, actor)
    if "position_id" in body.model_fields_set:
        set_position(db, membership, body.position_id, actor)
    audit.record(db, "person.updated", entity_type="user", entity_id=user_id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, before=before, after=snapshot(db, org_id, user_id),
                 ip=actor.ip)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)


@router.put("/{user_id}/roles", response_model=PersonOut)
def set_roles(org_id: uuid.UUID, user_id: uuid.UUID, body: RolesUpdate,
              actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_ROLES, org_id, target_user_id=user_id)
    membership_of(db, org_id, user_id)
    before = snapshot(db, org_id, user_id)
    apply_roles(db, org_id, user_id, body.roles, body.coordinates_unit_id, actor, body.reason)
    audit.record(db, "person.roles_changed", entity_type="user", entity_id=user_id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, before=before, after=snapshot(db, org_id, user_id),
                 reason=body.reason, ip=actor.ip)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)


def deactivate_member(db: Session, org_id: uuid.UUID, user_id: uuid.UUID, actor: Actor, role: str,
                      reason: str | None, *, audited: bool = True) -> None:
    """Deactivates someone in the caller's transaction, or raises a problem. Shared by the Deactivate button and the
    spreadsheet import. The caller has checked that the actor may act on this person; the caller commits."""
    if user_id == actor.user.id:
        raise problem(status.HTTP_409_CONFLICT, "cannot_deactivate_self", "You can't deactivate your own account.")
    membership = membership_of(db, org_id, user_id)
    if role == "coordinator":
        coordinator_may_act_on(db, org_id, user_id)
    if membership.status != "active":
        raise problem(status.HTTP_409_CONFLICT, "already_deactivated", "This person is already deactivated.")
    if db.scalar(select(RoleAssignment.id).where(
            RoleAssignment.organization_id == org_id, RoleAssignment.user_id == user_id,
            RoleAssignment.role == "admin", RoleAssignment.revoked_at.is_(None))):
        ensure_not_last_admin(db, org_id, user_id)
    before = snapshot(db, org_id, user_id) if audited else None

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
    db.flush()
    if audited:
        audit.record(db, "person.deactivated", entity_type="user", entity_id=user_id, actor_user_id=actor.user.id,
                     acting_role=role, organization_id=org_id, before=before, after=snapshot(db, org_id, user_id),
                     reason=reason, ip=actor.ip)


@router.post("/{user_id}/deactivate", response_model=PersonOut)
def deactivate_person(org_id: uuid.UUID, user_id: uuid.UUID, body: Reason | None = None,
                      actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.EDIT_PEOPLE, org_id, target_user_id=user_id)
    deactivate_member(db, org_id, user_id, actor, role, body.reason if body else None)
    commit_or_conflict(db)
    return one_person(db, org_id, user_id)


@router.post("/{user_id}/reactivate", response_model=PersonOut)
def reactivate_person(org_id: uuid.UUID, user_id: uuid.UUID, body: Reason | None = None,
                      actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.EDIT_PEOPLE, org_id, target_user_id=user_id)
    membership = membership_of(db, org_id, user_id)
    if role == "coordinator":
        coordinator_may_act_on(db, org_id, user_id)
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

