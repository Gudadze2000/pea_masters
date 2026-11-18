"""ORCID (app/orcid.py): "Connect ORCID" proves an iD, and public works can be read. ORCID itself is never called:
exchange_code and fetch_works are replaced."""

from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app import orcid
from tests.api.helpers import error_code

ME = "/api/v1/me/profile"
ORCID_ID = "0000-0002-1825-0097"

# Shaped like ORCID's /v3.0/{orcid}/works (fields as returned by the sandbox on 2026-11-18)
WORKS = {"group": [
    {"work-summary": [{
        "put-code": 101, "type": "journal-article", "title": {"title": {"value": "Drought genes in wheat "}},
        "journal-title": {"value": "Planta"}, "publication-date": {"year": {"value": "2023"}},
        "external-ids": {"external-id": [{"external-id-type": "doi", "external-id-value": "https://doi.org/10.5555/A1"},
                                         {"external-id-type": "pmid", "external-id-value": "123"}]},
        "url": None,
    }, {"put-code": 102, "title": {"title": {"value": "Same work from another source"}}}]},
    {"work-summary": [{
        "put-code": 103, "type": "book-chapter", "title": {"title": {"value": "Wheat landraces of Georgia"}},
        "journal-title": None, "publication-date": {"year": {"value": "2025"}}, "external-ids": {"external-id": []},
        "url": {"value": "https://example.org/chapter"},
    }]},
    {"work-summary": [{"put-code": 104, "title": None}]},  # untitled: skipped
]}


@pytest.fixture
def researcher(signed_in, make_user):
    return signed_in(make_user(status="active"))


@pytest.fixture
def orcid_service(monkeypatch):
    calls: list[str] = []
    answers = {"code": {"orcid": ORCID_ID, "name": "Nino Beridze"}, "works": WORKS}

    def exchange(code):
        calls.append(f"token:{code}")
        if isinstance(answers["code"], Exception):
            raise answers["code"]
        return answers["code"]

    def works(orcid_id):
        calls.append(f"works:{orcid_id}")
        if isinstance(answers["works"], Exception):
            raise answers["works"]
        return answers["works"]

    monkeypatch.setattr(orcid, "exchange_code", exchange)
    monkeypatch.setattr(orcid, "fetch_works", works)
    return type("Orcid", (), {"calls": calls, "answers": answers})


