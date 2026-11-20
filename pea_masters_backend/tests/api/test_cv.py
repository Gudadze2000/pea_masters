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
    "useProfileInterests": False, "interests": [" Genetics ", "Genetics", ""], "hiddenOutputs": ["output-1"],
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
    assert data["hiddenOutputs"] == ["output-1"] and data["talks"][0]["title"] == "Mining landraces"
    assert data["interests"] == ["Genetics"]  # trimmed, repeats and blanks dropped
    assert data["personal"]["summary"] == "I study drought."
    assert "publications" not in data  # they live on the profile now

    researcher.put(CV, json={"data": {**DATA, "talks": []}})
    assert researcher.get(CV).json()["data"]["talks"] == []  # a save replaces the whole CV


def test_publications_sent_by_an_older_page_move_to_the_profile(researcher, db):
    """Before research outputs, the CV kept its own publications: an old page (or a CV kept in a browser) may still
    send them. They're added to the profile once, and the CV doesn't keep them."""
    researcher.post("/api/v1/me/research-outputs", json={"kind": "publication", "subtype": "Book", "title": "A book",
                                                          "year": 2020})
    old = {**DATA, "publications": [PUBLICATION, {**PUBLICATION, "id": "p2", "doi": "", "title": "A book",
                                                  "year": "2020"}]}
    researcher.put(CV, json={"data": old})
    researcher.put(CV, json={"data": old})  # sending them again doesn't repeat them
    outputs = researcher.get("/api/v1/me/research-outputs").json()
    titles = sorted((o["title"], o["source"]) for o in outputs)
    assert titles == [("A book", "manual"), ("Drought genes in wheat", "cv")]
    assert "publications" not in researcher.get(CV).json()["data"]


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
    {"hiddenOutputs": ["x" * 65]},
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


def test_the_migration_moves_saved_cv_publications_to_the_profile(researcher, db):
    """Migration 0018, run on a CV saved before research outputs: its publications become research outputs (one
    already on the profile isn't repeated) and the CV no longer has its own."""
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    from app.models import Cv, ResearchOutput

    researcher.post("/api/v1/me/research-outputs", json={"kind": "publication", "subtype": "Journal article",
                                                          "title": "Already here", "doi": "10.5555/a1"})
    owner = db.query(ResearchOutput).one().user_id
    db.add(Cv(user_id=owner, data={**DATA, "publications": [
        PUBLICATION, {**PUBLICATION, "id": "p2", "title": "Seed banks", "doi": "", "year": "2019", "type": "Book"},
        {**PUBLICATION, "id": "p3", "title": "", "doi": ""}]}))
    db.commit()

    path = Path(__file__).parents[2] / "migrations" / "versions" / "0018_cv_publications_to_profile.py"
    spec = importlib.util.spec_from_file_location("migration_0018", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with Operations.context(MigrationContext.configure(db.connection())):
        migration.upgrade()
    db.commit()

    outputs = {o.title: (o.subtype, o.year, o.source) for o in db.query(ResearchOutput)}
    assert outputs == {"Already here": ("Journal article", None, "manual"), "Seed banks": ("Book", 2019, "cv")}
    assert "publications" not in db.get(Cv, owner).data
