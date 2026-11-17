"""Web of Science article checks: is this DOI indexed, where was it published, how often is it cited, and is the
person asking among its authors. Answers come from Clarivate's Web of Science Starter API and are cached in
wos_lookups, so each DOI is fetched at most once every few days (the plan allows 5 requests a second and 20,000 a
day). The API key stays on the server; the browser only talks to PEA."""

import logging
import re
import time
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.sessions import current_user
from app.config import settings
from app.db import get_db
from app.errors import problem
from app.lookups import cached
from app.models import Profile, User, WosAuthorSearch, WosLookup

router = APIRouter(tags=["web of science"])
log = logging.getLogger(__name__)

FOUND_FOR = timedelta(days=7)  # citation counts move slowly
NOT_FOUND_FOR = timedelta(days=1)  # new articles are indexed some weeks after publication, so check again soon
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
MAX_AUTHORS = 100
SEARCH_FOR = timedelta(days=1)  # a researcher's document list
PAGE_SIZE = 50  # the most the Starter API returns per page
MAX_DOCUMENTS = 1000
PAGE_PAUSE = 0.25  # seconds between pages, to stay under 5 requests a second

_DOI = re.compile(r"^10\.\d{4,9}/[^\s\"]+$")
_DOI_PREFIX = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*|doi\s+)", re.IGNORECASE)


class WosAuthor(BaseModel):
    name: str
    researcher_id: str | None


class WosArticle(BaseModel):
    doi: str
    found: bool
    title: str | None = None
    document_types: list[str] = []
    source_title: str | None = None
    year: int | None = None
    volume: str | None = None
    issue: str | None = None
    pages: str | None = None
    authors: list[WosAuthor] = []
    author_count: int = 0
    includes_you: bool | None = None  # null: no family name to compare
    times_cited: int | None = None
    record_url: str | None = None
    citing_url: str | None = None
    checked_at: datetime


def normalize_doi(raw: str) -> str | None:
    """"https://doi.org/10.1038/Nature14539." → "10.1038/nature14539"; None when it isn't a DOI."""
    doi = _DOI_PREFIX.sub("", raw.strip()).rstrip(".,;")
    doi = doi.lower()
    return doi if _DOI.match(doi) else None


def _documents_page(query: str, limit: int, page: int = 1) -> dict[str, Any]:
    response = httpx.get(
        f"{settings.wos_starter_url}/documents",
        params={"q": query, "limit": limit, "page": page},
        headers={"X-ApiKey": settings.clarivate_api_key, "Accept": "application/json"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def fetch_record(doi: str) -> dict[str, Any] | None:
    """Asks Clarivate for the record with this DOI. None: not in Web of Science. Raises on any failure."""
    hits = _documents_page(f'DO="{doi}"', 1).get("hits") or []
    return hits[0] if hits else None


def fetch_documents(query: str) -> tuple[int, list[dict[str, Any]]]:
    """Every record matching the query, page by page (at most MAX_DOCUMENTS). Returns (total, records)."""
    records: list[dict[str, Any]] = []
    page = 1
    while True:
        data = _documents_page(query, PAGE_SIZE, page)
        hits = data.get("hits") or []
        total = int((data.get("metadata") or {}).get("total") or 0)
        records.extend(hits)
        if not hits or len(records) >= min(total, MAX_DOCUMENTS):
            return total, records[:MAX_DOCUMENTS]
        page += 1
        time.sleep(PAGE_PAUSE)


def _fold(text: str) -> str:
    """Lower case without accents, so "Kekelidze" matches "KEKELIDZE" and "Müller" matches "Muller"."""
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)).casefold().strip()


def includes_person(record: dict[str, Any], user: User) -> bool | None:
    """Whether the person's family name is among the authors. Web of Science writes them as "LeCun, Y"."""
    family = user.family_name or (user.display_name.split()[-1] if user.display_name.strip() else "")
    if not family:
        return None
    wanted = _fold(family)
    for author in record.get("names", {}).get("authors", []):
        for field in ("wosStandard", "displayName"):
            surname = (author.get(field) or "").split(",")[0]
            if surname and _fold(surname) == wanted:
                return True
    return False


