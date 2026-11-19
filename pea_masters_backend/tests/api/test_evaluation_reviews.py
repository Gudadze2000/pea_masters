"""Reviewing submitted evaluations (app/evaluation_reviews.py): decisions on entries, then on the whole form; and
Admins' exceptions for one person (a later deadline, reopening an approval)."""

from datetime import date, timedelta

from app.evaluation_reviews import score_of
from app.models import AuditLog
from tests.api.helpers import error_code
from tests.api.test_sent_evaluations import add, mine, period, send, team  # noqa: F401 (team is a fixture)
from tests.api.test_wos import DOI, RECORD, clarivate  # noqa: F401 (clarivate is a fixture)


def submitted_form(as_admin, base, team, descriptions=("First", "Second", "Third")):  # noqa: F811
    """Nino's ISU form with these articles (2.1, 50 points each), submitted. Returns its id and the entry ids."""
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    evaluation_id = mine(team["nino"])["id"]
    ids = [add(team["nino"], evaluation_id, description=d).json()["id"] for d in descriptions]
    team["nino"].post(f"/api/v1/me/evaluations/{evaluation_id}/submit", json={"confirm": True})
    return evaluation_id, ids


def decide(client, base, evaluation_id, entry_id, decision, comment=None):
    return client.put(f"{base}/evaluations/{evaluation_id}/entries/{entry_id}/review",
                      json={"decision": decision, "comment": comment})


def finish(client, base, evaluation_id, decision, comment=None):
    return client.post(f"{base}/evaluations/{evaluation_id}/review", json={"decision": decision, "comment": comment})


def test_review_return_fix_and_approve(as_admin, base, team, db):  # noqa: F811
    evaluation_id, (first, second, third) = submitted_form(as_admin, base, team)
    head, nino, url = team["head"], team["nino"], f"/api/v1/me/evaluations/{evaluation_id}"

    review = head.get(f"{base}/evaluations/{evaluation_id}").json()
    assert review["person"]["display_name"] == "Nino Researcher" and review["state"] == "submitted"
    assert [e["status"] for e in review["entries"]] == ["submitted"] * 3
    assert (review["score"], review["can_review"], review["can_finish"]) == (0, True, True)

    # Rejecting needs a reason, which the researcher sees on the entry
    assert error_code(decide(head, base, evaluation_id, first, "rejected")) == "comment_required"
    decide(head, base, evaluation_id, first, "rejected", "The PDF is a different article.")
    review = decide(head, base, evaluation_id, second, "approved").json()
    assert review["score"] == 50
    entries = {e["id"]: e for e in mine(nino)["entries"]}
    assert entries[first]["status"] == "rejected"
    assert entries[first]["review_comment"] == "The PDF is a different article."
    assert entries[second]["status"] == "approved"

    # The form can't be approved while an entry has no decision; returning it needs a reason
    refused = finish(head, base, evaluation_id, "approved")
    assert refused.status_code == 409 and error_code(refused) == "undecided_entries"
    assert error_code(finish(head, base, evaluation_id, "returned")) == "comment_required"
    finish(head, base, evaluation_id, "returned", "Fix the first article and resubmit.")
    returned = mine(nino)
    assert (returned["review_state"], returned["review_comment"]) == ("returned", "Fix the first article and resubmit.")

    # The researcher fixes the rejected entry and resubmits: the form waits for a new decision
    nino.post(f"{url}/reopen")
    nino.put(f"{url}/entries/{first}", json={"item_id": "isu-2-1", "description": "First, with the right PDF"})
    resubmitted = nino.post(f"{url}/submit", json={"confirm": True}).json()
    assert resubmitted["review_state"] is None
    assert {e["id"]: e["status"] for e in resubmitted["entries"]} == {first: "submitted", second: "approved",
                                                                     third: "submitted"}
    [row] = head.get(f"{base}/evaluation-periods/{returned['period']['id']}/evaluations").json()
    assert row["evaluation"]["review_state"] is None and row["evaluation"]["state"] == "submitted"

    decide(head, base, evaluation_id, first, "approved")
    decide(head, base, evaluation_id, third, "rejected", "Not in an indexed journal.")
    approved = finish(head, base, evaluation_id, "approved", "Well done.").json()
    assert (approved["review_state"], approved["final_score"], approved["can_review"]) == ("approved", 100, False)
    assert approved["reviewed_by"] == "Head Person"

    # Approved is final: locked for the researcher and the reviewer alike
    final = mine(nino)
    assert (final["review_state"], final["final_score"], final["can_edit"]) == ("approved", 100, False)
    assert error_code(nino.post(f"{url}/reopen")) == "approved"
    assert error_code(add(nino, evaluation_id, description="Late")) == "approved"
    assert error_code(decide(head, base, evaluation_id, third, "approved")) == "already_approved"
    assert error_code(finish(head, base, evaluation_id, "returned", "Oops")) == "already_approved"
    [brief] = nino.get("/api/v1/me/evaluations").json()
    assert (brief["review_state"], brief["final_score"]) == ("approved", 100)

    actions = [a.action for a in db.query(AuditLog).filter(AuditLog.entity_type.in_(["evaluation", "evaluation_entry"]))
               .order_by(AuditLog.id)][2:]  # after evaluation.sent and evaluation.submitted
    assert actions == ["evaluation_entry.rejected", "evaluation_entry.approved", "evaluation.returned",
                       "evaluation.reopened", "evaluation.resubmitted", "evaluation_entry.approved",
                       "evaluation_entry.rejected", "evaluation.approved"]


