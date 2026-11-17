"""Evaluation form end to end, as a Researcher whose department has a head: entries are hidden instead of deleted,
a rejected entry leads to an email to the coordinator, and a submitted form can be updated and resubmitted before the
deadline. The form itself still lives in the browser (no evaluation API yet); the coordinator comes from the server.

The browser tests share one database and units can't be deleted, so this file must sort after test_people_page.py,
which expects to find a single faculty."""

import re
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Page, expect

from tests.e2e.conftest import APP_URL

FACULTY = "School of Life Sciences"
DEPARTMENT = "Plant Genetics"
HEAD = ("Nino Head", "nino.head.e2e@iliauni.edu.ge")
RESEARCHER = ("Eka Researcher", "eka.researcher.e2e@iliauni.edu.ge")


def api(page: Page, method: str, path: str, data=None):
    response = page.request.fetch(f"{APP_URL}/api/v1{path}", method=method, data=data)
    assert response.ok, response.text()
    return response.json()


def banner(page: Page):
    """Heading of the status banner at the top of the form"""
    return page.locator(".evaluation-banner-info p").first


def test_hide_contact_and_resubmit(admin_page: Page, organization, google_sign_in, shot):
    org = organization["org_id"]
    faculty = api(admin_page, "POST", f"/orgs/{org}/units", {"kind": "faculty", "name_en": FACULTY})["id"]
    department = api(admin_page, "POST", f"/orgs/{org}/units",
                     {"kind": "department", "name_en": DEPARTMENT, "parent_id": faculty})["id"]
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": HEAD[1], "display_name": HEAD[0],
        "roles": ["coordinator", "member"], "department_id": department, "coordinates_unit_id": department})
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": RESEARCHER[1], "display_name": RESEARCHER[0],
        "roles": ["member"], "department_id": department})

    page = google_sign_in(RESEARCHER[1], RESEARCHER[0])
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/evaluation-form")
    expect(page.get_by_role("heading", name="Evaluation form", level=1)).to_be_visible()

    # 1. Entries can only be hidden, not deleted; a hidden entry stays listed, isn't sent, and can be shown again
    expect(page.get_by_role("button", name=re.compile("^Delete"))).to_have_count(0)
    page.get_by_role("button", name="Hide Transcriptomics of heat stress response").click()
    row = page.locator(".evaluation-entry", has_text="Transcriptomics of heat stress response")
    expect(row.locator(".evaluation-badge")).to_have_text("Hidden")
    expect(page.get_by_role("status")).to_contain_text("won't be sent with your form")
    page.get_by_role("button", name="Preview").click()
    preview = page.get_by_role("dialog")
    expect(preview).to_contain_text("1 hidden entry is left out")
    expect(preview).not_to_contain_text("Transcriptomics of heat stress response")
    preview.get_by_role("button", name="Close preview").click()
    shot(page, "evaluation-01-hidden-entry")

    # 2. A rejected entry offers to ask the coordinator: an email to the head of department, filled in
    page.get_by_role("button", name="Ask coordinator").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_contain_text(HEAD[0])
    expect(dialog).to_contain_text(HEAD[1])
    expect(dialog.get_by_label("Subject")).to_have_value(re.compile("Article - Scopus / WoS indexed"))
    expect(dialog.get_by_label("Message")).to_have_value(re.compile("Allelic diversity of Caucasian landraces"))
    gmail = parse_qs(urlparse(dialog.get_by_role("link", name="Open in Gmail").get_attribute("href")).query)
    assert gmail["to"] == [HEAD[1]] and gmail["authuser"] == [RESEARCHER[1]]
    assert "Article" in gmail["su"][0]
    assert dialog.get_by_role("link", name="Default email app").get_attribute("href").startswith(f"mailto:{HEAD[1]}?")
    shot(page, "evaluation-02-contact-coordinator")
    dialog.get_by_role("button", name="Close dialog").click()

    # 3. Submitting locks the form, and that survives a reload
    page.get_by_role("button", name="Review & submit").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_contain_text("Hidden (not sent)")
    dialog.get_by_label("I confirm that the information I provided is accurate.").check()
    dialog.get_by_role("button", name="Submit for review").click()
    expect(banner(page)).to_have_text(re.compile("^Submitted on"))
    expect(page.get_by_role("button", name="Add entry")).to_have_count(0)
    page.reload()
    expect(banner(page)).to_have_text(re.compile("^Submitted on"))

    # 4. Before the deadline it can be updated: nothing to resubmit until something changes...
    page.get_by_role("button", name="Update submission").first.click()
    expect(page.get_by_text("Updating your submitted form")).to_be_visible()
    expect(page.get_by_role("button", name="Review & resubmit")).to_be_disabled()

    # ...then a new article is added and the form resubmitted
    page.get_by_role("button", name="Add entry").first.click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^Description")).fill("Heat-shock proteins in Caucasian wheat (2026)")
    dialog.get_by_role("button", name="Save as draft").click()
    expect(page.get_by_text("Changes so far: 1 new or changed entry")).to_be_visible()
    page.get_by_role("button", name="Review & resubmit").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_role("heading", name="Resubmit evaluation?")).to_be_visible()
    dialog.get_by_label("I confirm that the information I provided is accurate.").check()
    dialog.get_by_role("button", name="Resubmit").click()
    expect(banner(page)).to_have_text(re.compile("^Submitted on"))
    new_row = page.locator(".evaluation-entry", has_text="Heat-shock proteins in Caucasian wheat (2026)")
    expect(new_row.locator(".evaluation-badge")).to_have_text("Submitted")
    shot(page, "evaluation-03-resubmitted")

    assert not errors, errors