def to_article(doi: str, record: dict[str, Any] | None, checked_at: datetime, user: User) -> WosArticle:
    if record is None:
        return WosArticle(doi=doi, found=False, checked_at=checked_at)
    source = record.get("source") or {}
    authors = (record.get("names") or {}).get("authors") or []
    citations = next((c.get("count") for c in record.get("citations") or [] if c.get("db") == "WOS"), None)
    links = record.get("links") or {}
    year = source.get("publishYear")
    return WosArticle(
        doi=doi, found=True, title=record.get("title"), document_types=record.get("types") or [],
        source_title=source.get("sourceTitle"), year=year if isinstance(year, int) else None,
        volume=source.get("volume"), issue=source.get("issue"), pages=(source.get("pages") or {}).get("range"),
        authors=[WosAuthor(name=a.get("displayName") or a.get("wosStandard") or "", researcher_id=a.get("researcherId"))
                 for a in authors[:MAX_AUTHORS]],
        author_count=len(authors), includes_you=includes_person(record, user),
        times_cited=citations if isinstance(citations, int) else None,
        record_url=links.get("record"), citing_url=links.get("citingArticles"), checked_at=checked_at,
    )


def unavailable(code: str, message: str):
    return problem(status.HTTP_503_SERVICE_UNAVAILABLE, code, message)


def call_clarivate(fetch):
    """Runs a Clarivate request, turning every failure into a message people can act on."""
    if not settings.clarivate_api_key:
        raise unavailable("wos_not_configured", "Web of Science checks aren't set up on this server yet.")
    try:
        return fetch()
    except httpx.HTTPStatusError as error:
        code = error.response.status_code
        log.warning("Web of Science request failed with HTTP %s", code)
        if code == 429:
            raise unavailable("wos_busy", "Web of Science is busy right now. Try again in a minute.") from None
        if code in (401, 403):
            raise unavailable("wos_not_configured",
                              "PEA's Web of Science access isn't working. Tell an admin.") from None
        raise unavailable("wos_unavailable", "Web of Science couldn't be reached. Try again later.") from None
    except (httpx.HTTPError, ValueError):
        log.warning("Web of Science request failed", exc_info=True)
        raise unavailable("wos_unavailable", "Web of Science couldn't be reached. Try again later.") from None


def cache_records(db: Session, records: list[dict[str, Any]], now: datetime) -> None:
    """Stores each record under its DOI, so checking one of these articles later needs no request."""
    for record in records:
        doi = normalize_doi((record.get("identifiers") or {}).get("doi") or "")
        if doi:
            statement = insert(WosLookup).values(doi=doi, record=record, fetched_at=now)
            db.execute(statement.on_conflict_do_update(
                index_elements=[WosLookup.doi], set_={"record": statement.excluded.record, "fetched_at": now}))