def test_the_reviewer_sees_the_submission_while_the_researcher_changes_it(as_admin, base, team):  # noqa: F811
    evaluation_id, (first, second, _) = submitted_form(as_admin, base, team)
    head, nino, url = team["head"], team["nino"], f"/api/v1/me/evaluations/{evaluation_id}"
    nino.post(f"{url}/reopen")
    nino.put(f"{url}/entries/{first}", json={"item_id": "isu-2-1", "description": "Changed after submitting"})

    review = head.get(f"{base}/evaluations/{evaluation_id}").json()
    assert review["state"] == "updating" and review["entries"][0]["description"] == "First"
    assert (review["can_review"], review["can_finish"]) == (True, False)

    # A decision on the changed entry is kept with the submission; the changed entry waits for its own review
    decide(head, base, evaluation_id, first, "approved")
    decide(head, base, evaluation_id, second, "approved")
    entries = {e["id"]: e["status"] for e in mine(nino)["entries"]}
    assert (entries[first], entries[second]) == ("draft", "approved")
    assert error_code(finish(head, base, evaluation_id, "approved")) == "being_updated"
    # Throwing the change away brings back the entry as reviewed
    restored = {e["id"]: e["status"] for e in nino.post(f"{url}/discard").json()["entries"]}
    assert (restored[first], restored[second]) == ("approved", "approved")


def test_decisions_can_be_undone_until_the_form_is_approved(as_admin, base, team):  # noqa: F811
    evaluation_id, (first, *_) = submitted_form(as_admin, base, team)
    decide(team["head"], base, evaluation_id, first, "rejected", "Wrong file")
    undone = decide(team["head"], base, evaluation_id, first, "submitted").json()
    assert (undone["entries"][0]["status"], undone["entries"][0]["review_comment"]) == ("submitted", None)
    assert mine(team["nino"])["entries"][0]["status"] == "submitted"


def test_who_may_review(as_admin, base, team):  # noqa: F811
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    evaluation_id = mine(team["nino"])["id"]
    assert error_code(team["head"].get(f"{base}/evaluations/{evaluation_id}")) == "not_submitted"
    add(team["nino"], evaluation_id, description="An article")
    team["nino"].post(f"/api/v1/me/evaluations/{evaluation_id}/submit", json={"confirm": True})

    assert team["nino"].get(f"{base}/evaluations/{evaluation_id}").status_code == 403  # researchers don't review
    assert team["other"].get(f"{base}/evaluations/{evaluation_id}").status_code == 403
    assert as_admin.get(f"{base}/evaluations/{evaluation_id}").status_code == 200  # Admins review anyone's
    other_org = "/api/v1/orgs/00000000-0000-0000-0000-000000000000"
    assert as_admin.get(f"{other_org}/evaluations/{evaluation_id}").status_code == 404

    # Nobody reviews their own form, even an Admin
    send(as_admin, base, p["id"], [team["ids"]["head"]])
    [brief] = team["head"].get("/api/v1/me/evaluations").json()
    add(team["head"], brief["id"], description="Head's article")
    team["head"].post(f"/api/v1/me/evaluations/{brief['id']}/submit", json={"confirm": True})
    assert error_code(team["head"].get(f"{base}/evaluations/{brief['id']}")) in ("own_evaluation", "forbidden")


def test_the_server_checks_dois_for_the_reviewer(as_admin, base, team, clarivate):  # noqa: F811
    """The check uses the researcher's name ("includes you"), not the reviewer's, and Clarivate is asked once."""
    clarivate.records[DOI] = {**RECORD, "names": {"authors": [{"displayName": "Researcher, Nino",
                                                                "wosStandard": "Researcher, N"}]}}
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    evaluation_id = mine(team["nino"])["id"]
    with_doi = add(team["nino"], evaluation_id, description="Article", detail=f"https://doi.org/{DOI}").json()
    without = add(team["nino"], evaluation_id, description="Talk").json()
    team["nino"].post(f"/api/v1/me/evaluations/{evaluation_id}/submit", json={"confirm": True})

    review = team["head"].get(f"{base}/evaluations/{evaluation_id}").json()
    assert [e["doi"] for e in review["entries"]] == [DOI, None]
    check = team["head"].get(f"{base}/evaluations/{evaluation_id}/entries/{with_doi['id']}/wos").json()
    assert (check["found"], check["times_cited"], check["includes_you"]) == (True, 14, True)
    team["head"].get(f"{base}/evaluations/{evaluation_id}/entries/{with_doi['id']}/wos")
    assert clarivate.calls == [DOI]  # the second check came from the cache
    assert error_code(team["head"].get(f"{base}/evaluations/{evaluation_id}/entries/{without['id']}/wos")) == "no_doi"


