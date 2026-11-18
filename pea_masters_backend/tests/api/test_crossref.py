"""Crossref DOI details (app/crossref.py) and the Web of Science journal check (app/wos.py). Neither service is
called: the fetch functions are replaced."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import update

from app import crossref, wos
from app.models import ExternalLookup
from tests.api.helpers import error_code

LOOKUP = "/api/v1/crossref/lookup"
JOURNAL = "/api/v1/wos/journal"
DOI = "10.5555/pea.book.chapter"

# Shaped like a real Crossref /works/{doi} message (fields as returned on 2026-11-17)
WORK = {
    "type": "book-chapter", "title": ["Wheat landraces of Georgia"], "container-title": ["Crop Wild Relatives"],
    "ISSN": ["2190-5452", "2190-5460", "2190-5452"], "publisher": "Springer",
    "issued": {"date-parts": [[2021, 3]]},
    "author": [{"given": "Nino", "family": "Beridze"}, {"name": "Seed Bank Consortium"}],
}
JOURNAL_RECORD = {"id": "NATURE-2025", "name": "NATURE", "isoTitle": "Nature", "issn": "0028-0836",
                  "eIssn": "1476-4687",
                  "links": [{"type": "Journal Citation Report record", "url": "https://www.webofscience.com/jcr"}]}


@pytest.fixture
def researcher(signed_in, make_user):
    return signed_in(make_user(status="active"))


@pytest.fixture
def services(monkeypatch):
    calls: list[str] = []
    works = {DOI: WORK}
    journals = {"0028-0836": JOURNAL_RECORD}

    def fake_work(doi):
        calls.append(f"crossref:{doi}")
        return works.get(doi)

    def fake_journal(issn):
        calls.append(f"journal:{issn}")
        return journals.get(issn)

    monkeypatch.setattr(crossref, "fetch_work", fake_work)
    monkeypatch.setattr(wos, "fetch_journal", fake_journal)
    monkeypatch.setattr(wos.settings, "clarivate_api_key", "test-key")
    return type("Services", (), {"calls": calls, "works": works})


def test_a_registered_doi_is_described(researcher, services):
    work = researcher.get(LOOKUP, params={"doi": f"https://doi.org/{DOI}"}).json()
    assert work["found"] is True
    assert (work["type"], work["title"], work["container_title"], work["year"]) == (
        "book-chapter", "Wheat landraces of Georgia", "Crop Wild Relatives", 2021)
    assert work["issns"] == ["2190-5452", "2190-5460"]  # repeats removed
    assert work["authors"] == ["Beridze, Nino", "Seed Bank Consortium"]


def test_an_unregistered_doi_is_reported_and_cached_briefly(researcher, services, db):
    assert researcher.get(LOOKUP, params={"doi": "10.5555/typo"}).json()["found"] is False
    assert researcher.get(LOOKUP, params={"doi": "10.5555/typo"}).json()["found"] is False
    assert services.calls == ["crossref:10.5555/typo"]

    db.execute(update(ExternalLookup).values(fetched_at=datetime.now(UTC) - timedelta(days=2)))
    db.commit()
    services.works["10.5555/typo"] = WORK
    assert researcher.get(LOOKUP, params={"doi": "10.5555/typo"}).json()["found"] is True


def test_crossref_failures_are_explained_and_not_cached(researcher, monkeypatch, db):
    def down(doi):
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr(crossref, "fetch_work", down)
    response = researcher.get(LOOKUP, params={"doi": DOI})
    assert response.status_code == 503 and error_code(response) == "crossref_unavailable"
    assert db.get(ExternalLookup, ("crossref.work", DOI)) is None


def test_crossref_input_is_checked(client, researcher, services):
    assert error_code(researcher.get(LOOKUP, params={"doi": "nonsense"})) == "invalid_doi"
    assert client.get(LOOKUP, params={"doi": DOI}).status_code == 401
    assert services.calls == []


def test_journals_in_web_of_science_are_recognised_by_issn(researcher, services):
    journal = researcher.get(JOURNAL, params={"issn": "00280836"}).json()
    assert journal["found"] is True and journal["issn"] == "0028-0836"
    assert (journal["name"], journal["iso_title"], journal["issn_electronic"]) == ("NATURE", "Nature", "1476-4687")
    assert journal["jcr_url"] == "https://www.webofscience.com/jcr"

    other = researcher.get(JOURNAL, params={"issn": "1234-5679"}).json()
    assert other["found"] is False and other["name"] is None

    researcher.get(JOURNAL, params={"issn": "0028-0836"})
    assert services.calls == ["journal:0028-0836", "journal:1234-5679"]  # the second Nature check was cached


def test_journal_input_is_checked(researcher, services):
    assert error_code(researcher.get(JOURNAL, params={"issn": "28-0836"})) == "invalid_issn"