@router.get("/api/v1/wos/lookup", response_model=WosArticle)
def lookup(doi: str = Query(max_length=300, description="A DOI, with or without https://doi.org/"),
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Looks an article up in Web of Science Core Collection by DOI. Any signed-in person may ask."""
    normalized = normalize_doi(doi)
    if normalized is None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_doi",
                      "That isn't a DOI. A DOI looks like 10.1038/nature14539.")

    now = datetime.now(UTC)
    cached = db.get(WosLookup, normalized)
    if cached and now - cached.fetched_at < (FOUND_FOR if cached.record else NOT_FOUND_FOR):
        return to_article(normalized, cached.record, cached.fetched_at, user)

    record = call_clarivate(lambda: fetch_record(normalized))

    # Upsert: two people may check the same new DOI at the same moment
    statement = insert(WosLookup).values(doi=normalized, record=record, fetched_at=now)
    db.execute(statement.on_conflict_do_update(index_elements=[WosLookup.doi],
                                               set_={"record": statement.excluded.record, "fetched_at": now}))
    db.commit()
    return to_article(normalized, record, now, user)


class WosMetrics(BaseModel):
    documents: int
    times_cited: int
    h_index: int


class AuthorDocuments(BaseModel):
    researcher_id: str | None
    orcid: str | None
    total: int  # all matches in Web of Science; documents holds at most MAX_DOCUMENTS of them
    documents: list[WosArticle]  # newest first
    metrics: WosMetrics  # over the documents returned
    checked_at: datetime


def h_index(citations: list[int]) -> int:
    """The largest h such that h documents have at least h citations each."""
    ranked = sorted(citations, reverse=True)
    return sum(1 for rank, count in enumerate(ranked, start=1) if count >= rank)


def author_query(identifiers: dict[str, str], from_year: int | None, to_year: int | None) -> str | None:
    ids = [identifiers[key] for key in ("researcher_id", "orcid") if identifiers.get(key)]
    if not ids:
        return None
    query = f"AI=({' OR '.join(ids)})"
    if from_year or to_year:
        query += f" AND PY=({from_year or 1900}-{to_year or 2100})"
    return query


def author_records(db: Session, query: str) -> tuple[int, list[dict[str, Any]], datetime]:
    """Every record for an author query, from the day-long cache or Clarivate. Returns (total, records, when)."""
    now = datetime.now(UTC)
    cached = db.get(WosAuthorSearch, query)
    if cached and now - cached.fetched_at < SEARCH_FOR:
        return cached.total, cached.hits, cached.fetched_at
    total, records = call_clarivate(lambda: fetch_documents(query))
    statement = insert(WosAuthorSearch).values(query=query, total=total, hits=records, fetched_at=now)
    db.execute(statement.on_conflict_do_update(
        index_elements=[WosAuthorSearch.query],
        set_={"total": statement.excluded.total, "hits": statement.excluded.hits, "fetched_at": now}))
    cache_records(db, records, now)
    db.commit()
    return total, records, now


def times_cited(record: dict[str, Any]) -> int:
    count = next((c.get("count") for c in record.get("citations") or [] if c.get("db") == "WOS"), 0)
    return count if isinstance(count, int) else 0


@router.get("/api/v1/wos/me/documents", response_model=AuthorDocuments)
def my_documents(from_year: int | None = Query(None, ge=1900, le=2100),
                 to_year: int | None = Query(None, ge=1900, le=2100),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The signed-in person's documents in Web of Science, found by the ResearcherID and ORCID iD on their profile,
    optionally only those published in a range of years. Cached for a day."""
    if from_year and to_year and from_year > to_year:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_years",
                      "The first year must come before the last.")
    profile = db.get(Profile, user.id)
    identifiers = dict(profile.identifiers) if profile else {}
    query = author_query(identifiers, from_year, to_year)
    if query is None:
        raise problem(status.HTTP_409_CONFLICT, "no_researcher_id",
                      "Add your Web of Science ResearcherID or ORCID iD to your profile first.")

    total, records, checked_at = author_records(db, query)
    documents = []
    for record in records:
        doi = normalize_doi((record.get("identifiers") or {}).get("doi") or "") or ""
        documents.append(to_article(doi, record, checked_at, user))
    documents.sort(key=lambda article: article.year or 0, reverse=True)
    citations = [article.times_cited or 0 for article in documents]
    return AuthorDocuments(
        researcher_id=identifiers.get("researcher_id"), orcid=identifiers.get("orcid"), total=total,
        documents=documents, checked_at=checked_at,
        metrics=WosMetrics(documents=len(documents), times_cited=sum(citations), h_index=h_index(citations)),
    )


JOURNAL_FOR = timedelta(days=30)  # the journal list changes once a year
_ISSN = re.compile(r"^(\d{4})-?(\d{3}[\dX])$")


class WosJournal(BaseModel):
    issn: str
    found: bool  # False: not in Web of Science's journal list (Journal Citation Reports)
    name: str | None = None
    iso_title: str | None = None
    issn_print: str | None = None
    issn_electronic: str | None = None
    jcr_url: str | None = None
    checked_at: datetime


def normalize_issn(raw: str) -> str | None:
    match = _ISSN.match(raw.strip().upper())
    return f"{match.group(1)}-{match.group(2)}" if match else None


def fetch_journal(issn: str) -> dict[str, Any] | None:
    response = httpx.get(f"{settings.wos_starter_url}/journals", params={"issn": issn},
                         headers={"X-ApiKey": settings.clarivate_api_key, "Accept": "application/json"},
                         timeout=TIMEOUT)
    response.raise_for_status()
    hits = response.json().get("hits") or []
    return hits[0] if hits else None


@router.get("/api/v1/wos/journal", response_model=WosJournal)
def journal(issn: str = Query(max_length=20), user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Whether a journal (by print or electronic ISSN) is in Web of Science, with a link to its JCR page.
    Impact Factor and quartile need Clarivate's separate Journals API, which PEA doesn't have."""
    normalized = normalize_issn(issn)
    if normalized is None:
        raise problem(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_issn", "An ISSN looks like 0028-0836.")
    if not settings.clarivate_api_key:
        raise unavailable("wos_not_configured", "Web of Science checks aren't set up on this server yet.")
    record, checked_at = call_clarivate(lambda: cached(db, "wos.journal", normalized,
                                                       lambda: fetch_journal(normalized), JOURNAL_FOR, JOURNAL_FOR))
    if record is None:
        return WosJournal(issn=normalized, found=False, checked_at=checked_at)
    links = record.get("links") or []
    jcr = next((link.get("url") for link in links if "Journal Citation" in (link.get("type") or "")), None)
    return WosJournal(issn=normalized, found=True, name=record.get("name"), iso_title=record.get("isoTitle"),
                      issn_print=record.get("issn"), issn_electronic=record.get("eIssn"), jcr_url=jcr,
                      checked_at=checked_at)
