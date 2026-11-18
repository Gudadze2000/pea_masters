"""The CV builder's CV on the server (app/cv.py)."""

import pytest

from app.models import AuditLog

CV = "/api/v1/me/cv"

PUBLICATION = {"id": "p1", "type": "Journal article", "status": "Published", "authors": "Beridze N; Schulz K",
               "title": "Drought genes in wheat", "venue": "Planta", "year": "2024", "volume": "", "issue": "",
               "pages": "", "doi": "10.5555/a1", "url": ""}
DATA = {
    "version": 1, "visibility": "private", "publicFields": {"email": True, "phone": False, "metrics": True},
    "template": "modern", "citationStyle": "IEEE",
    "sections": [{"id": "summary", "enabled": True}, {"id": "publications", "enabled": True}],
    "personal": {"headline": "Associate Professor", "phone": "", "summary": "I study drought."},
    "profiles": {"orcid": "", "scopus": "", "researcherId": "", "scholar": "", "researchGate": "",
                 "semanticScholar": "", "website": "https://lab.example.org", "github": ""},
    "useProfileInterests": False, "interests": [" Genetics ", "Genetics", ""],
    "publications": [PUBLICATION],
    "talks": [{"id": "t1", "title": "Mining landraces", "event": "GRC", "location": "USA", "date": "2024-07",
               "type": "Invited talk"}],
    "metrics": {"hIndex": "12", "citations": "340", "source": "Web of Science", "asOf": "2026-11"},
}


@pytest.fixture
def researcher(signed_in, make_user):
    return signed_in(make_user(status="active"))


def test_a_new_person_has_no_cv_yet(researcher):
    assert researcher.get(CV).json() == {"data": None, "updated_at": None}


def test_the_cv_is_saved_and_read_back(researcher):
    saved = researcher.put(CV, json={"data": DATA})
    assert saved.status_code == 200 and saved.json()["updated_at"]
    data = researcher.get(CV).json()["data"]
    assert data["template"] == "modern" and data["citationStyle"] == "IEEE"
    assert data["publications"] == [PUBLICATION] and data["talks"][0]["title"] == "Mining landraces"
    assert data["interests"] == ["Genetics"]  # trimmed, repeats and blanks dropped
    assert data["personal"]["summary"] == "I study drought."

    researcher.put(CV, json={"data": {**DATA, "publications": []}})
    assert researcher.get(CV).json()["data"]["publications"] == []  # a save replaces the whole CV


def test_unknown_fields_are_dropped_and_missing_ones_filled(researcher):
    researcher.put(CV, json={"data": {"version": 1, "talks": [], "secret": "x", "personal": {"summary": "Hi"}}})
    data = researcher.get(CV).json()["data"]
    assert "secret" not in data and data["visibility"] == "private" and data["personal"]["summary"] == "Hi"


@pytest.mark.parametrize("change", [
    {"visibility": "everyone"},
    {"template": "fancy"},
    {"personal": {"headline": "x" * 121}},
    {"personal": {"summary": "x" * 1201}},
    {"publications": [{**PUBLICATION, "type": "Tweet"}]},
    {"publications": [PUBLICATION] * 501},
    {"sections": [{"id": "secrets", "enabled": True}]},
])
def test_the_cv_is_checked(researcher, change):
    assert researcher.put(CV, json={"data": {**DATA, **change}}).status_code == 422


def test_each_person_has_their_own_cv(researcher, signed_in, make_user):
    researcher.put(CV, json={"data": DATA})
    other = signed_in(make_user(email="other@iliauni.edu.ge", status="active"))
    assert other.get(CV).json()["data"] is None


def test_making_the_cv_public_is_recorded_but_autosaves_are_not(researcher, db):
    researcher.put(CV, json={"data": DATA})
    researcher.put(CV, json={"data": {**DATA, "personal": {**DATA["personal"], "summary": "Changed"}}})
    researcher.put(CV, json={"data": {**DATA, "visibility": "public"}})
    actions = [entry.action for entry in db.query(AuditLog).filter(AuditLog.entity_type == "cv")]
    assert actions == ["cv.visibility_changed"]


def test_the_cv_needs_sign_in(client):
    assert client.get(CV).status_code == 401
    assert client.put(CV, json={"data": DATA}).status_code == 401
