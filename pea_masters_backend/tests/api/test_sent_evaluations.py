"""Evaluations sent to researchers (app/sent_evaluations.py): coordinators send forms for a period, researchers fill
them in and submit, update and resubmit until the deadline."""

from datetime import date, timedelta

import pytest

from app.models import AuditLog
from tests.api.helpers import add_department, as_person, error_code, register

PDF = b"%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"
TODAY = date.today()  # periods below span weeks either side, so Tbilisi's date being a day off doesn't matter


def period(as_admin, base, name="Annual evaluation", starts=-30, ends=30):
    return as_admin.post(f"{base}/evaluation-periods", json={
        "name": name, "starts_on": str(TODAY + timedelta(days=starts)), "ends_on": str(TODAY + timedelta(days=ends)),
        "publication_from": 2024, "publication_to": 2026}).json()


SMALL_FORM = {"name": {"en": "Lab form", "ka": ""}, "description": "", "structure": {"version": 1, "parts": [
    {"id": "lab", "name": {"en": "Lab"}, "items": [
        {"id": "talk", "name": {"en": "A talk"}, "points": 5, "max_entries": 2},
        {"id": "software", "name": {"en": "Software"}, "points": 10, "variable_points": "10, or 5 if co-written"}]}]}}


@pytest.fixture
def team(as_admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    math = add_department(as_admin, base, "Mathematics")
    head = register(as_admin, base, "head@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs,
                    department_id=cs, name="Head Person").json()
    nino = register(as_admin, base, "nino@iliauni.edu.ge", department_id=cs, name="Nino Researcher").json()
    other = register(as_admin, base, "other@iliauni.edu.ge", department_id=math, name="Other Researcher").json()
    return {"head": as_person(signed_in, db, head), "nino": as_person(signed_in, db, nino),
            "other": as_person(signed_in, db, other), "ids": {"head": head["id"], "nino": nino["id"],
                                                               "other": other["id"]}}


def sent_url(base, period_id):
    return f"{base}/evaluation-periods/{period_id}/evaluations"


def send(client, base, period_id, user_ids, form_id="isu-self-assessment"):
    return client.post(sent_url(base, period_id), json={"form_id": form_id, "user_ids": user_ids})


def mine(client):
    """The researcher's one evaluation, in full"""
    [brief] = client.get("/api/v1/me/evaluations").json()
    return client.get(f"/api/v1/me/evaluations/{brief['id']}").json()


def add(client, evaluation_id, item_id="isu-2-1", **values):
    return client.post(f"/api/v1/me/evaluations/{evaluation_id}/entries",
                       json={"item_id": item_id, "description": "An article", **values})


# --- sending --------------------------------------------------------------------------------------

def test_a_head_sends_the_form_to_their_researchers(as_admin, base, team, db):
    p = period(as_admin, base)
    roster = team["head"].get(sent_url(base, p["id"])).json()
    assert [(r["person"]["display_name"], r["evaluation"]) for r in roster] == [("Nino Researcher", None)]

    result = send(team["head"], base, p["id"], [team["ids"]["nino"]]).json()
    assert result == {"sent": 1, "replaced": 0, "unchanged": 0, "skipped": []}
    [row] = team["head"].get(sent_url(base, p["id"])).json()
    assert row["evaluation"]["state"] == "draft" and not row["evaluation"]["started"]
    assert row["evaluation"]["form_name"]["en"] == "ISU academic staff self-assessment"

    [brief] = team["nino"].get("/api/v1/me/evaluations").json()
    assert brief["period"]["name"] == "Annual evaluation" and brief["period"]["status"] == "open"
    evaluation = mine(team["nino"])
    assert evaluation["can_edit"] and evaluation["entries"] == [] and evaluation["submission"] is None
    assert sum(len(part["items"]) for part in evaluation["structure"]["parts"]) == 60
    assert [a.action for a in db.query(AuditLog).filter(AuditLog.entity_type == "evaluation")] == ["evaluation.sent"]


def test_forms_go_only_to_the_people_one_coordinates(as_admin, base, team):
    p = period(as_admin, base)
    refused = send(team["head"], base, p["id"], [team["ids"]["nino"], team["ids"]["other"]])
    assert refused.status_code == 422 and error_code(refused) == "not_in_scope"
    assert team["head"].get("/api/v1/me/evaluations").json() == []  # nothing was sent
    assert send(team["head"], base, p["id"], [team["ids"]["head"]]).status_code == 422  # not to themselves
    assert send(team["nino"], base, p["id"], [team["ids"]["other"]]).status_code == 403
    assert team["nino"].get(sent_url(base, p["id"])).status_code == 403
    # Admins send to anyone in the organization
    names = [r["person"]["display_name"] for r in as_admin.get(sent_url(base, p["id"])).json()]
    assert names == ["Head Person", "Nino Researcher", "Other Researcher"]
    assert send(as_admin, base, p["id"], [team["ids"]["other"]]).json()["sent"] == 1


def test_an_unstarted_form_can_be_replaced_or_withdrawn_but_not_a_started_one(as_admin, base, team):
    p = period(as_admin, base)
    nino = team["ids"]["nino"]
    custom = team["head"].post(f"{base}/evaluation-forms", json=SMALL_FORM).json()
    send(team["head"], base, p["id"], [nino])
    assert send(team["head"], base, p["id"], [nino], custom["id"]).json()["replaced"] == 1
    assert send(team["head"], base, p["id"], [nino], custom["id"]).json()["unchanged"] == 1
    evaluation = mine(team["nino"])
    assert evaluation["form_name"]["en"] == "Lab form"

    # Changing the form afterwards doesn't change what was sent
    team["head"].put(f"{base}/evaluation-forms/{custom['id']}", json={**SMALL_FORM, "name": {"en": "Renamed"}})
    assert mine(team["nino"])["form_name"]["en"] == "Lab form"

    assert add(team["nino"], evaluation["id"], "talk").status_code == 201
    assert send(team["head"], base, p["id"], [nino]).json()["skipped"] == ["Nino Researcher"]
    [row] = team["head"].get(sent_url(base, p["id"])).json()
    assert row["evaluation"]["started"] and row["evaluation"]["entries"] == 1
    refused = team["head"].delete(f"{base}/evaluations/{row['evaluation']['id']}")
    assert refused.status_code == 409 and error_code(refused) == "evaluation_started"


def test_withdrawing_an_unstarted_form(as_admin, base, team):
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    [row] = team["head"].get(sent_url(base, p["id"])).json()
    assert team["other"].delete(f"{base}/evaluations/{row['evaluation']['id']}").status_code == 403
    assert team["head"].delete(f"{base}/evaluations/{row['evaluation']['id']}").status_code == 204
    assert team["nino"].get("/api/v1/me/evaluations").json() == []
    # ...and it can be sent again
    assert send(team["head"], base, p["id"], [team["ids"]["nino"]]).json()["sent"] == 1


def test_no_sending_after_the_deadline(as_admin, base, team):
    past = period(as_admin, base, "Last year", starts=-400, ends=-40)
    refused = send(team["head"], base, past["id"], [team["ids"]["nino"]])
    assert refused.status_code == 409 and error_code(refused) == "period_closed"


# --- filling in -----------------------------------------------------------------------------------

def test_entries_are_saved_with_evidence_and_checked(as_admin, base, team):
    p = period(as_admin, base)
    custom = team["head"].post(f"{base}/evaluation-forms", json=SMALL_FORM).json()
    send(team["head"], base, p["id"], [team["ids"]["nino"]], custom["id"])
    nino = team["nino"]
    evaluation_id = mine(nino)["id"]
    document = nino.post("/api/v1/me/documents", files={"file": ("programme.pdf", PDF, "application/pdf")}).json()

    entry = add(nino, evaluation_id, "talk", description="Talk at EPSO 2025", detail="Vienna",
                file_ids=[document["id"]]).json()
    assert (entry["status"], entry["points"], [f["name"] for f in entry["files"]]) == ("draft", None, ["programme.pdf"])
    # The head of department can open the evidence; someone from another department can't
    assert team["head"].get(entry["files"][0]["url"]).status_code == 200
    assert team["other"].get(entry["files"][0]["url"]).status_code == 404

    # Items whose entries state their own points need them
    missing = add(nino, evaluation_id, "software", description="A program")
    assert missing.status_code == 422 and error_code(missing) == "points_required"
    assert add(nino, evaluation_id, "software", description="A program", points=5).json()["points"] == 5
    assert error_code(add(nino, evaluation_id, "nope")) == "unknown_item"
    someone_else = team["other"].post("/api/v1/me/documents", files={"file": ("x.pdf", PDF, "application/pdf")})
    assert add(nino, evaluation_id, "talk", file_ids=[someone_else.json()["id"]]).status_code == 422

    # "A talk" counts at most 2 entries; a hidden one doesn't count
    second = add(nino, evaluation_id, "talk", description="Second talk").json()
    full = add(nino, evaluation_id, "talk", description="Third talk")
    assert full.status_code == 409 and error_code(full) == "item_full"
    hidden = nino.put(f"/api/v1/me/evaluations/{evaluation_id}/entries/{second['id']}/hidden", json={"hidden": True})
    assert hidden.json()["hidden"] is True
    assert add(nino, evaluation_id, "talk", description="Third talk").status_code == 201
    again = nino.put(f"/api/v1/me/evaluations/{evaluation_id}/entries/{second['id']}/hidden", json={"hidden": False})
    assert error_code(again) == "item_full"

    # Nobody else reaches the evaluation
    assert team["other"].get(f"/api/v1/me/evaluations/{evaluation_id}").status_code == 404
    assert add(team["other"], evaluation_id, "talk").status_code == 404


def test_submit_update_resubmit_and_discard(as_admin, base, team, db):
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    nino = team["nino"]
    evaluation_id = mine(nino)["id"]
    url = f"/api/v1/me/evaluations/{evaluation_id}"
    empty = nino.post(f"{url}/submit", json={"confirm": True})
    assert empty.status_code == 409 and error_code(empty) == "no_entries"
    first = add(nino, evaluation_id, description="First article").json()
    hidden = add(nino, evaluation_id, description="Not this one").json()
    nino.put(f"{url}/entries/{hidden['id']}/hidden", json={"hidden": True})

    assert nino.post(f"{url}/submit", json={"confirm": False}).status_code == 422
    submitted = nino.post(f"{url}/submit", json={"confirm": True}).json()
    assert submitted["state"] == "submitted" and not submitted["can_edit"] and submitted["submitted_at"]
    assert {e["description"]: e["status"] for e in submitted["entries"]} == {"First article": "submitted",
                                                                             "Not this one": "draft"}
    assert len(submitted["submission"]) == 2

    # Submitted: locked until reopened
    locked = add(nino, evaluation_id, description="Late article")
    assert locked.status_code == 409 and error_code(locked) == "submitted"
    reopened = nino.post(f"{url}/reopen").json()
    assert reopened["state"] == "updating" and reopened["can_edit"]
    assert error_code(nino.post(f"{url}/submit", json={"confirm": True})) == "no_changes"

    # Changing an entry and adding one, then throwing the changes away
    nino.put(f"{url}/entries/{first['id']}", json={"item_id": "isu-2-1", "description": "Changed title"})
    add(nino, evaluation_id, description="New article")
    restored = nino.post(f"{url}/discard").json()
    assert restored["state"] == "submitted"
    assert {e["description"]: e["status"] for e in restored["entries"]} == {"First article": "submitted",
                                                                            "Not this one": "draft"}

    # Updating for real: the new entry goes for review with the resubmission
    nino.post(f"{url}/reopen")
    add(nino, evaluation_id, description="Published last week")
    resubmitted = nino.post(f"{url}/submit", json={"confirm": True}).json()
    assert resubmitted["state"] == "submitted"
    assert sorted(e["status"] for e in resubmitted["entries"]) == ["draft", "submitted", "submitted"]
    actions = [a.action for a in db.query(AuditLog).filter(AuditLog.entity_type == "evaluation").order_by(AuditLog.id)]
    assert actions == ["evaluation.sent", "evaluation.submitted", "evaluation.reopened", "evaluation.changes_discarded",
                       "evaluation.reopened", "evaluation.resubmitted"]
    [row] = team["head"].get(sent_url(base, p["id"])).json()
    assert row["evaluation"]["state"] == "submitted" and row["evaluation"]["entries"] == 2


def test_forms_are_locked_before_the_period_opens_and_after_the_deadline(as_admin, base, team):
    later = period(as_admin, base, "Next year", starts=40, ends=100)
    send(team["head"], base, later["id"], [team["ids"]["nino"]])
    evaluation = mine(team["nino"])
    assert not evaluation["can_edit"] and evaluation["period"]["status"] == "upcoming"
    assert error_code(add(team["nino"], evaluation["id"])) == "period_not_open"

    # The period opens, and later its deadline passes
    dates = {"name": "Next year", "publication_from": 2024, "publication_to": 2026}
    as_admin.put(f"{base}/evaluation-periods/{later['id']}", json={
        **dates, "starts_on": str(TODAY - timedelta(days=30)), "ends_on": str(TODAY + timedelta(days=30))})
    assert add(team["nino"], evaluation["id"]).status_code == 201
    as_admin.put(f"{base}/evaluation-periods/{later['id']}", json={
        **dates, "starts_on": str(TODAY - timedelta(days=60)), "ends_on": str(TODAY - timedelta(days=30))})
    closed = mine(team["nino"])
    assert not closed["can_edit"] and closed["period"]["status"] == "closed"
    assert error_code(add(team["nino"], evaluation["id"])) == "period_closed"
    assert error_code(team["nino"].post(f"/api/v1/me/evaluations/{evaluation['id']}/submit",
                                        json={"confirm": True})) == "period_closed"


def test_the_dashboard_summary_points_at_entries_that_need_attention(as_admin, base, team):
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    evaluation_id = mine(team["nino"])["id"]
    entry = add(team["nino"], evaluation_id, description="No file yet").json()
    [brief] = team["nino"].get("/api/v1/me/evaluations").json()
    assert (brief["entries"], brief["missing_files"], brief["rejected"]) == (1, 1, 0)
    assert brief["first_missing_file"] == {"item_id": "isu-2-1", "entry_id": entry["id"]}
