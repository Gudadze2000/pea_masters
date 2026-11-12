"""Departments of an organization (organization_units). Admins create and rename them; everyone in the
organization can list them."""

import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, true
from sqlalchemy.orm import Session

from app import audit
from app.authz import Action, Actor, authorize, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.models import Affiliation, CoordinatorAssignment, OrganizationMembership, OrganizationUnit, UnitType, User

router = APIRouter(prefix="/api/v1/orgs/{org_id}/units", tags=["departments"])

DEPARTMENT_TYPE_NAME = {"en": "Department", "ka": "დეპარტამენტი"}


class UnitRef(BaseModel):
    id: uuid.UUID
    name: dict[str, str]


class PersonRef(BaseModel):
    id: uuid.UUID
    display_name: str


class UnitOut(UnitRef):
    coordinator: PersonRef | None
    member_count: int


class UnitIn(BaseModel):
    name_en: str = Field(min_length=1, max_length=200)
    name_ka: str | None = Field(default=None, max_length=200)


def unit_name(body: UnitIn) -> dict[str, str]:
    name = {"en": body.name_en.strip()}
    if body.name_ka and body.name_ka.strip():
        name["ka"] = body.name_ka.strip()
    return name


def find_unit(db: Session, org_id: uuid.UUID, unit_id: uuid.UUID) -> OrganizationUnit:
    unit = db.get(OrganizationUnit, unit_id)
    if unit is None or unit.organization_id != org_id or unit.deleted_at is not None or unit.archived_at is not None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_department", "That department doesn't exist.")
    return unit


def ensure_unique_name(db: Session, org_id: uuid.UUID, name_en: str, except_id: uuid.UUID | None = None) -> None:
    clash = db.scalar(select(OrganizationUnit.id).where(
        OrganizationUnit.organization_id == org_id, OrganizationUnit.deleted_at.is_(None),
        func.lower(OrganizationUnit.name["en"].astext) == name_en.lower(),
        OrganizationUnit.id != except_id if except_id else true()))
    if clash:
        raise problem(status.HTTP_409_CONFLICT, "duplicate_department",
                      f"A department named “{name_en}” already exists.")


@router.get("", response_model=list[UnitOut])
def list_units(org_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    authorize(db, actor, Action.VIEW_UNITS, org_id)
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
    result = [
        UnitOut(id=u.id, name=u.name, member_count=counts.get(u.id, 0),
                coordinator=PersonRef(id=c.id, display_name=c.display_name) if (c := coordinators.get(u.id)) else None)
        for u in units
    ]
    return sorted(result, key=lambda u: u.name.get("en", "").lower())


@router.post("", response_model=UnitRef, status_code=status.HTTP_201_CREATED)
def create_unit(org_id: uuid.UUID, body: UnitIn, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_UNITS, org_id)
    name = unit_name(body)
    ensure_unique_name(db, org_id, name["en"])
    unit_type = db.scalar(select(UnitType).where(
        UnitType.organization_id == org_id, UnitType.name["en"].astext == DEPARTMENT_TYPE_NAME["en"]))
    if unit_type is None:
        unit_type = UnitType(organization_id=org_id, name=DEPARTMENT_TYPE_NAME)
        db.add(unit_type)
        db.flush()
    unit = OrganizationUnit(organization_id=org_id, unit_type_id=unit_type.id, name=name)
    db.add(unit)
    db.flush()
    audit.record(db, "department.created", entity_type="organization_unit", entity_id=unit.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id, after={"name": name},
                 ip=actor.ip)
    db.commit()
    return UnitRef(id=unit.id, name=unit.name)


@router.patch("/{unit_id}", response_model=UnitRef)
def rename_unit(org_id: uuid.UUID, unit_id: uuid.UUID, body: UnitIn,
                actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_UNITS, org_id)
    unit = find_unit(db, org_id, unit_id)
    name = unit_name(body)
    ensure_unique_name(db, org_id, name["en"], except_id=unit.id)
    before = unit.name
    unit.name = name
    audit.record(db, "department.renamed", entity_type="organization_unit", entity_id=unit.id,
                 actor_user_id=actor.user.id, acting_role=role, organization_id=org_id,
                 before={"name": before}, after={"name": name}, ip=actor.ip)
    db.commit()
    return UnitRef(id=unit.id, name=unit.name)
