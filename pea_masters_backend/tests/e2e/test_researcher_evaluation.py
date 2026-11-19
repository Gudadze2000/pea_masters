"""The evaluation form end to end. A head of department sends the form for the open period from Administration →
Evaluations; the researcher fills it in on the server (entries with uploaded evidence, hidden instead of deleted),
submits; the head reviews it (rejects an entry, returns the form); the researcher asks about the rejected entry,
updates and resubmits; the head approves it with its final score. Then Web of
Science checks, "Missing from your form" and the CV builder's imports, as the Admin.

The browser tests share one database and units can't be deleted, so this file must sort after test_people_page.py,
which expects to find a single faculty."""

import re
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Page, expect
from sqlalchemy import select

from app.db import SessionLocal
from app.evaluations import BUILT_IN_FORMS, built_in_structure
from app.models import Evaluation
from tests.e2e import fake_clarivate
from tests.e2e.conftest import APP_URL

FACULTY = "School of Life Sciences"
DEPARTMENT = "Plant Genetics"
HEAD = ("Nino Head", "nino.head.e2e@iliauni.edu.ge")
RESEARCHER = ("Eka Researcher", "eka.researcher.e2e@iliauni.edu.ge")
PERIOD = "Annual evaluation (browser tests)"
ARTICLE = "isu-2-1"  # 2.1 Article in an indexed journal
PDF = b"%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"


def api(page: Page, method: str, path: str, data=None):
    response = page.request.fetch(f"{APP_URL}/api/v1{path}", method=method, data=data)
    assert response.ok, response.text()
    return response.json()


def open_period(admin_page: Page, org) -> str:
    """The period these tests use: open now, publications from 2024 to 2026"""
    for period in api(admin_page, "GET", f"/orgs/{org}/evaluation-periods"):
        if period["name"] == PERIOD:
            return period["id"]
    today = date.today()
    return api(admin_page, "POST", f"/orgs/{org}/evaluation-periods", {
        "name": PERIOD, "starts_on": str(today - timedelta(days=30)), "ends_on": str(today + timedelta(days=30)),
        "publication_from": 2024, "publication_to": 2026})["id"]


def give_form(organization, period_id: str) -> None:
    """Sends the ISU form to the Admin. Nobody sends themselves a form in the app, so this goes straight to the
    database, as the head of their department would."""
    with SessionLocal() as db:
        if db.scalar(select(Evaluation.id).where(Evaluation.user_id == organization["admin_id"])):
            return
        isu = BUILT_IN_FORMS["isu-self-assessment"]
        db.add(Evaluation(organization_id=organization["org_id"], period_id=period_id,
                          user_id=organization["admin_id"], form_ref="isu-self-assessment", form_name=isu.name.en,
                          form_structure=built_in_structure(isu).model_dump(mode="json"),
                          sent_by=organization["admin_id"]))
        db.commit()


def record_card(page: Page, item_id: str):
    return page.locator(".evaluation-record").filter(has=page.locator(f"#record-{item_id}"))


def banner(page: Page):
    """Heading of the status banner at the top of the form"""
    return page.locator(".evaluation-banner-info p").first