def start(client):
    """Starts "Connect ORCID"; returns the state PEA sent to ORCID."""
    response = client.get("/api/v1/orcid/connect", follow_redirects=False)
    assert response.status_code == 303
    url = urlparse(response.headers["location"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "https://orcid.test/oauth/authorize"
    query = parse_qs(url.query)
    assert query["client_id"] == ["APP-TESTCLIENT"] and query["scope"] == ["/authenticate"]
    assert query["response_type"] == ["code"]
    assert query["redirect_uri"] == ["https://forwarder.test/pea-orcid/callback/"]
    return query["state"][0]


def finish(client, **params):
    response = client.get("/api/v1/orcid/callback", params=params, follow_redirects=False)
    assert response.status_code == 303
    return response.headers["location"]


def test_connecting_proves_the_orcid_id(researcher, orcid_service, db):
    state = start(researcher)
    assert finish(researcher, code="one-time", state=state) == "/profile?orcid=connected#identifiers"
    profile = researcher.get(ME).json()
    assert profile["identifiers"]["orcid"] == ORCID_ID and profile["orcid_verified"] is True
    assert orcid_service.calls == ["token:one-time"]

    # The state is used once: replaying the same answer does nothing
    assert finish(researcher, code="one-time", state=state) == "/profile?orcid=expired#identifiers"


@pytest.mark.parametrize("params, outcome", [
    ({"error": "access_denied", "error_description": "User denied access"}, "denied"),  # "Deny" on ORCID
    ({"code": "one-time", "state": "forged"}, "expired"),  # not the state PEA sent
    ({"code": "one-time"}, "expired"),  # no state at all
])
def test_refused_or_tampered_answers_change_nothing(researcher, orcid_service, params, outcome):
    start(researcher)
    assert finish(researcher, **params) == f"/profile?orcid={outcome}#identifiers"
    assert researcher.get(ME).json()["orcid_verified"] is False
    assert orcid_service.calls == []  # the code was never traded


def test_an_answer_without_a_started_connect_is_refused(researcher, orcid_service):
    assert finish(researcher, code="one-time", state="anything") == "/profile?orcid=expired#identifiers"
    assert orcid_service.calls == []


def test_another_persons_session_cannot_finish_the_connect(signed_in, make_user, orcid_service):
    first = signed_in(make_user(email="first@iliauni.edu.ge", status="active"))
    state = start(first)
    second = signed_in(make_user(email="second@iliauni.edu.ge", status="active"))
    # The second person doesn't have the first one's sign-in state (it lives in the first browser's cookie)
    assert finish(second, code="one-time", state=state) == "/profile?orcid=expired#identifiers"


def test_orcid_failures_are_reported(researcher, orcid_service):
    orcid_service.answers["code"] = httpx.ConnectTimeout("timed out")
    assert finish(researcher, code="one-time", state=start(researcher)) == "/profile?orcid=error#identifiers"
    orcid_service.answers["code"] = {"orcid": "not-an-orcid"}
    assert finish(researcher, code="one-time", state=start(researcher)) == "/profile?orcid=error#identifiers"
    assert researcher.get(ME).json()["identifiers"]["orcid"] is None


def test_an_orcid_id_proven_by_someone_else_is_refused(signed_in, make_user, orcid_service):
    owner = signed_in(make_user(email="owner@iliauni.edu.ge", status="active"))
    finish(owner, code="a", state=start(owner))
    other = signed_in(make_user(email="other@iliauni.edu.ge", status="active"))
    assert finish(other, code="b", state=start(other)) == "/profile?orcid=taken#identifiers"
    assert other.get(ME).json()["identifiers"]["orcid"] is None


def test_changing_or_disconnecting_drops_the_proof(researcher, orcid_service):
    finish(researcher, code="a", state=start(researcher))
    profile = researcher.delete("/api/v1/orcid/connection").json()
    assert profile["orcid_verified"] is False and profile["identifiers"]["orcid"] == ORCID_ID

    finish(researcher, code="a", state=start(researcher))
    researcher.put(f"{ME}/identifiers", json={"researcher_id": "ABC-1234-2020"})  # other fields: proof stays
    assert researcher.get(ME).json()["orcid_verified"] is True
    researcher.put(f"{ME}/identifiers", json={"orcid": "0000-0001-5109-3700"})
    assert researcher.get(ME).json()["orcid_verified"] is False


def test_signed_out_callbacks_go_to_the_login_page(client, orcid_service):
    assert finish(client, code="a", state="b") == "/login"
    assert client.get("/api/v1/orcid/connect", follow_redirects=False).status_code == 401


def test_without_credentials_connect_is_off(researcher, orcid_service, monkeypatch):
    monkeypatch.setattr(orcid.settings, "orcid_client_id", "")
    response = researcher.get("/api/v1/orcid/connect", follow_redirects=False)
    assert response.headers["location"] == "/profile?orcid=not_configured#identifiers"


# --- works ---------------------------------------------------------------------------------------

def test_public_works_are_listed_newest_first(researcher, orcid_service, db):
    researcher.put(f"{ME}/identifiers", json={"orcid": ORCID_ID})
    result = researcher.get("/api/v1/orcid/me/works").json()
    assert (result["orcid"], result["verified"]) == (ORCID_ID, False)
    assert result["works"] == [
        {"put_code": 103, "title": "Wheat landraces of Georgia", "type": "book-chapter", "year": 2025,
         "journal": None, "doi": None, "url": "https://example.org/chapter"},
        {"put_code": 101, "title": "Drought genes in wheat", "type": "journal-article", "year": 2023,
         "journal": "Planta", "doi": "10.5555/a1", "url": None},
    ]
    researcher.get("/api/v1/orcid/me/works")
    assert orcid_service.calls == [f"works:{ORCID_ID}"]  # cached


def test_works_need_an_orcid_id_that_exists(researcher, orcid_service):
    assert error_code(researcher.get("/api/v1/orcid/me/works")) == "no_orcid"
    researcher.put(f"{ME}/identifiers", json={"orcid": ORCID_ID})
    orcid_service.answers["works"] = None
    response = researcher.get("/api/v1/orcid/me/works")
    assert response.status_code == 404 and error_code(response) == "orcid_not_found"


def test_works_failures_are_explained_and_not_cached(researcher, orcid_service):
    researcher.put(f"{ME}/identifiers", json={"orcid": ORCID_ID})
    orcid_service.answers["works"] = httpx.ConnectTimeout("timed out")
    response = researcher.get("/api/v1/orcid/me/works")
    assert response.status_code == 503 and error_code(response) == "orcid_unavailable"
    orcid_service.answers["works"] = WORKS
    assert len(researcher.get("/api/v1/orcid/me/works").json()["works"]) == 2
