"""Web of Science article checks (app/wos.py). Clarivate is never called: fetch_record is replaced."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import update

from app import wos
from app.models import WosAuthorSearch, WosLookup
from tests.api.helpers import error_code

LOOKUP = "/api/v1/wos/lookup"
DOI = "10.5555/pea.2026.0001"

# Shaped like a real Starter API hit (fields as returned on 2026-11-17)
RECORD = {
    "uid": "WOS:000000000000001",
    "title": "Drought-responsive transcription factors in wheat",
    "types": ["Article"],
    "source": {"sourceTitle": "PLANTA", "publishYear": 2023, "volume": "258", "issue": "4",
               "pages": {"range": "71-84", "begin": "71", "end": "84", "count": 14}},
    "names": {"authors": [
        {"displayName": "Schulz, Karin", "wosStandard": "Schulz, K", "researcherId": "AAA-1111-2020"},
        {"displayName": "Béridze, Nino", "wosStandard": "Beridze, N"},
    ]},
    "links": {"record": "https://www.webofscience.com/api/gateway?KeyUT=WOS:000000000000001&DestLinkType=FullRecord",
              "citingArticles": "https://www.webofscience.com/api/gateway?KeyUT=WOS:000000000000001&DestLinkType=CitingArticles"},
    "citations": [{"db": "WOS", "count": 14}],
    "identifiers": {"doi": DOI},
}


@pytest.fixture
def clarivate(monkeypatch):
    """A fake Clarivate: answers from `records` (DOI → record) and counts the calls."""
    calls: list[str] = []
    records: dict[str, dict | None] = {DOI: RECORD}
    failure: list[Exception] = []

    def fake(doi):
        calls.append(doi)
        if failure:
            raise failure[0]
        return records.get(doi)

    monkeypatch.setattr(wos, "fetch_record", fake)
    return type("Clarivate", (), {"calls": calls, "records": records, "failure": failure})


@pytest.fixture
def researcher(signed_in, make_user, db):
    user = make_user(email="nino.beridze@iliauni.edu.ge", status="active")
    user.family_name = "Beridze"
    db.commit()
    return signed_in(user)


def http_error(code):
    request = httpx.Request("GET", "https://api.clarivate.com/apis/wos-starter/v1/documents")
    return httpx.HTTPStatusError("failed", request=request, response=httpx.Response(code, request=request))


@pytest.mark.parametrize("raw, expected", [
    ("10.1038/nature14539", "10.1038/nature14539"),
    ("https://doi.org/10.1038/Nature14539.", "10.1038/nature14539"),
    ("http://dx.doi.org/10.1002/(SICI)1097-0258", "10.1002/(sici)1097-0258"),
    ("doi:10.1007/s00425-023-04102", "10.1007/s00425-023-04102"),
    ("DOI 10.1111/tpj.16221", "10.1111/tpj.16221"),
    ("nature14539", None),
    ("10.12/too-short-prefix", None),
    ('10.1038/with"quote', None),
])
def test_dois_are_normalized(raw, expected):
    assert wos.normalize_doi(raw) == expected


def test_an_indexed_article_is_described(researcher, clarivate):
    article = researcher.get(LOOKUP, params={"doi": f"https://doi.org/{DOI.upper()}"}).json()
    assert article["found"] is True and article["doi"] == DOI
    assert (article["title"], article["source_title"], article["year"]) == (
        "Drought-responsive transcription factors in wheat", "PLANTA", 2023)
    assert (article["volume"], article["issue"], article["pages"]) == ("258", "4", "71-84")
    assert article["document_types"] == ["Article"]
    assert article["times_cited"] == 14 and article["author_count"] == 2
    assert article["authors"][0] == {"name": "Schulz, Karin", "researcher_id": "AAA-1111-2020"}
    assert article["record_url"].startswith("https://www.webofscience.com/")
    # "Béridze" in Web of Science matches the signed-in Beridze, accents aside
    assert article["includes_you"] is True
    assert clarivate.calls == [DOI]


def test_someone_not_among_the_authors_is_told_so(signed_in, make_user, db, clarivate):
    user = make_user(email="giorgi.kapanadze@iliauni.edu.ge", status="active")
    user.family_name = "Kapanadze"
    db.commit()
    assert signed_in(user).get(LOOKUP, params={"doi": DOI}).json()["includes_you"] is False


def test_an_unknown_doi_is_not_found(researcher, clarivate):
    article = researcher.get(LOOKUP, params={"doi": "10.5555/not.indexed"}).json()
    assert article["found"] is False and article["title"] is None and article["times_cited"] is None


def test_answers_are_cached_and_refreshed(researcher, clarivate, db):
    for _ in range(3):
        assert researcher.get(LOOKUP, params={"doi": DOI}).json()["found"] is True
    assert clarivate.calls == [DOI]  # fetched once

    # After a week the citation count is refreshed
    db.execute(update(WosLookup).values(fetched_at=datetime.now(UTC) - timedelta(days=8)))
    db.commit()
    clarivate.records[DOI] = {**RECORD, "citations": [{"db": "WOS", "count": 20}]}
    assert researcher.get(LOOKUP, params={"doi": DOI}).json()["times_cited"] == 20
    assert clarivate.calls == [DOI, DOI]


def test_not_found_is_checked_again_after_a_day(researcher, clarivate, db):
    new = "10.5555/indexed.later"
    assert researcher.get(LOOKUP, params={"doi": new}).json()["found"] is False
    assert researcher.get(LOOKUP, params={"doi": new}).json()["found"] is False
    assert clarivate.calls == [new]

    db.execute(update(WosLookup).values(fetched_at=datetime.now(UTC) - timedelta(days=2)))
    db.commit()
    clarivate.records[new] = RECORD
    assert researcher.get(LOOKUP, params={"doi": new}).json()["found"] is True


@pytest.mark.parametrize("failure, code", [
    (http_error(429), "wos_busy"),
    (http_error(401), "wos_not_configured"),
    (http_error(500), "wos_unavailable"),
    (httpx.ConnectTimeout("timed out"), "wos_unavailable"),
])
def test_clarivate_failures_are_explained_and_not_cached(researcher, clarivate, db, failure, code):
    clarivate.failure.append(failure)
    response = researcher.get(LOOKUP, params={"doi": DOI})
    assert response.status_code == 503 and error_code(response) == code
    assert db.get(WosLookup, DOI) is None

    clarivate.failure.clear()
    assert researcher.get(LOOKUP, params={"doi": DOI}).json()["found"] is True


def test_without_a_key_checks_are_off(researcher, clarivate, monkeypatch):
    monkeypatch.setattr(wos.settings, "clarivate_api_key", "")
    response = researcher.get(LOOKUP, params={"doi": DOI})
    assert response.status_code == 503 and error_code(response) == "wos_not_configured"
    assert clarivate.calls == []


def test_bad_input_and_signed_out_requests_are_refused(client, researcher, clarivate):
    response = researcher.get(LOOKUP, params={"doi": "not a doi"})
    assert response.status_code == 422 and error_code(response) == "invalid_doi"
    assert client.get(LOOKUP, params={"doi": DOI}).status_code == 401
    assert clarivate.calls == []


# --- a researcher's documents -------------------------------------------------------------------

MY_DOCUMENTS = "/api/v1/wos/me/documents"


def hit(doi, year, cited, title=None):
    return {**RECORD, "title": title or f"Article {doi}", "identifiers": {"doi": doi},
            "source": {**RECORD["source"], "publishYear": year}, "citations": [{"db": "WOS", "count": cited}]}


@pytest.fixture
def author_search(monkeypatch):
    """A fake Clarivate author search: returns `results` for any query and records the queries."""
    queries: list[str] = []
    results = [hit("10.5555/a", 2021, 10), hit("10.5555/b", 2025, 3), hit("10.5555/c", 2023, 5),
               hit("10.5555/d", 2019, 1), {**RECORD, "identifiers": {}, "title": "No DOI"}]

    def fake(query):
        queries.append(query)
        return len(results), list(results)

    monkeypatch.setattr(wos, "fetch_documents", fake)
    return type("AuthorSearch", (), {"queries": queries, "results": results})


def test_h_index():
    assert wos.h_index([]) == 0
    assert wos.h_index([10, 3, 5, 1]) == 3
    assert wos.h_index([100]) == 1
    assert wos.h_index([0, 0]) == 0


def test_documents_need_an_identifier(researcher, author_search):
    response = researcher.get(MY_DOCUMENTS)
    assert response.status_code == 409 and error_code(response) == "no_researcher_id"
    assert author_search.queries == []


def test_documents_are_found_by_researcher_id_and_orcid(researcher, author_search, clarivate):
    researcher.put("/api/v1/me/profile/identifiers", json={"researcher_id": "ABC-1234-2020",
                                                            "orcid": "0000-0002-1825-0097"})
    result = researcher.get(MY_DOCUMENTS, params={"from_year": 2020, "to_year": 2026}).json()
    assert author_search.queries == ["AI=(ABC-1234-2020 OR 0000-0002-1825-0097) AND PY=(2020-2026)"]
    assert (result["researcher_id"], result["orcid"], result["total"]) == ("ABC-1234-2020", "0000-0002-1825-0097", 5)
    # Citations 14, 10, 5, 3, 1: three documents have at least three citations each
    assert result["metrics"] == {"documents": 5, "times_cited": 33, "h_index": 3}
    assert {doc["doi"] for doc in result["documents"]} == {"10.5555/a", "10.5555/b", "10.5555/c", "10.5555/d", ""}

    # The documents' DOIs are now cached: checking one costs no request
    assert researcher.get(LOOKUP, params={"doi": "10.5555/b"}).json()["found"] is True
    assert clarivate.calls == []


def test_documents_are_sorted_newest_first_and_cached_for_a_day(researcher, author_search, db):
    researcher.put("/api/v1/me/profile/identifiers", json={"researcher_id": "ABC-1234-2020"})
    years = [doc["year"] for doc in researcher.get(MY_DOCUMENTS).json()["documents"]]
    assert years[:4] == [2025, 2023, 2023, 2021]
    researcher.get(MY_DOCUMENTS)
    assert author_search.queries == ["AI=(ABC-1234-2020)"]

    db.execute(update(WosAuthorSearch).values(fetched_at=datetime.now(UTC) - timedelta(days=2)))
    db.commit()
    researcher.get(MY_DOCUMENTS)
    assert author_search.queries == ["AI=(ABC-1234-2020)", "AI=(ABC-1234-2020)"]


def test_document_search_failures_are_explained(researcher, monkeypatch):
    researcher.put("/api/v1/me/profile/identifiers", json={"researcher_id": "ABC-1234-2020"})

    def busy(query):
        raise http_error(429)

    monkeypatch.setattr(wos, "fetch_documents", busy)
    response = researcher.get(MY_DOCUMENTS)
    assert response.status_code == 503 and error_code(response) == "wos_busy"
    assert researcher.get(MY_DOCUMENTS, params={"from_year": 2026, "to_year": 2020}).status_code == 422


def test_all_pages_are_fetched(monkeypatch):
    """fetch_documents follows the pages until it has every record."""
    pages = {1: [{"uid": str(i)} for i in range(50)], 2: [{"uid": str(i)} for i in range(50, 70)]}
    asked = []

    def page(query, limit, number=1):
        asked.append(number)
        return {"metadata": {"total": 70}, "hits": pages.get(number, [])}

    monkeypatch.setattr(wos, "_documents_page", page)
    monkeypatch.setattr(wos, "PAGE_PAUSE", 0)
    total, records = wos.fetch_documents("AI=(X)")
    assert (total, len(records), asked) == (70, 70, [1, 2])
