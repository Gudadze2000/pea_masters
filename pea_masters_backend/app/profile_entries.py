"""The person's own profile sections, stored on the server: qualification entries (education, employment, awards,
languages, video lectures, ...) with supporting documents, plus the Research and Teaching parts.

The profile is the person's own: what they save is on it straight away, with no review (only the evaluation form is
reviewed). The form fields of each section are defined by the frontend (src/Pages/Profile/qualifications/sections.ts);
the server keeps just enough of that to check what it stores: which fields are required and which must be web links."""

import re
import uuid
from dataclasses import dataclass
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import audit, storage
from app.auth.sessions import client_ip, current_user
from app.db import get_db
from app.errors import problem
from app.models import File, Profile, ProfileEntry, ProfileEntryFile, User
from app.profiles import first_organization, profile_of

router = APIRouter(tags=["profile sections"])


@dataclass(frozen=True)
class Rules:
    required: tuple[str, ...]
    urls: tuple[str, ...] = ("url",)


SECTIONS: dict[str, Rules] = {
    "education": Rules(("degree", "field", "institution", "end")),
    "employment": Rules(("position", "employer")),
    "languages": Rules(("language", "read", "write", "speak"), ()),
    "awards": Rules(("title", "body", "date")),
    "patents": Rules(("kind", "title", "inventors")),
    "memberships": Rules(("organisation", "role"), ()),
    "committees": Rules(("name", "role", "organisation")),
    "consultancy": Rules(("topic", "client")),
    "creative": Rules(("title", "kind", "start")),
    "videos": Rules(("title", "url")),
    "other": Rules(("title",)),
}

MAX_FIELDS = 40
MAX_VALUE = 5000
MAX_DOCUMENTS = 5
DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
_FIELD_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,40}$")
_URL = re.compile(r"^https?://[^\s/$.?#][^\s]*$", re.IGNORECASE)
# Recognised by their first bytes, never by the name or the browser's word
_SIGNATURES = {b"%PDF-": ("application/pdf", "pdf"), b"\x89PNG\r\n\x1a\n": ("image/png", "png"),
               b"\xff\xd8\xff": ("image/jpeg", "jpg")}


# --- shapes ----------------------------------------------------------------------------------------

class DocumentOut(BaseModel):
    id: uuid.UUID
    name: str
    size: int
    type: str
    url: str


class EntryOut(BaseModel):
    id: uuid.UUID
    section: str
    values: dict[str, str]
    documents: list[DocumentOut]
    updated_at: str


class EntryIn(BaseModel):
    values: dict[str, str]
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_DOCUMENTS)


class NewEntryIn(EntryIn):
    section: str


class SectionRowIn(BaseModel):
    id: uuid.UUID | None = None
    values: dict[str, str]


class SectionIn(BaseModel):
    entries: list[SectionRowIn] = Field(max_length=60)


# --- checks ----------------------------------------------------------------------------------------

def rules_for(section: str) -> Rules:
    if section not in SECTIONS:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_section", "That profile section doesn't exist.")
    return SECTIONS[section]


def clean_values(section: str, values: dict[str, str]) -> dict[str, str]:
    """Trims, drops empty fields, adds https:// to links, and checks the required fields are there."""
    rules = rules_for(section)
    if len(values) > MAX_FIELDS:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "too_many_fields", "Too many fields.")
    cleaned: dict[str, str] = {}
    for name, value in values.items():
        if not _FIELD_NAME.match(name):
            raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_field", f"Unknown field “{name[:40]}”.")
        value = value.strip()
        if not value:
            continue
        if len(value) > MAX_VALUE:
            raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "value_too_long",
                          f"“{name}” can be at most {MAX_VALUE} characters.")
        if name in rules.urls:
            value = value if re.match(r"^[a-z][a-z\d+.-]*:", value, re.IGNORECASE) else f"https://{value}"
            if not _URL.match(value):
                raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_url",
                              f"“{name}” must be a web address starting with https://")
        cleaned[name] = value
    missing = [name for name in rules.required if name not in cleaned]
    if missing:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "missing_fields", f"Fill in {', '.join(missing)}.")
    return cleaned


