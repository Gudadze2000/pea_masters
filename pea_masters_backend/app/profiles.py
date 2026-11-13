"""General information: a person's biography (English and Georgian) and photo, plus the institutional details shown
with it (organization, faculty, department, academic position). People edit their own; Admins and heads of
department can view the profiles of the people they manage."""

import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Request, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, storage
from app.auth.sessions import client_ip, current_user
from app.authz import Action, Actor, authorize, get_actor, get_organization
from app.db import get_db
from app.errors import problem
from app.models import (
    Affiliation,
    File,
    Organization,
    OrganizationMembership,
    OrganizationUnit,
    Position,
    Profile,
    User,
)
from app.richtext import clean, text_length

router = APIRouter(tags=["profiles"])

BIOGRAPHY_LANGUAGES = ("en", "ka")
BIOGRAPHY_MAX_CHARS = 3000
BIOGRAPHY_MAX_HTML = 6_000_000  # inline images are embedded, so the HTML can be much longer than its text
PHOTO_MAX_BYTES = 5 * 1024 * 1024
PHOTO_MIN_SIDE = 200
PHOTO_SIDE = 512
Image.MAX_IMAGE_PIXELS = 40_000_000  # refuse "decompression bombs" well before they use much memory


class Ref(BaseModel):
    id: uuid.UUID
    name: dict[str, str]


class AffiliationOut(BaseModel):
    organization: Ref
    faculty: Ref | None
    department: Ref | None
    position: Ref | None


class ProfileOut(BaseModel):
    user_id: uuid.UUID
    display_name: str
    given_name: str | None
    family_name: str | None
    email: str
    biography: dict[str, str]  # {"en": html, "ka": html}
    photo_url: str | None
    affiliations: list[AffiliationOut]  # one per organization the person is an active member of
    updated_at: datetime | None


class BiographyIn(BaseModel):
    biography: dict[str, str | None] = Field(description='{"en": html, "ka": html}; a missing language is unchanged')


def photo_url(file_id: uuid.UUID | None) -> str | None:
    return f"/api/v1/files/{file_id}" if file_id else None


def build_profile(db: Session, user: User) -> ProfileOut:
    profile = db.get(Profile, user.id)
    rows = db.execute(
        select(Organization, Affiliation)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .outerjoin(Affiliation, (Affiliation.membership_id == OrganizationMembership.id)
                   & Affiliation.is_primary & Affiliation.ends_on.is_(None))
        .where(OrganizationMembership.user_id == user.id, OrganizationMembership.status == "active",
               Organization.deleted_at.is_(None))
        .order_by(Organization.slug)
    ).all()
    affiliations = []
    for org, affiliation in rows:
        department = db.get(OrganizationUnit, affiliation.unit_id) if affiliation else None
        faculty = db.get(OrganizationUnit, department.parent_id) if department and department.parent_id else None
        position = db.get(Position, affiliation.position_id) if affiliation and affiliation.position_id else None
        affiliations.append(AffiliationOut(
            organization=Ref(id=org.id, name=org.name),
            faculty=Ref(id=faculty.id, name=faculty.name) if faculty else None,
            department=Ref(id=department.id, name=department.name) if department else None,
            position=Ref(id=position.id, name=position.name) if position else None,
        ))
    return ProfileOut(
        user_id=user.id, display_name=user.display_name, given_name=user.given_name, family_name=user.family_name,
        email=user.email, biography=dict(profile.biography) if profile else {},
        photo_url=photo_url(profile.photo_file_id) if profile else None,
        affiliations=affiliations, updated_at=profile.updated_at if profile else None,
    )


def profile_of(db: Session, user_id: uuid.UUID) -> Profile:
    profile = db.get(Profile, user_id)
    if profile is None:
        profile = Profile(user_id=user_id, biography={})
        db.add(profile)
        db.flush()
    return profile


def first_organization(db: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    return db.scalar(select(OrganizationMembership.organization_id).where(
        OrganizationMembership.user_id == user_id, OrganizationMembership.status == "active").limit(1))


@router.get("/api/v1/me/profile", response_model=ProfileOut)
def my_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return build_profile(db, user)


@router.put("/api/v1/me/profile", response_model=ProfileOut)
def update_my_profile(body: BiographyIn, request: Request, user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    unknown = set(body.biography) - set(BIOGRAPHY_LANGUAGES)
    if unknown:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown_language",
                      f"Biography languages are {', '.join(BIOGRAPHY_LANGUAGES)}.")
    profile = profile_of(db, user.id)
    biography = dict(profile.biography)
    for language, html in body.biography.items():
        if html is None:
            continue
        if len(html) > BIOGRAPHY_MAX_HTML:
            raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "biography_too_large",
                          "The biography is too large. Use fewer or smaller images.")
        cleaned = clean(html)
        if text_length(cleaned) > BIOGRAPHY_MAX_CHARS:
            raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "biography_too_long",
                          f"The biography can be at most {BIOGRAPHY_MAX_CHARS} characters.")
        biography[language] = cleaned
    profile.biography = biography
    profile.updated_at = func.now()
    audit.record(db, "profile.biography_updated", entity_type="profile", entity_id=user.id, actor_user_id=user.id,
                 after={lang: text_length(html) for lang, html in biography.items()},  # lengths, not the text
                 ip=client_ip(request))
    db.commit()
    return build_profile(db, user)


