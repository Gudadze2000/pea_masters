"""Research output overview: the Web of Science documents of the people an Admin or Coordinator manages,
per person and per year, found by the ResearcherID / ORCID iD on each profile. Admins see the whole organization or one
faculty or department; Coordinators see their own department. Each person's search is cached for a day
(app/wos.py), so opening the overview again costs no requests."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.authz import Action, Actor, authorize, coordinated_members, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.models import Affiliation, OrganizationMembership, OrganizationUnit, Profile, User
from app.wos import author_query, author_records, h_index, times_cited

router = APIRouter(tags=["research output"])


class PersonOutput(BaseModel):
    user_id: uuid.UUID
    name: str
    department: dict[str, str] | None  # localized name
    researcher_id: str | None
    orcid: str | None
    documents: int | None  # None: no identifier, or Web of Science couldn't be reached
    times_cited: int | None
    h_index: int | None
    by_year: dict[int, int]
    error: str | None = None


class ResearchOutput(BaseModel):
    from_year: int
    to_year: int
    people: list[PersonOutput]  # people with identifiers first, most documents first
    documents: int  # distinct documents: an article by two colleagues counts once
    by_year: dict[int, int]  # distinct documents per year
    without_identifiers: int
    checked_at: datetime | None  # the oldest of the answers used


def people_in_scope(db: Session, actor: Actor, role: str, org_id: uuid.UUID, unit_id: uuid.UUID | None):
    """(user, identifiers, department) for the active people the actor may see, optionally within one unit."""
    query = (
        select(User, Profile.identifiers, OrganizationUnit)
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .outerjoin(Affiliation, (Affiliation.membership_id == OrganizationMembership.id)
                   & Affiliation.is_primary & Affiliation.ends_on.is_(None))
        .outerjoin(OrganizationUnit, OrganizationUnit.id == Affiliation.unit_id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .where(OrganizationMembership.organization_id == org_id, OrganizationMembership.status == "active",
               User.status != "deactivated", User.deleted_at.is_(None))
        .order_by(User.display_name)
    )
    if role == "coordinator":
        query = query.where(User.id.in_(coordinated_members(actor.user.id, org_id)))
    if unit_id:
        unit = db.get(OrganizationUnit, unit_id)
        if unit is None or unit.organization_id != org_id or unit.deleted_at is not None:
            raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_unit",
                          "That faculty or department doesn't exist.")
        # A faculty includes its departments
        query = query.where(or_(OrganizationUnit.id == unit_id, OrganizationUnit.parent_id == unit_id))
    return db.execute(query).all()


@router.get("/api/v1/orgs/{org_id}/research-output", response_model=ResearchOutput)
def research_output(org_id: uuid.UUID, from_year: int = Query(ge=1900, le=2100),
                    to_year: int = Query(ge=1900, le=2100), unit_id: uuid.UUID | None = None,
                    actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    get_organization(db, org_id)
    role = authorize(db, actor, Action.VIEW_RESEARCH_OUTPUT, org_id)
    if from_year > to_year:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_years",
                      "The first year must come before the last.")

    people: list[PersonOutput] = []
    distinct: dict[str, int] = {}  # document uid → year
    checked: list[datetime] = []
    for user, identifiers, department in people_in_scope(db, actor, role, org_id, unit_id):
        ids = dict(identifiers or {})
        person = PersonOutput(user_id=user.id, name=user.display_name,
                              department=department.name if department else None,
                              researcher_id=ids.get("researcher_id"), orcid=ids.get("orcid"),
                              documents=None, times_cited=None, h_index=None, by_year={})
        query = author_query(ids, from_year, to_year)
        if query:
            try:
                _, records, checked_at = author_records(db, query)
            except HTTPException as error:
                if error.detail.get("code") == "wos_not_configured":
                    raise
                person.error = error.detail.get("message")
            else:
                checked.append(checked_at)
                citations = [times_cited(record) for record in records]
                person.documents, person.times_cited, person.h_index = len(records), sum(citations), h_index(citations)
                for record in records:
                    year = (record.get("source") or {}).get("publishYear")
                    if isinstance(year, int):
                        person.by_year[year] = person.by_year.get(year, 0) + 1
                        distinct[record.get("uid") or f"{user.id}:{len(distinct)}"] = year
        people.append(person)

    by_year: dict[int, int] = {}
    for year in distinct.values():
        by_year[year] = by_year.get(year, 0) + 1
    people.sort(key=lambda p: (p.documents is None, -(p.documents or 0), p.name))
    return ResearchOutput(
        from_year=from_year, to_year=to_year, people=people, documents=len(distinct),
        by_year=dict(sorted(by_year.items())),
        without_identifiers=sum(1 for p in people if not (p.researcher_id or p.orcid)),
        checked_at=min(checked) if checked else None,
    )
