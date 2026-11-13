"""Academic positions of an organization (Professor, Associate Professor, ...). Admins manage the list;
everyone in the organization can read it. A person's position is set on their department affiliation (people.py)."""

import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.authz import Action, Actor, authorize, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.models import Affiliation, OrganizationMembership, Position

router = APIRouter(prefix="/api/v1/orgs/{org_id}/positions", tags=["structure"])


class PositionOut(BaseModel):
    id: uuid.UUID
    name: dict[str, str]
    holder_count: int


class PositionIn(BaseModel):
    name_en: str = Field(min_length=1, max_length=200)
    name_ka: str | None = Field(default=None, max_length=200)


def position_name(body: PositionIn) -> dict[str, str]:
    name = {"en": body.name_en.strip()}
    if body.name_ka and body.name_ka.strip():
        name["ka"] = body.name_ka.strip()
    return name


def find_position(db: Session, org_id: uuid.UUID, position_id: uuid.UUID) -> Position:
    position = db.get(Position, position_id)
    if position is None or position.organization_id != org_id or position.archived_at is not None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_position",
                      "That academic position doesn't exist.")
    return position


def ensure_unique(db: Session, org_id: uuid.UUID, name_en: str, except_id: uuid.UUID | None = None) -> None:
    clash = db.scalar(select(Position.id).where(
        Position.organization_id == org_id, Position.archived_at.is_(None),
        func.lower(Position.name["en"].astext) == name_en.lower(), Position.id != except_id))
    if clash:
        raise problem(status.HTTP_409_CONFLICT, "duplicate_position", f"The position “{name_en}” already exists.")


def list_of(db: Session, org_id: uuid.UUID) -> list[PositionOut]:
    counts = dict(db.execute(
        select(Affiliation.position_id, func.count())
        .join(OrganizationMembership, OrganizationMembership.id == Affiliation.membership_id)
        .where(OrganizationMembership.organization_id == org_id, OrganizationMembership.status == "active",
               Affiliation.is_primary, Affiliation.ends_on.is_(None), Affiliation.position_id.is_not(None))
        .group_by(Affiliation.position_id)).all())
    positions = db.scalars(select(Position).where(
        Position.organization_id == org_id, Position.archived_at.is_(None))).all()
    return sorted((PositionOut(id=p.id, name=p.name, holder_count=counts.get(p.id, 0)) for p in positions),
                  key=lambda p: p.name.get("en", "").lower())


@router.get("", response_model=list[PositionOut])
def list_positions(org_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    authorize(db, actor, Action.VIEW_UNITS, org_id)
    return list_of(db, org_id)


@router.post("", response_model=PositionOut, status_code=status.HTTP_201_CREATED)
def create_position(org_id: uuid.UUID, body: PositionIn, actor: Actor = Depends(get_actor),
                    db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_UNITS, org_id)
    name = position_name(body)
    ensure_unique(db, org_id, name["en"])
    position = Position(organization_id=org_id, name=name)
    db.add(position)
    db.flush()
    audit.record(db, "position.created", entity_type="position", entity_id=position.id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, after={"name": name}, ip=actor.ip)
    db.commit()
    return PositionOut(id=position.id, name=name, holder_count=0)


@router.patch("/{position_id}", response_model=PositionOut)
def rename_position(org_id: uuid.UUID, position_id: uuid.UUID, body: PositionIn,
                    actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.MANAGE_UNITS, org_id)
    position = find_position(db, org_id, position_id)
    name = position_name(body)
    ensure_unique(db, org_id, name["en"], except_id=position.id)
    before = position.name
    position.name = name
    audit.record(db, "position.renamed", entity_type="position", entity_id=position.id, actor_user_id=actor.user.id,
                 acting_role=role, organization_id=org_id, before={"name": before}, after={"name": name},
                 ip=actor.ip)
    db.commit()
    return next(p for p in list_of(db, org_id) if p.id == position.id)
