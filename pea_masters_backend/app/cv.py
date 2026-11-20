"""The CV builder's CV: one document per person with what they write for the CV itself (headline, research statement,
links, talks) and how it's laid out and shared. Qualifications, research, teaching and research outputs (publications,
datasets, software) come from the profile and aren't copied here; the CV only lists the outputs it leaves out.
Saving (the page's Save button) sends the whole document; it's checked against the shape below (anything unknown is
dropped) before it's stored. Publications still sent by an older page are moved to the profile's research outputs."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app import audit
from app.auth.sessions import client_ip, current_user
from app.db import get_db
from app.models import Cv, ResearchOutput, User
from app.research_outputs import OutputIn, existing_keys, key_of

router = APIRouter(tags=["cv"])


class Part(BaseModel):
    model_config = ConfigDict(extra="ignore")


def text(limit: int, default: str = ""):
    return Field(default, max_length=limit)


SectionId = Literal["summary", "interests", "appointments", "education", "publications", "outputs", "grants", "talks",
                    "teaching", "supervision", "awards", "memberships", "service", "patents", "languages", "metrics"]


class Publication(Part):
    id: str = text(64)
    type: Literal["Journal article", "Conference paper", "Book", "Book chapter", "Preprint", "Thesis", "Report"]
    status: Literal["Published", "In press", "Under review", "Preprint"]
    authors: str = text(3000)
    title: str = text(600)
    venue: str = text(400)
    year: str = text(10)
    volume: str = text(40)
    issue: str = text(40)
    pages: str = text(40)
    doi: str = text(300)
    url: str = text(1000)


class Talk(Part):
    id: str = text(64)
    title: str = text(400)
    event: str = text(400)
    location: str = text(200)
    date: str = text(10)
    type: Literal["Invited talk", "Keynote", "Contributed talk", "Poster", "Seminar"]


class Section(Part):
    id: SectionId
    enabled: bool


class PublicFields(Part):
    email: bool = True
    phone: bool = False
    metrics: bool = True


class Personal(Part):
    headline: str = text(120)
    phone: str = text(40)
    summary: str = text(1200)


class Profiles(Part):
    orcid: str = text(300)
    scopus: str = text(300)
    researcherId: str = text(300)  # noqa: N815 (the frontend's names)
    scholar: str = text(300)
    researchGate: str = text(300)  # noqa: N815
    semanticScholar: str = text(300)  # noqa: N815
    website: str = text(300)
    github: str = text(300)


class Metrics(Part):
    hIndex: str = text(4)  # noqa: N815
    citations: str = text(7)
    source: str = text(40)
    asOf: str = text(7)  # noqa: N815


class CvData(Part):
    """Mirrors CvData in src/Pages/CvBuilder/cv-model.ts"""
    version: Literal[1] = 1
    visibility: Literal["private", "public"] = "private"
    publicFields: PublicFields = Field(default_factory=PublicFields)  # noqa: N815
    template: Literal["classic", "modern", "compact"] = "classic"
    citationStyle: Literal["APA", "IEEE", "Harvard"] = "APA"  # noqa: N815
    sections: list[Section] = Field(default_factory=list, max_length=20)
    personal: Personal = Field(default_factory=Personal)
    profiles: Profiles = Field(default_factory=Profiles)
    useProfileInterests: bool = True  # noqa: N815
    interests: list[str] = Field(default_factory=list, max_length=30)
    # Research outputs (on the profile) this CV leaves out; everything else is shown
    hiddenOutputs: list[Annotated[str, Field(max_length=64)]] = Field(default_factory=list, max_length=2000)  # noqa: N815
    talks: list[Talk] = Field(default_factory=list, max_length=200)
    metrics: Metrics = Field(default_factory=Metrics)


class CvDataIn(CvData):
    # Sent only by pages from before publications moved to the profile: moved there when saved
    publications: list[Publication] = Field(default_factory=list, max_length=500)


class CvIn(BaseModel):
    data: CvDataIn


class CvOut(BaseModel):
    data: CvData | None  # None: no CV saved yet
    updated_at: datetime | None


@router.get("/api/v1/me/cv", response_model=CvOut)
def my_cv(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cv = db.get(Cv, user.id)
    return CvOut(data=CvData.model_validate(cv.data) if cv else None, updated_at=cv.updated_at if cv else None)


def move_publications(db: Session, user: User, publications: list[Publication]) -> int:
    """Publications sent with a CV go to the profile's research outputs, skipping ones already there"""
    keys = existing_keys(db, user)
    moved = 0
    for pub in publications:
        year = int(pub.year) if pub.year.isdigit() and 1900 <= int(pub.year) <= 2100 else None
        try:
            output = OutputIn(kind="publication", subtype=pub.type, status=pub.status, title=pub.title or "Untitled",
                              authors=pub.authors, venue=pub.venue, year=year, volume=pub.volume, issue=pub.issue,
                              pages=pub.pages, doi=pub.doi, url=pub.url, source="cv")
        except ValueError:
            output = OutputIn(kind="publication", subtype=pub.type, status=pub.status, title=pub.title or "Untitled",
                              authors=pub.authors, venue=pub.venue, year=year, source="cv")  # without a bad DOI or link
        key = key_of(output.doi, output.title, output.year)
        if key in keys:
            continue
        keys.add(key)
        db.add(ResearchOutput(user_id=user.id, **output.model_dump()))
        moved += 1
    return moved


@router.put("/api/v1/me/cv", response_model=CvOut)
def save_cv(body: CvIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.data.publications:
        moved = move_publications(db, user, body.data.publications)
        if moved:
            audit.record(db, "research_output.imported", entity_type="research_output", entity_id=user.id,
                         actor_user_id=user.id, after={"added": moved, "sources": ["cv"]}, ip=client_ip(request))
    data = CvData.model_validate(body.data.model_dump(exclude={"publications"})).model_dump()
    data["interests"] = list(dict.fromkeys(item.strip()[:120] for item in data["interests"] if item.strip()))
    before = db.get(Cv, user.id)
    if (before.data.get("visibility") if before else "private") != data["visibility"]:
        # Who made their CV public, and when: worth knowing. Ordinary saves aren't logged.
        audit.record(db, "cv.visibility_changed", entity_type="cv", entity_id=user.id, actor_user_id=user.id,
                     after={"visibility": data["visibility"]}, ip=client_ip(request))
    statement = insert(Cv).values(user_id=user.id, data=data)
    row = db.execute(statement.on_conflict_do_update(
        index_elements=[Cv.user_id],
        set_={"data": statement.excluded.data, "updated_at": statement.excluded.updated_at},
    ).returning(Cv.updated_at)).one()
    db.commit()
    return CvOut(data=CvData.model_validate(data), updated_at=row.updated_at)