def test_send_fill_in_submit_and_resubmit(admin_page: Page, organization, google_sign_in, shot):
    org = organization["org_id"]
    faculty = api(admin_page, "POST", f"/orgs/{org}/units", {"kind": "faculty", "name_en": FACULTY})["id"]
    department = api(admin_page, "POST", f"/orgs/{org}/units",
                     {"kind": "department", "name_en": DEPARTMENT, "parent_id": faculty})["id"]
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": HEAD[1], "display_name": HEAD[0],
        "roles": ["coordinator", "member"], "department_id": department, "coordinates_unit_id": department})
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": RESEARCHER[1], "display_name": RESEARCHER[0],
        "roles": ["member"], "department_id": department})
    open_period(admin_page, org)

    # 1. Before anything is sent, the researcher's page says so
    page = google_sign_in(RESEARCHER[1], RESEARCHER[0])
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/evaluation-form")
    expect(page.get_by_role("heading", name="No evaluation form yet")).to_be_visible()

    # 2. The head of department sends the ISU form for the open period
    head = google_sign_in(HEAD[1], HEAD[0])
    head.goto("/home")
    head.locator(".dashboard-sidebar").get_by_role("button", name="Evaluations", exact=True).click()
    row = head.locator(".send-table tbody tr", has_text=RESEARCHER[0])
    expect(row).to_contain_text("Not sent")
    expect(head.locator(".send-table tbody tr")).to_have_count(1)  # only their department, not themselves
    row.get_by_label(f"Select {RESEARCHER[0]}").check()
    head.get_by_role("button", name="Send form to 1").click()
    sheet = head.get_by_role("dialog")
    expect(sheet.get_by_label("Form")).to_have_value("isu-self-assessment")
    sheet.get_by_role("button", name="Send form").click()
    expect(head.get_by_role("status").filter(has_text="Sent to")).to_have_text("Sent to 1 person.")
    expect(row).to_contain_text("Not started")
    shot(head, "evaluation-00-sent")

    # 3. The researcher fills it in: an article with its evidence, and one saved without
    page.reload()
    expect(page.get_by_role("heading", name="Evaluation form", level=1)).to_be_visible()
    expect(page.get_by_text(f"{PERIOD} · ISU academic staff self-assessment")).to_be_visible()
    page.get_by_role("tab", name=re.compile("II · Research")).click()
    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^Performance indicator")).fill("Allelic diversity of Caucasian landraces")
    dialog.locator("#evaluation-evidence").set_input_files(
        files=[{"name": "landraces.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    expect(dialog.get_by_role("link", name="landraces.pdf")).to_be_visible()
    dialog.get_by_role("button", name="Save entry").click()
    article = page.locator(".evaluation-entry", has_text="Allelic diversity of Caucasian landraces")
    expect(article.get_by_role("link", name="landraces.pdf")).to_be_visible()

    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^Performance indicator")).fill("Transcriptomics of heat stress response")
    dialog.get_by_role("button", name="Save entry").click()
    expect(dialog.get_by_role("alert")).to_contain_text("Attach an evidence file, or save this entry as a draft.")
    dialog.get_by_role("button", name="Save as draft").click()

    # Entries can only be hidden, not deleted; a hidden one stays listed, isn't sent, and can be shown again
    expect(page.get_by_role("button", name=re.compile("^Delete"))).to_have_count(0)
    page.get_by_role("button", name="Hide Transcriptomics of heat stress response").click()
    hidden = page.locator(".evaluation-entry", has_text="Transcriptomics of heat stress response")
    expect(hidden.locator(".evaluation-badge")).to_have_text("Hidden")
    expect(page.get_by_role("status").filter(has_text="won't be sent")).to_be_visible()
    page.get_by_role("button", name="Preview").click()
    preview = page.get_by_role("dialog")
    expect(preview).to_contain_text("1 hidden entry is left out")
    expect(preview).not_to_contain_text("Transcriptomics of heat stress response")
    preview.get_by_role("button", name="Close preview").click()
    # Saved on the server: still there after a reload
    page.reload()
    page.get_by_role("tab", name=re.compile("II · Research")).click()
    expect(hidden.locator(".evaluation-badge")).to_have_text("Hidden")
    shot(page, "evaluation-01-hidden-entry")

    # 4. Submitting locks the form, and the head of department sees it
    page.get_by_role("button", name="Review & submit").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_contain_text("Hidden (not sent)")
    dialog.get_by_label("I confirm that the information I provided is accurate.").check()
    dialog.get_by_role("button", name="Submit for review").click()
    expect(banner(page)).to_have_text(re.compile("^Submitted on"))
    expect(page.get_by_role("button", name="Add entry")).to_have_count(0)
    head.reload()
    expect(head.locator(".send-table tbody tr", has_text=RESEARCHER[0])).to_contain_text("To review")

    # 5. The head of department reviews it: rejecting needs a reason; then the form goes back to the researcher
    row = head.locator(".send-table tbody tr", has_text=RESEARCHER[0])
    row.get_by_role("button", name=re.compile("^Review")).click()
    expect(head.get_by_role("heading", name=RESEARCHER[0], level=1)).to_be_visible()
    entry = head.locator(".review-entry", has_text="Allelic diversity of Caucasian landraces")
    expect(entry.get_by_role("link", name="landraces.pdf")).to_be_visible()
    expect(head.locator(".review-entry", has_text="Transcriptomics")).to_have_count(0)  # hidden: not sent
    entry.get_by_role("button", name="Reject Allelic diversity of Caucasian landraces").click()
    entry.get_by_role("button", name="Reject entry").click()
    expect(entry.get_by_role("alert")).to_contain_text("Say why it's rejected")
    entry.get_by_label(re.compile("^Why is it rejected")).fill("DOI does not match the attached PDF.")
    entry.get_by_role("button", name="Reject entry").click()
    expect(entry.locator(".status-badge")).to_have_text("Rejected")
    expect(head.get_by_role("button", name="Return to researcher")).to_be_disabled()  # needs a comment
    head.get_by_label(f"Comment for {RESEARCHER[0]}").fill("Please attach the right PDF and resubmit.")
    head.get_by_role("button", name="Return to researcher").click()
    expect(head.get_by_text(f"Returned to {RESEARCHER[0]}")).to_be_visible()
    shot(head, "evaluation-review-01-returned")

    # 6. The researcher sees why, and can ask the coordinator: an email to the head of department, filled in
    page.reload()
    expect(page.get_by_text("Your coordinator returned your form")).to_be_visible()
    expect(page.get_by_text("Please attach the right PDF and resubmit.")).to_be_visible()
    page.get_by_role("tab", name=re.compile("II · Research")).click()
    page.get_by_role("button", name="Ask coordinator").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_contain_text(HEAD[0])
    expect(dialog).to_contain_text(HEAD[1])
    expect(dialog.get_by_label("Subject")).to_have_value(re.compile("2.1 Article in an indexed journal"))
    expect(dialog.get_by_label("Message")).to_have_value(re.compile("Allelic diversity of Caucasian landraces"))
    gmail = parse_qs(urlparse(dialog.get_by_role("link", name="Open in Gmail").get_attribute("href")).query)
    assert gmail["to"] == [HEAD[1]] and gmail["authuser"] == [RESEARCHER[1]]
    assert dialog.get_by_role("link", name="Default email app").get_attribute("href").startswith(f"mailto:{HEAD[1]}?")
    shot(page, "evaluation-02-contact-coordinator")
    dialog.get_by_role("button", name="Close dialog").click()

    # 7. Before the deadline it can be updated: nothing to resubmit until something changes...
    page.get_by_role("button", name="Update submission").first.click()
    expect(page.get_by_text("Updating your submitted form")).to_be_visible()
    expect(page.get_by_role("button", name="Review & resubmit")).to_be_disabled()

    # ...then a new article is added and the form resubmitted
    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^Performance indicator")).fill("Heat-shock proteins in Caucasian wheat (2026)")
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

    # 8. The head approves the new article and then the evaluation: final, with its score
    head.reload()
    expect(head.locator(".review-entry", has_text="Allelic").locator(".status-badge")).to_have_text("Rejected")
    added = head.locator(".review-entry", has_text="Heat-shock proteins in Caucasian wheat (2026)")
    added.get_by_role("button", name=re.compile("^Approve Heat-shock")).click()
    expect(added.locator(".status-badge")).to_have_text("Approved")
    head.get_by_role("button", name="Approve evaluation").click()
    confirm = head.get_by_role("alertdialog")
    expect(confirm).to_contain_text("The final score is 50 pts")
    confirm.get_by_role("button", name="Approve evaluation").click()
    expect(head.get_by_text("Approved: final score 50 pts")).to_be_visible()
    expect(head.get_by_role("button", name="Approve evaluation")).to_have_count(0)
    shot(head, "evaluation-review-02-approved")
    head.locator(".dashboard-sidebar").get_by_role("button", name="Evaluations", exact=True).click()
    approved_row = head.locator(".send-table tbody tr", has_text=RESEARCHER[0])
    expect(approved_row).to_contain_text("Approved")
    expect(approved_row).to_contain_text("Final score 50")

    # 9. The researcher sees the final score, and the form is locked for good
    page.reload()
    expect(page.get_by_text("Your evaluation was approved: final score 50 pts")).to_be_visible()
    expect(page.get_by_role("button", name="Update submission")).to_have_count(0)
    expect(page.get_by_role("button", name="Add entry")).to_have_count(0)
    shot(page, "evaluation-04-approved")

    assert not errors, errors


def test_an_admin_reopens_and_extends_for_one_person(admin_page: Page, google_sign_in, shot):
    """Continues from test_send_fill_in_submit_and_resubmit, which ends with Eka's evaluation approved: the Admin takes
    the approval back and gives Eka ten more days than the period."""
    page = admin_page
    page.goto("/admin/evaluations")
    page.get_by_label("Evaluation period").select_option(label=f"{PERIOD} (open)")
    row = page.locator(".send-table tbody tr", has_text=RESEARCHER[0])
    expect(row).to_contain_text("Approved")

    row.get_by_role("button", name=f"Reopen {RESEARCHER[0]}'s evaluation").click()
    sheet = page.get_by_role("dialog")
    expect(sheet).to_contain_text("The approval and the final score (50) are taken back")
    sheet.get_by_label("Reason").fill("The 2026 article was published after the cut-off.")
    sheet.get_by_role("button", name="Reopen evaluation").click()
    expect(row).to_contain_text("To review")

    later = date.today() + timedelta(days=40)  # the period ends in 30 days
    row.get_by_role("button", name=f"Extend {RESEARCHER[0]}'s deadline").click()
    sheet = page.get_by_role("dialog")
    sheet.get_by_label("New deadline").fill(str(date.today() + timedelta(days=10)))
    sheet.get_by_role("button", name="Extend deadline").click()
    expect(sheet.get_by_role("alert")).to_contain_text("Pick a day after the period's own deadline")
    sheet.get_by_label("New deadline").fill(str(later))
    sheet.get_by_role("button", name="Extend deadline").click()
    expect(row).to_contain_text(f"Deadline extended to {later.day} {later:%b %Y}")
    shot(page, "evaluation-review-03-exceptions")

    # Eka's form waits for review again, with the later deadline
    eka = google_sign_in(RESEARCHER[1], RESEARCHER[0])
    eka.goto("/evaluation-form")
    expect(banner(eka)).to_have_text(re.compile("^Submitted on"))
    expect(eka.get_by_text("Your evaluation was approved")).to_have_count(0)
    deadline = eka.locator(".evaluation-deadline")
    expect(deadline).to_contain_text(f"{later.day} {later:%b %Y}")
    expect(deadline).to_contain_text("extended for you")
    expect(eka.get_by_role("button", name="Update submission").first).to_be_visible()


def open_article_item(page: Page) -> None:
    page.goto("/evaluation-form")
    page.get_by_role("tab", name=re.compile("II · Research")).click()


def test_articles_are_checked_in_web_of_science(admin_page: Page, organization, shot):
    """The DOI of an article entry is looked up (in the fake Clarivate, tests/e2e/fake_clarivate.py) as it's typed."""
    page = admin_page
    give_form(organization, open_period(page, organization["org_id"]))
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    open_article_item(page)

    # An indexed article by the person signed in: details shown, citation offered, the check saved with the entry
    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(f"https://doi.org/{fake_clarivate.INDEXED}")
    expect(dialog).to_contain_text("Indexed in Web of Science")
    expect(dialog).to_contain_text("Heat-shock proteins in Caucasian wheat")
    expect(dialog).to_contain_text("PLANTA, 2025 · cited 14 times")
    expect(dialog).not_to_contain_text("among the")
    dialog.get_by_role("button", name="Use this citation").click()
    expect(dialog.get_by_label(re.compile("^Performance indicator"))).to_have_value(
        "Schulz, Karin; Admin, Test (2025). Heat-shock proteins in Caucasian wheat. PLANTA, 261(2), 12-25.")
    shot(page, "evaluation-04-wos-indexed")
    dialog.get_by_role("button", name="Save as draft").click()
    row = page.locator(".evaluation-entry", has_text="Heat-shock proteins in Caucasian wheat")
    expect(row.locator(".wos-badge")).to_have_text("WoS ✓ · cited 14 times")

    # Someone else's article: indexed, but the person isn't among its authors
    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(fake_clarivate.SOMEONE_ELSES)
    expect(dialog).to_contain_text("Admin isn't among the 1 author")
    dialog.get_by_role("button", name="Cancel").click()

    # Not indexed, and not registered anywhere: a typo
    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill("10.5555/pea.e2e.typo")
    expect(dialog).to_contain_text("This DOI isn't registered")
    dialog.get_by_role("button", name="Cancel").click()

    # Not indexed yet, but registered (Crossref) and in a journal Web of Science indexes
    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(fake_clarivate.NOT_YET_INDEXED)
    expect(dialog).to_contain_text("Not found in Web of Science")
    expect(dialog).to_contain_text(
        "Registered DOI · Journal article: Cold tolerance of Svanetian barley · Planta, 2026")
    expect(dialog).to_contain_text("The journal Planta is in Web of Science's journal list")
    expect(dialog.get_by_role("link", name="Journal in JCR")).to_have_attribute("href", "https://www.webofscience.com/jcr/planta")
    dialog.get_by_role("button", name="Use this citation").click()
    expect(dialog.get_by_label(re.compile("^Performance indicator"))).to_have_value(
        "Admin, Test (2026). Cold tolerance of Svanetian barley. Planta.")
    shot(page, "evaluation-05-not-yet-indexed")
    dialog.get_by_role("button", name="Save as draft").click()
    row = page.locator(".evaluation-entry", has_text="Cold tolerance of Svanetian barley")
    expect(row.locator(".wos-badge")).to_have_text("Not in WoS yet · journal indexed")
    # The first ISSN isn't in the list, the second is: both were asked once
    assert fake_clarivate.requests.count("journal:0032-0935") == 1
    assert fake_clarivate.requests.count("journal:1432-2048") == 1

    # Opening the saved entry again is answered from PEA's cache: Clarivate was asked about each DOI once
    page.get_by_role("button", name=re.compile("^Edit Schulz, Karin")).click()
    expect(page.get_by_role("dialog")).to_contain_text("Indexed in Web of Science")
    assert fake_clarivate.requests.count(fake_clarivate.INDEXED) == 1

    assert not errors, errors


def test_publications_are_found_by_researcher_id(admin_page: Page, organization, shot):
    """With a ResearcherID on the profile, PEA finds the person's Web of Science documents: missing ones are offered
    on the evaluation form, and the CV builder imports them and fills in the metrics."""
    page = admin_page
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    # Without an identifier the form explains how to switch this on
    give_form(organization, open_period(page, organization["org_id"]))
    page.goto("/evaluation-form")
    expect(page.get_by_text("Let PEA find your Web of Science articles")).to_be_visible()

    # 1. The ResearcherID is saved on the profile, in canonical form
    page.goto("/profile#identifiers")
    card = page.locator("#identifiers")
    card.get_by_role("textbox", name="Web of Science ResearcherID").fill(fake_clarivate.RESEARCHER_ID.lower())
    card.get_by_role("button", name="Save").click()
    expect(card.get_by_role("status")).to_have_text("Saved")
    expect(card.get_by_role("textbox", name="Web of Science ResearcherID")).to_have_value(fake_clarivate.RESEARCHER_ID)

    # 2. The evaluation form lists the period's 2024-2026 documents that aren't in it: not the 2019 one, and not
    # Heat-shock proteins, which test_articles_are_checked_in_web_of_science added (the form is on the server)
    open_article_item(page)
    missing = page.locator(".missing-card")
    expect(missing.get_by_role("heading")).to_have_text("1 Web of Science article from 2024–2026 isn't in your form")
    expect(missing).to_contain_text("Root architecture of drought-tolerant wheat")
    expect(missing).not_to_contain_text("Seed bank digitisation")
    expect(missing).not_to_contain_text("Heat-shock proteins")
    shot(page, "evaluation-06-missing-from-form")

    # "Not mine" hides it, and the card goes away (remembered in this browser only)
    missing.get_by_role("button", name=re.compile("^Not mine")).click()
    expect(missing).to_have_count(0)
    page.evaluate("localStorage.removeItem('pea-evaluation-dismissed-wos-v1')")
    open_article_item(page)

    # Adding it opens a filled-in entry in the form's article item
    missing.locator("li", has_text="Root architecture").get_by_role("button", name="Add").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_label(re.compile("^DOI"))).to_have_value(fake_clarivate.SECOND)
    expect(dialog.get_by_label(re.compile("^Performance indicator"))).to_have_value(
        re.compile("Root architecture of drought-tolerant wheat"))
    expect(dialog.get_by_label("Form item")).to_have_value(ARTICLE)
    dialog.get_by_role("button", name="Save as draft").click()
    expect(missing).to_have_count(0)
    expect(record_card(page, ARTICLE)).to_contain_text("Root architecture of drought-tolerant wheat")

    # The same article can't be added to the same item twice
    record_card(page, ARTICLE).get_by_role("button", name="Add entry").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(fake_clarivate.INDEXED)
    expect(dialog).to_contain_text("This DOI is already in this item")
    dialog.get_by_label(re.compile("^Performance indicator")).fill("Same article again")
    dialog.get_by_role("button", name="Save as draft").click()
    expect(dialog.get_by_role("alert")).to_contain_text("An article counts once")
    dialog.get_by_role("button", name="Cancel").click()

    # 3. The CV builder shows the ResearcherID from the profile, imports all three documents and fills the metrics
    page.goto("/cv-builder")
    researcher_id = page.locator(".cv-profile-id", has_text="Web of Science ResearcherID")
    expect(researcher_id).to_contain_text(fake_clarivate.RESEARCHER_ID)
    page.get_by_role("button", name="Fill from Web of Science").click()
    expect(page.get_by_label("h-index")).to_have_value("3")  # citations 30, 14, 6
    expect(page.get_by_label("Total citations")).to_have_value("50")
    expect(page.get_by_label("Source")).to_have_value("Web of Science")

    page.get_by_role("tab", name="Publications").click()
    page.get_by_role("button", name="Import from Web of Science").click()
    sheet = page.get_by_role("dialog")
    expect(sheet.locator(".cv-wos-item")).to_have_count(3)
    expect(sheet).to_contain_text("Planta · 2025")  # "PLANTA" in Web of Science
    shot(page, "cv-01-import-from-wos")
    sheet.get_by_role("button", name="Add 3 publications").click()
    added = page.get_by_role("status").filter(has_text="from Web of Science")
    expect(added).to_have_text("3 publications added from Web of Science.")
    expect(page.locator(".cv-pub-card", has_text="Seed bank digitisation in Georgia")).to_be_visible()

    # Opening the import again: everything is already on the CV
    page.get_by_role("button", name="Import from Web of Science").click()
    expect(page.get_by_role("dialog").get_by_role("button", name="Add", exact=True)).to_be_disabled()

    assert not errors, errors


def test_research_output_overview(admin_page: Page, google_sign_in, shot):
    """Admins see everyone's Web of Science output; a head of department sees their own department. Runs after
    test_publications_are_found_by_researcher_id, which gave the Admin a ResearcherID."""
    page = admin_page
    page.goto("/admin/people")
    page.get_by_role("tab", name="Research output").click()
    panel = page.locator(".research-output")
    admin_row = panel.locator("tbody tr", has_text="Test Admin")
    expect(admin_row).to_contain_text(fake_clarivate.RESEARCHER_ID)
    # 2024: one article, 2025: one; cited 14 + 6
    expect(admin_row.locator("td.num")).to_have_text(["2", "1", "1", "0", "20", "2"])
    expect(panel.locator(".research-output-totals")).to_contain_text("Documents2")
    expect(panel.get_by_text(re.compile(r"\d+ people have no ResearcherID or ORCID iD"))).to_be_visible()
    shot(page, "people-01-research-output")

    # Narrowing the years drops the 2024 article
    panel.get_by_label("From year").select_option("2025")
    expect(admin_row.locator("td.num").first).to_have_text("1")

    # The head of Plant Genetics sees only their department: themselves and Eka, neither with an identifier
    head = google_sign_in(HEAD[1], HEAD[0])
    head.goto("/admin/people")
    head.get_by_role("tab", name="Research output").click()
    rows = head.locator(".research-output tbody tr")
    expect(rows).to_have_count(2)
    expect(head.locator(".research-output")).to_contain_text(RESEARCHER[0])
    expect(head.get_by_label("Faculty or department")).to_have_count(0)


def test_connect_orcid_and_import_works(admin_page: Page, shot):
    """"Connect ORCID iD" sends the person to ORCID (the fake one approves at once) and back; the iD is then verified.
    The CV builder imports the record's public works. Disconnecting makes the iD editable again."""
    page = admin_page
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/profile#identifiers")
    card = page.locator("#identifiers")
    card.get_by_role("link", name="Connect ORCID iD").click()

    expect(page).to_have_url(re.compile(r"/profile#identifiers$"))  # the outcome is dropped from the address
    expect(card.get_by_role("status").filter(has_text="ORCID")).to_have_text(
        "Your ORCID iD is connected: PEA now knows it really is yours.")
    expect(card.get_by_text("Verified with ORCID")).to_be_visible()
    expect(card.get_by_role("link", name=fake_clarivate.ORCID_ID)).to_be_visible()
    assert fake_clarivate.requests.count("orcid:token") == 1
    shot(page, "profile-03-orcid-connected")

    page.get_by_role("button", name="CV builder").click()
    page.get_by_role("tab", name="Publications").click()
    page.get_by_role("button", name="Import from ORCID").click()
    sheet = page.get_by_role("dialog")
    expect(sheet).to_contain_text(f"2 public works on ORCID record {fake_clarivate.ORCID_ID}.")
    expect(sheet.locator(".cv-wos-item")).to_have_count(2)
    sheet.get_by_role("button", name="Add 2 publications").click()
    expect(page.get_by_role("status").filter(has_text="from ORCID")).to_contain_text("2 publications added from ORCID.")
    expect(page.locator(".cv-pub-card", has_text="Seed banks of Georgia")).to_contain_text("Admin T")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".cv-save-status")).to_contain_text("Saved ·")

    page.get_by_role("button", name="My profile", exact=True).click()
    card.get_by_role("button", name="Disconnect to change it").click()
    expect(card.get_by_role("textbox", name="ORCID iD")).to_have_value(fake_clarivate.ORCID_ID)
    expect(card.get_by_role("link", name="Connect ORCID iD")).to_be_visible()

    assert not errors, errors
