"""Authorization: one place that decides who may do what.

Every protected endpoint calls `authorize(...)`, which runs the same steps:
  1. who is asking (the signed-in user, from the session cookie)
  2. their roles in the organization the request is about (Root counts everywhere)
  3. scope: a Coordinator only reaches the Members of the departments they coordinate
  4. the record's state is checked by the endpoint itself (e.g. "already deactivated")
  5. refusals are written to the audit log; endpoints audit the changes they make

Hiding a button in the frontend is only a convenience; these checks are what protect the data.
"""

import uuid
from dataclasses import dataclass, field
from enum import StrEnum

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import Select, literal, select, union
from sqlalchemy.orm import Session, aliased

from app import audit
from app.auth.sessions import client_ip, current_user
from app.db import get_db
from app.models import (
    Affiliation,
    CoordinatorAssignment,
    Organization,
    OrganizationMembership,
    OrganizationUnit,
    RoleAssignment,
    User,
)


class Action(StrEnum):
    VIEW_PEOPLE = "people.view"
    MANAGE_PEOPLE = "people.manage"  # register, change roles, change department, deactivate
    VIEW_UNITS = "units.view"
    MANAGE_UNITS = "units.manage"


# Which organization roles may perform each action. Root may do everything, in every organization.
POLICY: dict[Action, frozenset[str]] = {
    Action.VIEW_PEOPLE: frozenset({"admin", "coordinator"}),  # Coordinators: only their departments' Members
    Action.MANAGE_PEOPLE: frozenset({"admin"}),
    Action.VIEW_UNITS: frozenset({"admin", "coordinator", "member"}),
    Action.MANAGE_UNITS: frozenset({"admin"}),
}

# Strongest first; the strongest role that allows an action is the one acted under
ROLE_STRENGTH = ("admin", "coordinator", "member")


@dataclass
class Actor:
    user: User
    is_root: bool
    roles: dict[uuid.UUID, set[str]] = field(default_factory=dict)  # organization -> roles (active memberships only)
    ip: str | None = None

    def roles_in(self, org_id: uuid.UUID) -> set[str]:
        return self.roles.get(org_id, set())


def get_actor(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Actor:
    """Dependency: the signed-in user with their current roles."""
    rows = db.execute(
        select(RoleAssignment.organization_id, RoleAssignment.role)
        .outerjoin(OrganizationMembership, (OrganizationMembership.user_id == RoleAssignment.user_id)
                   & (OrganizationMembership.organization_id == RoleAssignment.organization_id))
        .where(RoleAssignment.user_id == user.id, RoleAssignment.revoked_at.is_(None),
               # Root has no organization; organization roles count only while the membership is active
               (RoleAssignment.role == "root") | (OrganizationMembership.status == "active"))
    ).all()
    actor = Actor(user=user, is_root=False, ip=client_ip(request))
    for org_id, role in rows:
        if role == "root":
            actor.is_root = True
        else:
            actor.roles.setdefault(org_id, set()).add(role)
    return actor


def deny(db: Session, actor: Actor, action: str, org_id: uuid.UUID | None, target_user_id: uuid.UUID | None = None):
    db.rollback()
    audit.record(db, "authz.denied", entity_type="permission", entity_id=action, actor_user_id=actor.user.id,
                 organization_id=org_id, after={"target_user_id": str(target_user_id) if target_user_id else None},
                 ip=actor.ip)
    db.commit()
    raise HTTPException(status.HTTP_403_FORBIDDEN,
                        {"code": "forbidden", "message": "You don't have permission to do this."})


def authorize(db: Session, actor: Actor, action: Action, org_id: uuid.UUID,
              *, target_user_id: uuid.UUID | None = None) -> str:
    """Allows the action or raises 403 (and audits the refusal). Returns the role it was allowed under."""
    if actor.is_root:
        return "root"
    allowed = actor.roles_in(org_id) & POLICY[action]
    role = next((r for r in ROLE_STRENGTH if r in allowed), None)
    if role == "coordinator" and target_user_id is not None:
        visible = db.scalar(select(literal(True)).where(
            target_user_id_in_scope(actor.user.id, org_id, target_user_id)))
        if not visible:
            role = None
    if role is None:
        deny(db, actor, action, org_id, target_user_id)
    return role  # type: ignore[return-value]


def coordinated_members(coordinator_id: uuid.UUID, org_id: uuid.UUID) -> Select:
    """User ids of the Members a Coordinator handles: everyone currently in their departments (and sub-units),
    plus anyone assigned to them individually."""
    ca = CoordinatorAssignment
    scope = (
        select(ca.unit_id.label("unit_id"), ca.include_subunits.label("deep"))
        .where(ca.coordinator_user_id == coordinator_id, ca.organization_id == org_id,
               ca.target == "unit", ca.ends_on.is_(None))
        .cte("scope", recursive=True)
    )
    child = aliased(OrganizationUnit)
    scope = scope.union(
        select(child.id, literal(True))
        .join(scope, child.parent_id == scope.c.unit_id)
        .where(scope.c.deep, child.deleted_at.is_(None))
    )
    in_units = (
        select(OrganizationMembership.user_id)
        .join(Affiliation, Affiliation.membership_id == OrganizationMembership.id)
        .join(scope, scope.c.unit_id == Affiliation.unit_id)
        .where(OrganizationMembership.organization_id == org_id, OrganizationMembership.status == "active",
               Affiliation.ends_on.is_(None))
    )
    direct = select(ca.member_user_id).where(
        ca.coordinator_user_id == coordinator_id, ca.organization_id == org_id,
        ca.target == "member", ca.ends_on.is_(None))
    return union(in_units, direct)


def target_user_id_in_scope(coordinator_id: uuid.UUID, org_id: uuid.UUID, target_user_id: uuid.UUID):
    members = coordinated_members(coordinator_id, org_id).subquery()
    return select(members.c.user_id).where(members.c.user_id == target_user_id).exists()


def get_organization(db: Session, org_id: uuid.UUID) -> Organization:
    org = db.get(Organization, org_id)
    if org is None or org.deleted_at is not None or org.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, {"code": "not_found", "message": "Organization not found."})
    return org
