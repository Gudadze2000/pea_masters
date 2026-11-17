"""Research output overview (app/research_output.py). Clarivate is replaced by a fake author search."""

import httpx
import pytest

from app import wos
from tests.api.helpers import add_department, add_faculty, as_person, error_code, register

YEARS = {"from_year": 2024, "to_year": 2026}


def record(uid, year, cited):
    return {"uid": uid, "title": uid, "source": {"publishYear": year}, "citations": [{"db": "WOS", "count": cited}],
            "identifiers": {}}


SHARED = record("WOS:shared", 2025, 10)  # co-authored by two colleagues
DOCUMENTS = {
    "AAA-1111-2020": [SHARED, record("WOS:a1", 2024, 4), record("WOS:a2", 2025, 1)],
    "BBB-2222-2020": [SHARED, record("WOS:b1", 2026, 0)],
    "CCC-3333-2020": [record("WOS:c1", 2025, 7)],
}


@pytest.fixture
def clarivate(monkeypatch):
    """Answers author queries from DOCUMENTS; an id in `failing` makes Clarivate time out for that person."""
    queries: list[str] = []
    failing: set[str] = set()

    def fake(query):
        queries.append(query)
        rid = query.removeprefix("AI=(").split(")")[0].split(" OR ")[0]
        if rid in failing:
            raise httpx.ConnectTimeout("timed out")
        hits = DOCUMENTS.get(rid, [])
        return len(hits), hits

    monkeypatch.setattr(wos, "fetch_documents", fake)
    monkeypatch.setattr(wos.settings, "clarivate_api_key", "test-key")
    return type("Clarivate", (), {"queries": queries, "failing": failing})


@pytest.fixture
def departments(as_admin, signed_in, base, db):
    """Computer Science: a head (no ResearcherID) and two researchers; Mathematics: one researcher; plus one person
    without any identifier."""
    faculty = add_faculty(as_admin, base)
    cs = add_department(as_admin, base, "Computer Science", faculty)
    math = add_department(as_admin, base, "Mathematics", faculty)
    head = register(as_admin, base, "head@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs,
                    department_id=cs, name="Head of CS").json()
    def researcher(name, department):
        return register(as_admin, base, f"{name.lower()}@iliauni.edu.ge", department_id=department, name=name).json()

    people = {"ana": (researcher("Ana", cs), "AAA-1111-2020"), "beka": (researcher("Beka", cs), "BBB-2222-2020"),
              "cira": (researcher("Cira", math), "CCC-3333-2020")}
    for person, researcher_id in people.values():
        client = as_person(signed_in, db, person)
        assert client.put("/api/v1/me/profile/identifiers", json={"researcher_id": researcher_id}).status_code == 200
    return {"cs": cs, "math": math, "faculty": faculty, "head": head, **{k: v[0] for k, v in people.items()}}


def test_admins_see_everyone_per_person_and_per_year(as_admin, base, departments, clarivate):
    output = as_admin.get(f"{base}/research-output", params=YEARS).json()
    by_name = {person["name"]: person for person in output["people"]}
    assert (by_name["Ana"]["documents"], by_name["Ana"]["times_cited"], by_name["Ana"]["h_index"]) == (3, 15, 2)
    assert by_name["Ana"]["by_year"] == {"2024": 1, "2025": 2}
    assert by_name["Head of CS"]["documents"] is None and by_name["Head of CS"]["researcher_id"] is None
    # The co-authored article counts once for the organization
    assert output["documents"] == 5
    assert output["by_year"] == {"2024": 1, "2025": 3, "2026": 1}
    assert output["without_identifiers"] == 2  # the head and the admin
    assert [person["name"] for person in output["people"]][:3] == ["Ana", "Beka", "Cira"]  # most documents first
    assert all(query.endswith("AND PY=(2024-2026)") for query in clarivate.queries)


def test_admins_can_narrow_to_a_department_or_faculty(as_admin, base, departments, clarivate):
    def names(params):
        output = as_admin.get(f"{base}/research-output", params={**YEARS, **params}).json()
        return {person["name"] for person in output["people"]}

    assert names({"unit_id": departments["math"]}) == {"Cira"}
    assert names({"unit_id": departments["faculty"]}) == {"Ana", "Beka", "Cira", "Head of CS"}


def test_heads_see_their_own_department_only(signed_in, db, base, departments, clarivate):
    head = as_person(signed_in, db, departments["head"])
    output = head.get(f"{base}/research-output", params=YEARS).json()
    # Their department, themselves included
    assert {person["name"] for person in output["people"]} == {"Ana", "Beka", "Head of CS"}
    # Asking for another department doesn't widen it
    other = head.get(f"{base}/research-output", params={**YEARS, "unit_id": departments["math"]}).json()
    assert other["people"] == []


def test_researchers_cannot_see_the_overview(signed_in, db, base, departments, clarivate):
    response = as_person(signed_in, db, departments["ana"]).get(f"{base}/research-output", params=YEARS)
    assert response.status_code == 403


def test_answers_are_cached_and_one_failure_doesnt_hide_the_rest(as_admin, base, departments, clarivate):
    clarivate.failing.add("BBB-2222-2020")
    output = as_admin.get(f"{base}/research-output", params=YEARS).json()
    beka = next(person for person in output["people"] if person["name"] == "Beka")
    assert beka["documents"] is None and "couldn't be reached" in beka["error"]
    assert output["documents"] == 4  # Ana's and Cira's

    clarivate.failing.clear()
    asked = len(clarivate.queries)
    output = as_admin.get(f"{base}/research-output", params=YEARS).json()
    assert len(clarivate.queries) == asked + 1  # only Beka was asked again; the others came from the cache
    assert output["documents"] == 5


def test_bad_requests(as_admin, base, departments, clarivate):
    response = as_admin.get(f"{base}/research-output", params={"from_year": 2026, "to_year": 2024})
    assert error_code(response) == "invalid_years"
    response = as_admin.get(f"{base}/research-output",
                            params={**YEARS, "unit_id": "00000000-0000-0000-0000-000000000000"})
    assert error_code(response) == "unknown_unit"
