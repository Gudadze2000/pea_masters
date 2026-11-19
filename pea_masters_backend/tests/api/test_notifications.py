"""Notifications (app/notifications.py), the dashboard's evaluation summary and the review queue."""

from datetime import date, timedelta

from tests.api.helpers import error_code
from tests.api.test_evaluation_reviews import decide, finish
from tests.api.test_sent_evaluations import add, mine, period, send, team  # noqa: F401 (team is a fixture)

NOTIFICATIONS = "/api/v1/me/notifications"


def inbox(client):
    return client.get(NOTIFICATIONS).json()


def kinds(client):
    return [n["kind"] for n in inbox(client)["items"]]


def test_evaluation_events_notify_the_right_people(as_admin, base, team):  # noqa: F811
    head, nino = team["head"], team["nino"]
    p = period(as_admin, base)
    send(head, base, p["id"], [team["ids"]["nino"]])
    sent = inbox(nino)["items"][0]
    assert (sent["kind"], sent["title"], sent["link"], sent["read"]) == (
        "form_sent", "Your evaluation form is here", "/evaluation-form", False)
    assert "Annual evaluation: ISU academic staff self-assessment" in sent["detail"]
    assert kinds(head) == []  # nobody hears about their own actions

    evaluation_id = mine(nino)["id"]
    first = add(nino, evaluation_id, description="First article").json()
    add(nino, evaluation_id, description="Second article")
    nino.post(f"/api/v1/me/evaluations/{evaluation_id}/submit", json={"confirm": True})
    submitted = inbox(head)["items"][0]
    assert (submitted["kind"], submitted["title"]) == ("form_submitted", "Nino Researcher submitted their form")
    assert submitted["link"] == f"/admin/evaluations/{evaluation_id}?org={base.split('/')[-1]}"
    assert kinds(as_admin) == []  # Admins aren't told about every submission

    decide(head, base, evaluation_id, first["id"], "rejected", "Wrong PDF")
    rejected = inbox(nino)["items"][0]
    assert (rejected["kind"], rejected["detail"]) == ("entry_rejected", "“First article”: Wrong PDF")
    assert rejected["entry_ref"] == {"recordId": "isu-2-1", "entryId": first["id"]}
    finish(head, base, evaluation_id, "returned", "Please fix the first one.")
    assert inbox(nino)["items"][0]["detail"] == "“Please fix the first one.” Fix it and resubmit it."

    nino.post(f"/api/v1/me/evaluations/{evaluation_id}/reopen")
    nino.put(f"/api/v1/me/evaluations/{evaluation_id}/entries/{first['id']}",
             json={"item_id": "isu-2-1", "description": "First article, right PDF"})
    nino.post(f"/api/v1/me/evaluations/{evaluation_id}/submit", json={"confirm": True})
    assert inbox(head)["items"][0]["title"] == "Nino Researcher resubmitted their form"

    for entry in mine(nino)["entries"]:
        decide(head, base, evaluation_id, entry["id"], "approved")
    finish(head, base, evaluation_id, "approved")
    assert inbox(nino)["items"][0]["detail"] == "Final score: 100 points."

    as_admin.post(f"{base}/evaluations/{evaluation_id}/reopen", json={})
    later = date.today() + timedelta(days=45)
    as_admin.put(f"{base}/evaluations/{evaluation_id}/deadline", json={"ends_on": str(later)})
    assert kinds(nino) == ["deadline_extended", "form_reopened", "form_approved", "form_returned", "entry_rejected",
                           "form_sent"]
    assert kinds(head) == ["form_submitted", "form_submitted"]


def test_reading_notifications(as_admin, base, team):  # noqa: F811
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    other = period(as_admin, base, "Second period")
    send(team["head"], base, other["id"], [team["ids"]["nino"]])
    nino = team["nino"]
    first, second = inbox(nino)["items"]
    assert inbox(nino)["unread"] == 2

    assert nino.post(f"{NOTIFICATIONS}/{first['id']}/read").status_code == 204
    after = inbox(nino)
    assert (after["unread"], [n["read"] for n in after["items"]]) == (1, [True, False])
    # Someone else's notification can't be touched
    assert error_code(team["other"].post(f"{NOTIFICATIONS}/{second['id']}/read")) == "not_found"
    assert nino.post(f"{NOTIFICATIONS}/read-all").status_code == 204
    assert inbox(nino)["unread"] == 0


def test_a_reminder_when_the_deadline_is_near(as_admin, base, team):  # noqa: F811
    soon = period(as_admin, base, "Ends soon", starts=-30, ends=3)
    later = period(as_admin, base, "Ends later", starts=-30, ends=30)
    send(team["head"], base, soon["id"], [team["ids"]["nino"]])
    send(team["head"], base, later["id"], [team["ids"]["nino"]])
    nino = team["nino"]
    deadline = date.today() + timedelta(days=3)

    reminders = [n for n in inbox(nino)["items"] if n["kind"] == "deadline_soon"]
    assert [n["title"] for n in reminders] == [f"Deadline: {deadline.day} {deadline:%b %Y}"]
    assert reminders[0]["detail"].startswith("Your Ends soon form isn't submitted yet.")
    inbox(nino)  # looking again doesn't remind again
    assert kinds(nino).count("deadline_soon") == 1


def test_the_dashboard_summary(as_admin, base, team):  # noqa: F811
    custom = team["head"].post(f"{base}/evaluation-forms", json={
        "name": {"en": "Lab form", "ka": ""}, "description": "", "structure": {"version": 1, "total_minimum": 30,
            "parts": [{"id": "lab", "numeral": "I", "name": {"en": "Lab"}, "min": 20, "cap": 25, "items": [
                {"id": "talk", "name": {"en": "A talk"}, "points": 10}]}]}}).json()
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]], custom["id"])
    nino = team["nino"]
    evaluation_id = mine(nino)["id"]
    for n in range(3):
        add(nino, evaluation_id, "talk", description=f"Talk {n}")

    [brief] = nino.get("/api/v1/me/evaluations").json()
    assert (brief["score"], brief["total_minimum"], brief["deadline_extended"]) == (25, 30, False)  # capped at 25
    assert brief["parts"] == [{"id": "lab", "numeral": "I", "name": "Lab", "score": 25, "min": 20, "cap": 25}]


def test_the_review_queue(as_admin, base, team):  # noqa: F811
    p = period(as_admin, base)
    send(team["head"], base, p["id"], [team["ids"]["nino"]])
    assert team["head"].get("/api/v1/me/review-queue").json()[0]["to_review"] == 0
    evaluation_id = mine(team["nino"])["id"]
    add(team["nino"], evaluation_id, description="An article")
    team["nino"].post(f"/api/v1/me/evaluations/{evaluation_id}/submit", json={"confirm": True})

    [row] = team["head"].get("/api/v1/me/review-queue").json()
    assert (row["period"]["name"], row["sent"], row["submitted"], row["to_review"]) == ("Annual evaluation", 1, 1, 1)
    assert as_admin.get("/api/v1/me/review-queue").json()[0]["to_review"] == 1
    assert team["nino"].get("/api/v1/me/review-queue").json() == []  # researchers review nobody
