"""Research outputs on a person's profile: publications, datasets, and software and code.

Kept all year (not only during an evaluation), added by hand, by DOI (the app looks it up in Crossref or DataCite) or
imported from Web of Science, ORCID or BibTeX. One DOI appears once per person: importing an output that's already
there skips it. Only the person changes their own; the CV builder and the evaluation form read from here."""

import re
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.auth.sessions import client_ip, current_user
from app.db import get_db
from app.errors import problem
from app.models import ResearchOutput, User

router = APIRouter(prefix="/api/v1/me/research-outputs", tags=["research outputs"])

Kind = Literal["publication", "dataset", "software"]
Source = Literal["manual", "doi", "wos", "orcid", "bibtex", "cv"]

SUBTYPES: dict[str, tuple[str, ...]] = {
    "publication": ("Journal article", "Conference paper", "Book", "Book chapter", "Preprint", "Thesis", "Report"),
    "dataset": ("Dataset", "Database"),
    "software": ("Software", "Code", "Model"),
}
STATUSES = ("Published", "In press", "Under review", "Preprint")
MAX_IMPORT = 500


def text(limit: int):
    return Field("", max_length=limit)


def clean_doi(value: str) -> str:
    """"https://doi.org/10.1000/ABC" → "10.1000/abc"; empty when there's none"""
    value = value.strip()
    value = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", value, flags=re.I)
    return value.lower()


class OutputIn(BaseModel):
    kind: Kind
    subtype: str = Field(max_length=40)
    status: str = Field("Published", max_length=20)
    title: str = Field(min_length=1, max_length=600)
    authors: str = text(3000)
    venue: str = text(400)
    year: int | None = Field(None, ge=1900, le=2100)
    volume: str = text(40)
    issue: str = text(40)
    pages: str = text(40)
    version: str = text(60)
    license: str = text(100)
    doi: str = text(300)
    url: str = text(1000)
    description: str = text(2000)
    source: Source = "manual"

    @model_validator(mode="after")
    def _check(self) -> "OutputIn":
        if self.subtype not in SUBTYPES[self.kind]:
            raise ValueError(f"A {self.kind} can be: {', '.join(SUBTYPES[self.kind])}")
        if self.status not in STATUSES:
            raise ValueError(f"Status can be: {', '.join(STATUSES)}")
        self.title = " ".join(self.title.split())
        self.doi = clean_doi(self.doi)
        if self.doi and not re.fullmatch(r"10\.\d{4,9}/\S+", self.doi):
            raise ValueError("That isn't a DOI. A DOI looks like 10.1038/nature14539.")
        if self.url and not re.match(r"https?://", self.url.strip(), re.I):
            raise ValueError("The link must start with http:// or https://")
        return self


class OutputOut(OutputIn):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ImportIn(BaseModel):
    items: list[OutputIn] = Field(min_length=1, max_length=MAX_IMPORT)


class ImportOut(BaseModel):
    added: list[OutputOut]
    skipped: int  # already on the profile (same DOI, or the same title and year without one)


FIELDS = ("kind", "subtype", "status", "title", "authors", "venue", "year", "volume", "issue", "pages", "version",
          "license", "doi", "url", "description", "source")


def to_out(output: ResearchOutput) -> OutputOut:
    return OutputOut(id=output.id, created_at=output.created_at, updated_at=output.updated_at,
                     **{name: getattr(output, name) for name in FIELDS})


def title_key(title: str) -> str:
    return re.sub(r"\W+", "", title.lower())


def existing_keys(db: Session, user: User, except_id: uuid.UUID | None = None) -> set[str]:
    """What makes two outputs the same: their DOI, or (without one) their title and year"""
    rows = db.execute(select(ResearchOutput.id, ResearchOutput.doi, ResearchOutput.title, ResearchOutput.year)
                      .where(ResearchOutput.user_id == user.id)).all()
    return {key_of(doi, title, year) for output_id, doi, title, year in rows if output_id != except_id}


def key_of(doi: str, title: str, year: int | None) -> str:
    return f"doi:{doi}" if doi else f"title:{title_key(title)}:{year or ''}"


def own(db: Session, user: User, output_id: uuid.UUID) -> ResearchOutput:
    output = db.get(ResearchOutput, output_id)
    if output is None or output.user_id != user.id:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Research output not found.")
    return output


def record(db: Session, request: Request, user: User, action: str, output: ResearchOutput) -> None:
    audit.record(db, action, entity_type="research_output", entity_id=output.id, actor_user_id=user.id,
                 after={"kind": output.kind, "title": output.title[:200]}, ip=client_ip(request))


@router.get("", response_model=list[OutputOut])
def my_outputs(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Newest first; outputs without a year (e.g. under review) come first"""
    rows = db.scalars(select(ResearchOutput).where(ResearchOutput.user_id == user.id)
                      .order_by(ResearchOutput.year.desc().nulls_first(), ResearchOutput.created_at.desc())).all()
    return [to_out(output) for output in rows]


@router.post("", response_model=OutputOut, status_code=status.HTTP_201_CREATED)
def add_output(body: OutputIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if key_of(body.doi, body.title, body.year) in existing_keys(db, user):
        raise problem(status.HTTP_409_CONFLICT, "duplicate", "This is already on your profile.")
    output = ResearchOutput(user_id=user.id, **body.model_dump())
    db.add(output)
    db.flush()
    record(db, request, user, "research_output.added", output)
    db.commit()
    db.refresh(output)
    return to_out(output)


@router.post("/import", response_model=ImportOut)
def import_outputs(body: ImportIn, request: Request, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    """Adds many at once (Web of Science, ORCID, BibTeX, the CV builder). Ones already there are skipped."""
    keys = existing_keys(db, user)
    added: list[ResearchOutput] = []
    for item in body.items:
        key = key_of(item.doi, item.title, item.year)
        if key in keys:
            continue
        keys.add(key)
        output = ResearchOutput(user_id=user.id, **item.model_dump())
        db.add(output)
        added.append(output)
    db.flush()
    if added:
        audit.record(db, "research_output.imported", entity_type="research_output", entity_id=user.id,
                     actor_user_id=user.id, ip=client_ip(request),
                     after={"added": len(added), "sources": sorted({o.source for o in added})})
    db.commit()
    for output in added:
        db.refresh(output)
    return ImportOut(added=[to_out(o) for o in added], skipped=len(body.items) - len(added))


@router.put("/{output_id}", response_model=OutputOut)
def update_output(output_id: uuid.UUID, body: OutputIn, request: Request, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    output = own(db, user, output_id)
    if key_of(body.doi, body.title, body.year) in existing_keys(db, user, except_id=output.id):
        raise problem(status.HTTP_409_CONFLICT, "duplicate", "Another output on your profile has this DOI or title.")
    for name, value in body.model_dump().items():
        if name != "source":  # how it was first added stays
            setattr(output, name, value)
    output.updated_at = func.now()
    record(db, request, user, "research_output.updated", output)
    db.commit()
    db.refresh(output)
    return to_out(output)


@router.delete("/{output_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_output(output_id: uuid.UUID, request: Request, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    output = own(db, user, output_id)
    record(db, request, user, "research_output.deleted", output)
    db.delete(output)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