def own_entry(db: Session, user: User, entry_id: uuid.UUID) -> ProfileEntry:
    entry = db.get(ProfileEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Entry not found.")
    return entry


def own_documents(db: Session, user: User, ids: list[uuid.UUID]) -> list[File]:
    """The person's own uploaded documents, in the given order"""
    unique = list(dict.fromkeys(ids))
    files = {f.id: f for f in db.scalars(select(File).where(File.id.in_(unique)))} if unique else {}
    found = [files.get(i) for i in unique]
    if any(f is None or f.owner_user_id != user.id or f.purpose != "document" or f.deleted_at for f in found):
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_document", "One of the documents doesn't exist.")
    return found  # type: ignore[return-value]


def attach(db: Session, entry: ProfileEntry, files: list[File]) -> None:
    db.execute(delete(ProfileEntryFile).where(ProfileEntryFile.entry_id == entry.id))
    for position, file in enumerate(files):
        db.add(ProfileEntryFile(entry_id=entry.id, file_id=file.id, position=position))


def documents_of(db: Session, entry_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[DocumentOut]]:
    rows = db.execute(
        select(ProfileEntryFile.entry_id, File).join(File, File.id == ProfileEntryFile.file_id)
        .where(ProfileEntryFile.entry_id.in_(entry_ids), File.deleted_at.is_(None))
        .order_by(ProfileEntryFile.position)
    ).all() if entry_ids else []
    result: dict[uuid.UUID, list[DocumentOut]] = {}
    for entry_id, file in rows:
        result.setdefault(entry_id, []).append(DocumentOut(id=file.id, name=file.original_name, size=file.size_bytes,
                                                           type=file.mime_type, url=f"/api/v1/files/{file.id}"))
    return result


def to_out(entry: ProfileEntry, documents: list[DocumentOut]) -> EntryOut:
    return EntryOut(id=entry.id, section=entry.section, values=dict(entry.values), documents=documents,
                    updated_at=entry.updated_at.isoformat())


def one(db: Session, entry: ProfileEntry) -> EntryOut:
    db.refresh(entry)
    return to_out(entry, documents_of(db, [entry.id]).get(entry.id, []))


def record(db: Session, request: Request, user: User, action: str, entry: ProfileEntry) -> None:
    # The section only: the content itself is the person's own and stays in the entry
    audit.record(db, f"profile_entry.{action}", entity_type="profile_entry", entity_id=entry.id, actor_user_id=user.id,
                 after={"section": entry.section}, ip=client_ip(request))


# --- entries ---------------------------------------------------------------------------------------

@router.get("/api/v1/me/profile/entries", response_model=dict[str, list[EntryOut]])
def my_entries(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Every section's entries, newest first; sections without entries are listed empty."""
    entries = db.scalars(select(ProfileEntry).where(ProfileEntry.user_id == user.id)
                         .order_by(ProfileEntry.created_at.desc())).all()
    documents = documents_of(db, [e.id for e in entries])
    result: dict[str, list[EntryOut]] = {section: [] for section in SECTIONS}
    for entry in entries:
        result.setdefault(entry.section, []).append(to_out(entry, documents.get(entry.id, [])))
    return result


@router.post("/api/v1/me/profile/entries", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def add_entry(body: NewEntryIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    values = clean_values(body.section, body.values)
    files = own_documents(db, user, body.document_ids)
    entry = ProfileEntry(user_id=user.id, section=body.section, values=values)
    db.add(entry)
    db.flush()
    attach(db, entry, files)
    record(db, request, user, "created", entry)
    db.commit()
    return one(db, entry)


@router.put("/api/v1/me/profile/entries/{entry_id}", response_model=EntryOut)
def update_entry(entry_id: uuid.UUID, body: EntryIn, request: Request, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    entry = own_entry(db, user, entry_id)
    values = clean_values(entry.section, body.values)
    files = own_documents(db, user, body.document_ids)
    entry.values = values
    entry.updated_at = func.now()
    attach(db, entry, files)
    record(db, request, user, "updated", entry)
    db.commit()
    return one(db, entry)


@router.delete("/api/v1/me/profile/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: uuid.UUID, request: Request, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    entry = own_entry(db, user, entry_id)
    record(db, request, user, "deleted", entry)
    db.delete(entry)  # its document links go with it; the files stay until they're cleaned up
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/api/v1/me/profile/sections/{section}", response_model=list[EntryOut])
def replace_section(section: str, body: SectionIn, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    """Saves a whole section at once (the Languages table): rows with an id are updated, rows without one are added,
    and entries not sent are removed."""
    if section != "languages":
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "not_a_table", "Only Languages is saved as a whole.")
    existing = {e.id: e for e in db.scalars(select(ProfileEntry).where(
        ProfileEntry.user_id == user.id, ProfileEntry.section == section))}
    kept: set[uuid.UUID] = set()
    for row in body.entries:
        values = clean_values(section, row.values)
        entry = existing.get(row.id) if row.id else None
        if entry is None:
            entry = ProfileEntry(user_id=user.id, section=section, values=values)
            db.add(entry)
            db.flush()
            record(db, request, user, "created", entry)
        elif entry.values != values:
            entry.values = values
            entry.updated_at = func.now()
            record(db, request, user, "updated", entry)
        kept.add(entry.id)
    for entry in existing.values():
        if entry.id not in kept:
            record(db, request, user, "deleted", entry)
            db.delete(entry)
    db.commit()
    entries = db.scalars(select(ProfileEntry).where(ProfileEntry.user_id == user.id, ProfileEntry.section == section)
                         .order_by(ProfileEntry.created_at)).all()
    return [to_out(entry, []) for entry in entries]


# --- documents -------------------------------------------------------------------------------------

@router.post("/api/v1/me/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile, request: Request, user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    """A supporting document (PDF, JPG or PNG, at most 10 MB), to attach to entries. Only the owner, Admins of their
    organization and their Coordinator can open it (app/profiles.py get_file)."""
    data = await file.read(DOCUMENT_MAX_BYTES + 1)
    if len(data) > DOCUMENT_MAX_BYTES:
        raise problem(status.HTTP_413_CONTENT_TOO_LARGE, "document_too_large", "Documents can be at most 10 MB.")
    kind = next((found for signature, found in _SIGNATURES.items() if data.startswith(signature)), None)
    if kind is None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unsupported_document",
                      "Upload a PDF, JPG or PNG file.")
    mime, extension = kind
    key, digest = storage.save(data, f"documents/{user.id}", extension)
    name = re.sub(r"[\x00-\x1f/\\\\]+", "_", (file.filename or f"document.{extension}"))[:200]
    stored = File(organization_id=first_organization(db, user.id), owner_user_id=user.id, storage_key=key,
                  original_name=name, mime_type=mime, size_bytes=len(data), sha256=digest, purpose="document")
    db.add(stored)
    db.flush()
    audit.record(db, "document.uploaded", entity_type="file", entity_id=stored.id, actor_user_id=user.id,
                 after={"size": len(data), "type": mime}, ip=client_ip(request))
    db.commit()
    return DocumentOut(id=stored.id, name=name, size=len(data), type=mime, url=f"/api/v1/files/{stored.id}")


# --- research and teaching -------------------------------------------------------------------------

Short = Field(min_length=1, max_length=200)


class Project(BaseModel):
    id: str = Field(max_length=64)
    title: str = Short
    donor: str = Short
    startYear: str = Field(pattern=r"^\d{4}$")  # noqa: N815 (the frontend's names)
    endYear: str = Field("", pattern=r"^(\d{4})?$")  # noqa: N815
    type: Literal["International", "Local"]
    role: str = Short


class Collaboration(BaseModel):
    id: str = Field(max_length=64)
    name: str = Short
    institution: str = Short
    topic: str = Short


Keywords = list[str]


class Research(BaseModel):
    interests: Keywords = Field(default_factory=list, max_length=30)
    projects: list[Project] = Field(default_factory=list, max_length=100)
    collaborations: list[Collaboration] = Field(default_factory=list, max_length=100)
    organisations: Keywords = Field(default_factory=list, max_length=30)


class Teaching(BaseModel):
    interests: Keywords = Field(default_factory=list, max_length=30)


def keywords(items: list[str]) -> list[str]:
    cleaned = list(dict.fromkeys(item.strip() for item in items if item.strip()))
    if any(len(item) > 120 for item in cleaned):
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "keyword_too_long",
                      "Keywords can be at most 120 characters.")
    return cleaned


@router.get("/api/v1/me/profile/research", response_model=Research)
def my_research(user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = db.get(Profile, user.id)
    return Research.model_validate(profile.research if profile else {})


@router.put("/api/v1/me/profile/research", response_model=Research)
def save_research(body: Research, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    body.interests, body.organisations = keywords(body.interests), keywords(body.organisations)
    profile = profile_of(db, user.id)
    profile.research = body.model_dump()
    audit.record(db, "profile.research_updated", entity_type="profile", entity_id=user.id, actor_user_id=user.id,
                 after={"projects": len(body.projects), "collaborations": len(body.collaborations)},
                 ip=client_ip(request))
    db.commit()
    return body


@router.get("/api/v1/me/profile/teaching", response_model=Teaching)
def my_teaching(user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = db.get(Profile, user.id)
    return Teaching.model_validate(profile.teaching if profile else {})


@router.put("/api/v1/me/profile/teaching", response_model=Teaching)
def save_teaching(body: Teaching, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    body.interests = keywords(body.interests)
    profile = profile_of(db, user.id)
    profile.teaching = body.model_dump()
    audit.record(db, "profile.teaching_updated", entity_type="profile", entity_id=user.id, actor_user_id=user.id,
                 ip=client_ip(request))
    db.commit()
    return body