def normalized_photo(data: bytes) -> bytes:
    """Checks the upload really is a JPG or PNG, then centre-crops it to a 512×512 JPEG without metadata
    (location, camera details), so what's stored is always a small, clean image."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            kind = probe.format
            probe.verify()
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError):
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "not_an_image",
                      "This file isn't a JPG or PNG image.") from None
    if kind not in ("JPEG", "PNG"):
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "not_an_image", "Use a JPG or PNG image.")
    width, height = image.size
    if min(width, height) < PHOTO_MIN_SIDE:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "photo_too_small",
                      f"The photo is {width}×{height} px. Use one at least {PHOTO_MIN_SIDE}×{PHOTO_MIN_SIDE} px.")
    side = min(width, height)
    left, top = (width - side) // 2, (height - side) // 2
    square = image.convert("RGBA").crop((left, top, left + side, top + side)).resize((PHOTO_SIDE, PHOTO_SIDE))
    background = Image.new("RGB", square.size, "white")  # transparent PNG areas become white, not black
    background.paste(square, mask=square.getchannel("A"))
    out = io.BytesIO()
    background.save(out, "JPEG", quality=88, optimize=True)
    return out.getvalue()


def retire_photo(db: Session, profile: Profile, actor_id: uuid.UUID) -> None:
    if profile.photo_file_id:
        old = db.get(File, profile.photo_file_id)
        if old and old.deleted_at is None:
            old.deleted_at = func.now()
            old.deleted_by = actor_id
        profile.photo_file_id = None


@router.put("/api/v1/me/profile/photo", response_model=ProfileOut)
async def upload_my_photo(photo: UploadFile, request: Request, user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    data = await photo.read(PHOTO_MAX_BYTES + 1)
    if len(data) > PHOTO_MAX_BYTES:
        raise problem(status.HTTP_413_CONTENT_TOO_LARGE, "photo_too_large", "The photo must be 5 MB or smaller.")
    if not data:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "not_an_image", "The file is empty.")
    jpeg = normalized_photo(data)
    key, digest = storage.save(jpeg, f"photos/{user.id}", "jpg")
    file = File(organization_id=first_organization(db, user.id), owner_user_id=user.id, storage_key=key,
                original_name=(photo.filename or "photo")[:200], mime_type="image/jpeg", size_bytes=len(jpeg),
                sha256=digest, scan_status="clean")  # re-encoded by us above, so it holds nothing but pixels
    db.add(file)
    db.flush()
    profile = profile_of(db, user.id)
    retire_photo(db, profile, user.id)
    profile.photo_file_id = file.id
    profile.updated_at = func.now()
    audit.record(db, "profile.photo_changed", entity_type="profile", entity_id=user.id, actor_user_id=user.id,
                 after={"file_id": str(file.id)}, ip=client_ip(request))
    db.commit()
    return build_profile(db, user)


@router.delete("/api/v1/me/profile/photo", response_model=ProfileOut)
def remove_my_photo(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = profile_of(db, user.id)
    if profile.photo_file_id:
        retire_photo(db, profile, user.id)
        profile.updated_at = func.now()
        audit.record(db, "profile.photo_removed", entity_type="profile", entity_id=user.id, actor_user_id=user.id,
                     ip=client_ip(request))
    db.commit()
    return build_profile(db, user)


@router.get("/api/v1/orgs/{org_id}/people/{user_id}/profile", response_model=ProfileOut)
def person_profile(org_id: uuid.UUID, user_id: uuid.UUID, actor: Actor = Depends(get_actor),
                   db: Session = Depends(get_db)):
    """Admins see everyone's; heads of department see their department's people."""
    get_organization(db, org_id)
    authorize(db, actor, Action.VIEW_PEOPLE, org_id, target_user_id=user_id)
    member = db.scalar(select(OrganizationMembership.id).where(
        OrganizationMembership.organization_id == org_id, OrganizationMembership.user_id == user_id))
    user = db.get(User, user_id)
    if member is None or user is None or user.deleted_at is not None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "This person isn't part of the organization.")
    return build_profile(db, user)


@router.get("/api/v1/files/{file_id}", response_class=FileResponse)
def get_file(file_id: uuid.UUID, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    """Serves an uploaded file to its owner, Root, and anyone sharing an organization with the owner."""
    file = db.get(File, file_id)
    if file is None or file.deleted_at is not None:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "File not found.")
    if not (actor.is_root or file.owner_user_id == actor.user.id):
        owner_orgs = set(db.scalars(select(OrganizationMembership.organization_id).where(
            OrganizationMembership.user_id == file.owner_user_id)))
        if not owner_orgs & set(actor.roles):
            raise problem(status.HTTP_404_NOT_FOUND, "not_found", "File not found.")  # don't reveal it exists
    return FileResponse(
        storage.path_of(file.storage_key), media_type=file.mime_type,
        headers={"Cache-Control": "private, max-age=86400, immutable",  # a changed photo gets a new id
                 "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline"},
    )
