"""Organization structure: faculties (schools) and the departments (programs) inside them.

    Ilia State University
    └── School of Business, Technology and Education      (faculty)
        ├── Computer Science                              (department, has one Coordinator)
        └── Mathematics

Researchers belong to a department; each department has at most one Coordinator, its head. Admins create, rename
and move units; everyone in the organization can list them.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.authz import Action, Actor, authorize, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.models import Affiliation, CoordinatorAssignment, OrganizationMembership, OrganizationUnit, UnitType, User

router = APIRouter(prefix="/api/v1/orgs/{org_id}/units", tags=["structure"])

Kind = Literal["faculty", "department"]
TYPE_NAMES: dict[str, dict[str, str]] = {
    "faculty": {"en": "Faculty", "ka": "ფაკულტეტი"},
    "department": {"en": "Department", "ka": "დეპარტამენტი"},
}
KIND_LABEL = {"faculty": "faculty", "department": "department"}


class UnitRef(BaseModel):
    id: uuid.UUID
    name: dict[str, str]


class PersonRef(BaseModel):
    id: uuid.UUID
    display_name: str


class UnitOut(UnitRef):
    kind: Kind
    parent_id: uuid.UUID | None  # a department's faculty
    coordinator: PersonRef | None  # departments only
    member_count: int  # a faculty counts the people of all its departments


class UnitCreate(BaseModel):
    kind: Kind
    name_en: str = Field(min_length=1, max_length=200)
    name_ka: str | None = Field(default=None, max_length=200)
    parent_id: uuid.UUID | None = None  # required for a department: its faculty


class UnitUpdate(BaseModel):
    name_en: str = Field(min_length=1, max_length=200)
    name_ka: str | None = Field(default=None, max_length=200)
    parent_id: uuid.UUID | None = None  # departments: move to another faculty


def unit_name(name_en: str, name_ka: str | None) -> dict[str, str]:
    name = {"en": name_en.strip()}
    if name_ka and name_ka.strip():
        name["ka"] = name_ka.strip()
    return name


def faculty_has_no_parent():
    return problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "faculty_has_no_parent",
                   "A faculty isn't inside another unit.")


def type_ids(db: Session, org_id: uuid.UUID) -> dict[uuid.UUID, str]:
    """unit_type id -> "faculty" | "department" for this organization."""
    by_name = {names["en"]: kind for kind, names in TYPE_NAMES.items()}
    return {t.id: by_name.get(t.name.get("en", ""), "department")
            for t in db.scalars(select(UnitType).where(UnitType.organization_id == org_id))}


def unit_type_for(db: Session, org_id: uuid.UUID, kind: str) -> UnitType:
    unit_type = db.scalar(select(UnitType).where(
        UnitType.organization_id == org_id, UnitType.name["en"].astext == TYPE_NAMES[kind]["en"]))
    if unit_type is None:
        unit_type = UnitType(organization_id=org_id, name=TYPE_NAMES[kind],
                             sort_order=0 if kind == "faculty" else 1)
        db.add(unit_type)
        db.flush()
    return unit_type


def kind_of(db: Session, unit: OrganizationUnit) -> str:
    return type_ids(db, unit.organization_id).get(unit.unit_type_id, "department")


def find_unit(db: Session, org_id: uuid.UUID, unit_id: uuid.UUID, kind: str | None = None) -> OrganizationUnit:
    unit = db.get(OrganizationUnit, unit_id)
    if unit is None or unit.organization_id != org_id or unit.deleted_at is not None or unit.archived_at is not None:
        label = KIND_LABEL.get(kind or "", "unit")
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, f"unknown_{label}", f"That {label} doesn't exist.")
    if kind is not None and kind_of(db, unit) != kind:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, f"not_a_{kind}",
                      f"Choose a {kind}, not a {'department' if kind == 'faculty' else 'faculty'}.")
    return unit


def find_department(db: Session, org_id: uuid.UUID, unit_id: uuid.UUID) -> OrganizationUnit:
    """People belong to, and Coordinators head, departments, never faculties."""
    return find_unit(db, org_id, unit_id, "department")


def ensure_unique_name(db: Session, org_id: uuid.UUID, kind: str, parent_id: uuid.UUID | None, name_en: str,
                       except_id: uuid.UUID | None = None) -> None:
    """Faculty names are unique in the organization; department names within their faculty."""
    kinds = type_ids(db, org_id)
    siblings = db.scalars(select(OrganizationUnit).where(
        OrganizationUnit.organization_id == org_id, OrganizationUnit.deleted_at.is_(None),
        func.lower(OrganizationUnit.name["en"].astext) == name_en.lower())).all()
    for unit in siblings:
        same_level = kind == "faculty" or unit.parent_id == parent_id
        if unit.id != except_id and kinds.get(unit.unit_type_id) == kind and same_level:
            where = "" if kind == "faculty" else " in this faculty"
            raise problem(status.HTTP_409_CONFLICT, f"duplicate_{kind}",
                          f"A {kind} named “{name_en}” already exists{where}.")


@router.get("", response_model=list[UnitOut])
def list_units(org_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    authorize(db, actor, Action.VIEW_UNITS, org_id)
    kinds = type_ids(db, org_id)
    units = db.scalars(select(OrganizationUnit).where(
        OrganizationUnit.organization_id == org_id, OrganizationUnit.deleted_at.is_(None),
        OrganizationUnit.archived_at.is_(None))).all()
    coordinators = dict(db.execute(
        select(CoordinatorAssignment.unit_id, User)
        .join(User, User.id == CoordinatorAssignment.coordinator_user_id)
        .where(CoordinatorAssignment.organization_id == org_id, CoordinatorAssignment.target == "unit",
               CoordinatorAssignment.ends_on.is_(None))).all())
    counts = dict(db.execute(
        select(Affiliation.unit_id, func.count())
        .join(OrganizationMembership, OrganizationMembership.id == Affiliation.membership_id)
        .where(OrganizationMembership.organization_id == org_id, OrganizationMembership.status == "active",
               Affiliation.is_primary, Affiliation.ends_on.is_(None))
        .group_by(Affiliation.unit_id)).all())
    for unit in units:  # a faculty's count includes its departments
        if kinds.get(unit.unit_type_id) == "department" and unit.parent_id:
            counts[unit.parent_id] = counts.get(unit.parent_id, 0) + counts.get(unit.id, 0)
    result = [
        UnitOut(id=u.id, name=u.name, kind=kinds.get(u.unit_type_id, "department"), parent_id=u.parent_id,  # type: ignore[arg-type]
                member_count=counts.get(u.id, 0),
                coordinator=PersonRef(id=c.id, display_name=c.display_name) if (c := coordinators.get(u.id)) else None)
        for u in units
    ]
    return sorted(result, key=lambda u: (u.kind != "faculty", u.name.get("en", "").lower()))


@router.post("", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
def create_unit(org_id: uuid.UUID, body: UnitCreate, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_UNITS, org_id)
    if body.kind == "faculty" and body.parent_id is not None:
        raise faculty_has_no_parent()
    if body.kind == "department":
        if body.parent_id is None:
            raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "department_needs_faculty",
                          "Choose the faculty this department belongs to.")
        find_unit(db, org_id, body.parent_id, "faculty")
    name = unit_name(body.name_en, body.name_ka)
    ensure_unique_name(db, org_id, body.kind, body.parent_id, name["en"])
    unit = OrganizationUnit(organization_id=org_id, unit_type_id=unit_type_for(db, org_id, body.kind).id,
                            parent_id=body.parent_id, name=name)
    db.add(unit)
    db.flush()
    audit.record(db, f"{body.kind}.created", entity_type="organization_unit", entity_id=unit.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id,
                 after={"name": name, "parent_id": str(body.parent_id) if body.parent_id else None}, ip=actor.ip)
    db.commit()
    return UnitOut(id=unit.id, name=unit.name, kind=body.kind, parent_id=unit.parent_id,
                   coordinator=None, member_count=0)


@router.patch("/{unit_id}", response_model=UnitOut)
def update_unit(org_id: uuid.UUID, unit_id: uuid.UUID, body: UnitUpdate,
                actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """Renames a faculty or department, or moves a department to another faculty."""
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_UNITS, org_id)
    unit = find_unit(db, org_id, unit_id)
    kind = kind_of(db, unit)
    parent_id = unit.parent_id
    if "parent_id" in body.model_fields_set:
        if kind == "faculty" and body.parent_id is not None:
            raise faculty_has_no_parent()
        if kind == "department":
            if body.parent_id is None:
                raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "department_needs_faculty",
                              "Choose the faculty this department belongs to.")
            find_unit(db, org_id, body.parent_id, "faculty")
        parent_id = body.parent_id
    name = unit_name(body.name_en, body.name_ka)
    ensure_unique_name(db, org_id, kind, parent_id, name["en"], except_id=unit.id)
    before = {"name": unit.name, "parent_id": str(unit.parent_id) if unit.parent_id else None}
    unit.name = name
    unit.parent_id = parent_id
    audit.record(db, f"{kind}.updated", entity_type="organization_unit", entity_id=unit.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, before=before,
                 after={"name": name, "parent_id": str(parent_id) if parent_id else None}, ip=actor.ip)
    db.commit()
    return next(u for u in list_units(org_id, actor, db) if u.id == unit.id)
