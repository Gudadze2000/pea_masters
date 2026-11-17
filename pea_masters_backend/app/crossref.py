"""DOI details from Crossref, the registry behind most DOIs: whether a DOI exists at all, and what it points to
(type, title, journal or book, ISSNs, year, authors). Used when an article isn't in Web of Science (books, chapters,
Scopus-only journals, very new articles). Crossref's public API needs no key; settings.crossref_mailto (a project
address, never a person's) puts PEA in Crossref's faster "polite" pool."""

import logging
from datetime import datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.sessions import current_user
from app.config import settings
from app.db import get_db
from app.errors import problem
from app.lookups import cached
from app.models import User
from app.wos import normalize_doi

router = APIRouter(tags=["crossref"])
log = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(10.0, connect=5.0)
FOUND_FOR = timedelta(days=30)  # a registered work's details rarely change
MISSING_FOR = timedelta(days=1)


class CrossrefWork(BaseModel):
    doi: str
    found: bool  # False: the DOI isn't registered with Crossref
    type: str | None = None  # journal-article, book-chapter, proceedings-article, ...
    title: str | None = None
    container_title: str | None = None  # journal, book or proceedings
    issns: list[str] = []
    publisher: str | None = None
    year: int | None = None
    authors: list[str] = []  # "Family, Given"
    checked_at: datetime


def user_agent() -> str:
    contact = f"; mailto:{settings.crossref_mailto}" if settings.crossref_mailto else ""
    return f"PEA/1.0 (academic evaluation portal{contact})"


def fetch_work(doi: str) -> dict[str, Any] | None:
    """Crossref's record for the DOI, or None when it isn't registered. Raises on any other failure."""
    response = httpx.get(f"{settings.crossref_url}/works/{doi}", timeout=TIMEOUT,
                         headers={"User-Agent": user_agent(), "Accept": "application/json"})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json().get("message")


def to_work(doi: str, record: dict[str, Any] | None, checked_at: datetime) -> CrossrefWork:
    if record is None:
        return CrossrefWork(doi=doi, found=False, checked_at=checked_at)
    issued = ((record.get("issued") or {}).get("date-parts") or [[None]])[0]
    year = issued[0] if issued and isinstance(issued[0], int) else None
    authors = [", ".join(part for part in (a.get("family"), a.get("given")) if part) or a.get("name", "")
               for a in record.get("author") or []]
    first = lambda key: (record.get(key) or [None])[0]  # noqa: E731
    return CrossrefWork(
        doi=doi, found=True, type=record.get("type"), title=first("title"), container_title=first("container-title"),
        issns=list(dict.fromkeys(record.get("ISSN") or [])), publisher=record.get("publisher"), year=year,
        authors=[a for a in authors if a][:100], checked_at=checked_at,
    )


@router.get("/api/v1/crossref/lookup", response_model=CrossrefWork)
def lookup(doi: str = Query(max_length=300), user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Whether a DOI is registered, and what it is. Any signed-in person may ask."""
    normalized = normalize_doi(doi)
    if normalized is None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_doi",
                      "That isn't a DOI. A DOI looks like 10.1038/nature14539.")
    try:
        record, checked_at = cached(db, "crossref.work", normalized, lambda: fetch_work(normalized),
                                    FOUND_FOR, MISSING_FOR)
    except (httpx.HTTPError, ValueError):
        log.warning("Crossref lookup failed", exc_info=True)
        raise problem(status.HTTP_503_SERVICE_UNAVAILABLE, "crossref_unavailable",
                      "Crossref couldn't be reached. Try again later.") from None
    return to_work(normalized, record, checked_at)