def test_the_score_counts_approved_entries_within_the_forms_limits():
    structure = {"parts": [
        {"id": "a", "cap": 25, "items": [
            {"id": "talk", "points": 10, "max_points": 20},
            {"id": "software", "points": 10, "variable_points": "stated per entry"}]},
        {"id": "b", "items": [{"id": "grant", "points": 15}]}]}

    def entry(item, status="approved", points=None, hidden=False):
        return {"item_id": item, "status": status, "points": points, "hidden": hidden}

    entries = [entry("talk"), entry("talk"), entry("talk"),  # 30, but the item counts up to 20
               entry("software", points=7.5),  # part a: 27.5, capped at 25
               entry("grant"), entry("grant", status="rejected"), entry("grant", hidden=True)]
    assert score_of(structure, entries) == 40


# --- Admins: exceptions for one person ------------------------------------------------------------

def test_an_admin_gives_one_person_more_time(as_admin, base, team):  # noqa: F811
    p = period(as_admin, base, "Closed already", starts=-60, ends=-10)
    # Forms can't be sent after the deadline: open the period briefly to send them, then close it again
    as_admin.put(f"{base}/evaluation-periods/{p['id']}", json={
        "name": p["name"], "starts_on": p["starts_on"], "ends_on": str(date.today() + timedelta(days=5)),
        "publication_from": 2024, "publication_to": 2026})
    send(as_admin, base, p["id"], [team["ids"]["nino"], team["ids"]["other"]])
    as_admin.put(f"{base}/evaluation-periods/{p['id']}", json={
        "name": p["name"], "starts_on": p["starts_on"], "ends_on": p["ends_on"],
        "publication_from": 2024, "publication_to": 2026})
    nino = mine(team["nino"])
    assert (nino["period"]["status"], nino["can_edit"], nino["deadline_extended"]) == ("closed", False, False)
    assert error_code(add(team["nino"], nino["id"])) == "period_closed"

    # Only Admins make exceptions, and the extension must be later than the period's own deadline
    later = str(date.today() + timedelta(days=7))
    url = f"{base}/evaluations/{nino['id']}/deadline"
    assert team["head"].put(url, json={"ends_on": later}).status_code == 403
    assert error_code(as_admin.put(url, json={"ends_on": p["ends_on"]})) == "not_later"
    extended = as_admin.put(url, json={"ends_on": later, "reason": "Was on sick leave"}).json()
    assert (extended["deadline_override"], extended["period"]["status"]) == (later, "open")

    # Nino can fill in and submit again; the other researcher in the same period can't
    nino = mine(team["nino"])
    assert (nino["period"]["ends_on"], nino["period"]["status"], nino["can_edit"], nino["deadline_extended"]) == (
        later, "open", True, True)
    add(team["nino"], nino["id"], description="Late but allowed")
    assert team["nino"].post(f"/api/v1/me/evaluations/{nino['id']}/submit", json={"confirm": True}).status_code == 200
    other = mine(team["other"])
    assert (other["period"]["status"], other["can_edit"]) == ("closed", False)
    rows = {r["person"]["display_name"]: r["evaluation"] for r in as_admin.get(
        f"{base}/evaluation-periods/{p['id']}/evaluations").json()}
    assert rows["Nino Researcher"]["deadline_override"] == later
    assert rows["Other Researcher"]["deadline_override"] is None

    # Taking the extension away closes it again
    assert as_admin.put(url, json={"ends_on": None}).json()["period"]["status"] == "closed"
    assert mine(team["nino"])["can_edit"] is False


def test_an_admin_reopens_an_approved_evaluation(as_admin, base, team, db):  # noqa: F811
    evaluation_id, (first, second, third) = submitted_form(as_admin, base, team)
    url = f"{base}/evaluations/{evaluation_id}/reopen"
    assert error_code(as_admin.post(url, json={})) == "not_approved"
    for entry in (first, second, third):
        decide(team["head"], base, evaluation_id, entry, "approved")
    finish(team["head"], base, evaluation_id, "approved")

    assert team["head"].post(url, json={}).status_code == 403  # Admins only
    as_admin.post(url, json={"reason": "Third article was counted twice"})
    reopened = mine(team["nino"])
    assert (reopened["review_state"], reopened["final_score"]) == (None, None)
    assert [e["status"] for e in reopened["entries"]] == ["approved"] * 3  # decisions are kept

    # The coordinator can change a decision and approve again; the researcher could also update and resubmit
    decide(team["head"], base, evaluation_id, third, "rejected", "Counted twice")
    assert finish(team["head"], base, evaluation_id, "approved").json()["final_score"] == 100
    reason = db.query(AuditLog).filter(AuditLog.action == "evaluation.reopened_by_admin").one().reason
    assert reason == "Third article was counted twice"
