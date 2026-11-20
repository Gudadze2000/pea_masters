"""Research outputs on the profile (app/research_outputs.py): publications, datasets and software."""

import pytest

from app.models import AuditLog
from tests.api.helpers import error_code

URL = "/api/v1/me/research-outputs"

ARTICLE = {"kind": "publication", "subtype": "Journal article", "title": "Drought  tolerance in wheat",
           "authors": "Beridze N; Schulz K", "venue": "Planta", "year": 2025, "volume": "261", "pages": "12-25",
           "doi": "https://doi.org/10.5555/PEA.0001"}
DATASET = {"kind": "dataset", "subtype": "Dataset", "title": "Caucasian wheat landraces: genotypes",
           "authors": "Beridze N", "venue": "Zenodo", "year": 2024, "version": "2.1", "license": "CC BY 4.0",
           "doi": "10.5281/zenodo.123456"}
SOFTWARE = {"kind": "software", "subtype": "Code", "title": "landrace-tools", "authors": "Beridze N",
            "venue": "GitHub", "year": 2026, "version": "1.0.0", "license": "MIT",
            "url": "https://github.com/example/landrace-tools"}


@pytest.fixture
def researcher(signed_in, make_user):
    return signed_in(make_user(status="active"))


def test_outputs_of_every_kind_are_added_listed_changed_and_deleted(researcher, db):
    article = researcher.post(URL, json=ARTICLE)
    assert article.status_code == 201
    saved = article.json()
    assert (saved["title"], saved["doi"]) == ("Drought tolerance in wheat", "10.5555/pea.0001")
    assert saved["source"] == "manual"
    researcher.post(URL, json=DATASET)
    researcher.post(URL, json=SOFTWARE)
    # Newest year first
    assert [o["kind"] for o in researcher.get(URL).json()] == ["software", "publication", "dataset"]

    changed = researcher.put(f"{URL}/{saved['id']}", json={**ARTICLE, "status": "In press", "source": "wos"}).json()
    assert (changed["status"], changed["source"]) == ("In press", "manual")  # how it was added stays
    assert researcher.delete(f"{URL}/{saved['id']}").status_code == 204
    assert len(researcher.get(URL).json()) == 2
    actions = [a.action for a in db.query(AuditLog).filter(AuditLog.entity_type == "research_output")
               .order_by(AuditLog.id)]
    assert actions == ["research_output.added"] * 3 + ["research_output.updated", "research_output.deleted"]


@pytest.mark.parametrize("change", [
    {"kind": "dataset", "subtype": "Journal article"},  # not a kind of dataset
    {"status": "Lost"},
    {"doi": "not a doi"},
    {"url": "ftp://example.org/file"},
    {"title": ""},
    {"year": 1800},
])
def test_outputs_are_checked(researcher, change):
    assert researcher.post(URL, json={**ARTICLE, **change}).status_code == 422


def test_one_doi_appears_once(researcher):
    researcher.post(URL, json=ARTICLE)
    again = researcher.post(URL, json={**ARTICLE, "doi": "10.5555/pea.0001", "title": "Another title"})
    assert again.status_code == 409 and error_code(again) == "duplicate"
    # Without a DOI, the same title and year count as the same output
    researcher.post(URL, json={**SOFTWARE})
    assert error_code(researcher.post(URL, json={**SOFTWARE, "title": "Landrace Tools!"})) == "duplicate"


def test_imports_skip_what_is_already_there(researcher, db):
    researcher.post(URL, json=ARTICLE)
    result = researcher.post(f"{URL}/import", json={"items": [
        {**ARTICLE, "source": "wos"}, {**DATASET, "source": "orcid"}, {**DATASET, "source": "orcid"},
        {**SOFTWARE, "source": "orcid"}]}).json()
    assert result["skipped"] == 2  # the article, and the dataset listed twice
    assert [(o["kind"], o["source"]) for o in result["added"]] == [("dataset", "orcid"), ("software", "orcid")]
    assert len(researcher.get(URL).json()) == 3
    assert db.query(AuditLog).filter(AuditLog.action == "research_output.imported").one().after["added"] == 2


def test_only_the_owner_reaches_their_outputs(researcher, signed_in, make_user):
    saved = researcher.post(URL, json=ARTICLE).json()
    other = signed_in(make_user(email="other.person@iliauni.edu.ge", status="active"))
    assert other.get(URL).json() == []
    assert other.put(f"{URL}/{saved['id']}", json=ARTICLE).status_code == 404
    assert other.delete(f"{URL}/{saved['id']}").status_code == 404
