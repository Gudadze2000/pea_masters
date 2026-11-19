"""Evaluation periods and forms (app/evaluations.py)."""

from datetime import date

import pytest

from app import evaluations
from app.evaluations import BUILT_IN_FORMS, FormStructure
from app.models import AuditLog
from tests.api.helpers import add_department, as_person, error_code, register

PERIOD = {"name": "Annual evaluation 2025-2026", "starts_on": "2026-09-01", "ends_on": "2026-11-30",
          "publication_from": 2024, "publication_to": 2026}


@pytest.fixture
def people(as_admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    head = register(as_admin, base, "head@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs,
                    department_id=cs).json()
    researcher = register(as_admin, base, "researcher@iliauni.edu.ge", department_id=cs).json()
    return {"head": as_person(signed_in, db, head), "researcher": as_person(signed_in, db, researcher)}


# --- the built-in ISU form ---------------------------------------------------------------------------

def test_the_isu_form_is_built_in_and_valid():
    isu = BUILT_IN_FORMS["isu-self-assessment"]
    assert [part.id for part in isu.parts] == ["teaching", "research", "social"]
    assert sum(len(part.items) for part in isu.parts) == 60
    assert isu.total_minimum == 200 and isu.parts[0].min == 80 and isu.parts[2].cap == 20
    article = next(item for item in isu.parts[1].items if item.code == "2.1")
    assert (article.points, article.max_points, article.max_entries) == (50, 300, 6)


def test_coordinators_see_the_forms_they_can_send(as_admin, base, people):
    forms = people["head"].get(f"{base}/evaluation-forms").json()
    assert [(f["id"], f["built_in"], f["parts"], f["items"]) for f in forms] == [("isu-self-assessment", True, 3, 60)]
    form = as_admin.get(f"{base}/evaluation-forms/isu-self-assessment").json()
    assert form["structure"]["parts"][0]["items"][0]["code"] == "1.1"
    assert as_admin.get(f"{base}/evaluation-forms/nope").status_code == 404
    assert people["researcher"].get(f"{base}/evaluation-forms").status_code == 403


@pytest.mark.parametrize("change", [
    {"parts": []},
    {"parts": [{"id": "a", "name": {"en": "A"}, "items": []}]},
    {"parts": [{"id": "a", "name": {"en": "A"}, "items": [
        {"id": "x", "name": {"en": "X"}, "points": 1}, {"id": "x", "name": {"en": "Y"}, "points": 1}]}]},
    {"parts": [{"id": "Bad Id!", "name": {"en": "A"}, "items": [{"id": "x", "name": {"en": "X"}, "points": 1}]}]},
])
def test_form_structures_are_checked(change):
    with pytest.raises(ValueError):
        FormStructure.model_validate({"version": 1, **change})


# --- periods -------------------------------------------------------------------------------------

def test_admins_create_and_change_periods(as_admin, base, db):
    created = as_admin.post(f"{base}/evaluation-periods", json=PERIOD)
    assert created.status_code == 201
    period = created.json()
    assert period["name"] == PERIOD["name"] and period["publication_from"] == 2024

    # Extending the deadline for everyone
    changed = as_admin.put(f"{base}/evaluation-periods/{period['id']}", json={**PERIOD, "ends_on": "2026-12-15"})
    assert changed.json()["ends_on"] == "2026-12-15"
    assert [p["id"] for p in as_admin.get(f"{base}/evaluation-periods").json()] == [period["id"]]
    actions = [a.action for a in db.query(AuditLog).filter(AuditLog.entity_type == "evaluation_period")]
    assert actions == ["evaluation_period.created", "evaluation_period.updated"]


def test_everyone_sees_periods_but_only_admins_manage_them(as_admin, base, people):
    period = as_admin.post(f"{base}/evaluation-periods", json=PERIOD).json()
    for who in ("head", "researcher"):
        client = people[who]
        assert [p["id"] for p in client.get(f"{base}/evaluation-periods").json()] == [period["id"]]
        assert client.post(f"{base}/evaluation-periods", json={**PERIOD, "name": "Mine"}).status_code == 403
        assert client.put(f"{base}/evaluation-periods/{period['id']}", json=PERIOD).status_code == 403
        assert client.delete(f"{base}/evaluation-periods/{period['id']}").status_code == 403


def test_the_status_follows_the_dates_in_tbilisi(as_admin, base, monkeypatch):
    period = as_admin.post(f"{base}/evaluation-periods", json=PERIOD).json()
    for day, expected in [(date(2026, 8, 31), "upcoming"), (date(2026, 9, 1), "open"), (date(2026, 11, 30), "open"),
                          (date(2026, 12, 1), "closed")]:
        monkeypatch.setattr(evaluations, "today", lambda day=day: day)
        listed = as_admin.get(f"{base}/evaluation-periods").json()
        assert [p["status"] for p in listed if p["id"] == period["id"]] == [expected], day


@pytest.mark.parametrize("change, code", [
    ({"ends_on": "2026-08-01"}, 422),  # deadline before the start
    ({"publication_from": 2027}, 422),  # years the wrong way round
    ({"publication_to": 1800}, 422),
    ({"name": ""}, 422),
])
def test_periods_are_checked(as_admin, base, change, code):
    assert as_admin.post(f"{base}/evaluation-periods", json={**PERIOD, **change}).status_code == code


def test_period_names_are_unique_and_archived_periods_disappear(as_admin, base):
    period = as_admin.post(f"{base}/evaluation-periods", json=PERIOD).json()
    clash = as_admin.post(f"{base}/evaluation-periods", json={**PERIOD, "name": " annual  evaluation 2025-2026 "})
    assert clash.status_code == 409 and error_code(clash) == "period_exists"

    assert as_admin.delete(f"{base}/evaluation-periods/{period['id']}").status_code == 204
    assert as_admin.get(f"{base}/evaluation-periods").json() == []
    assert as_admin.put(f"{base}/evaluation-periods/{period['id']}", json=PERIOD).status_code == 404
    # The name is free again
    assert as_admin.post(f"{base}/evaluation-periods", json=PERIOD).status_code == 201


def test_a_period_cant_be_reached_through_another_organization(as_admin, base):
    period = as_admin.post(f"{base}/evaluation-periods", json=PERIOD).json()
    other = "/api/v1/orgs/00000000-0000-0000-0000-000000000000"
    assert as_admin.put(f"{other}/evaluation-periods/{period['id']}", json=PERIOD).status_code == 404
