"""Evaluation form end to end, as a Researcher whose department has a head: entries are hidden instead of deleted,
a rejected entry leads to an email to the coordinator, and a submitted form can be updated and resubmitted before the
deadline. The form itself still lives in the browser (no evaluation API yet); the coordinator comes from the server.

The browser tests share one database and units can't be deleted, so this file must sort after test_people_page.py,
which expects to find a single faculty."""

import re
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Page, expect

from tests.e2e import fake_clarivate
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


def test_articles_are_checked_in_web_of_science(admin_page: Page, shot):
    """The DOI of an article entry is looked up (in the fake Clarivate, tests/e2e/fake_clarivate.py) as it's typed."""
    page = admin_page
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/evaluation-form")

    # An indexed article by the person signed in: details shown, citation offered, the check saved with the entry
    page.get_by_role("button", name="Add entry").first.click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(f"https://doi.org/{fake_clarivate.INDEXED}")
    expect(dialog).to_contain_text("Indexed in Web of Science")
    expect(dialog).to_contain_text("Heat-shock proteins in Caucasian wheat")
    expect(dialog).to_contain_text("PLANTA, 2025 · cited 14 times")
    expect(dialog).not_to_contain_text("among the")
    dialog.get_by_role("button", name="Use this citation").click()
    expect(dialog.get_by_label(re.compile("^Description"))).to_have_value(
        "Schulz, Karin; Admin, Test (2025). Heat-shock proteins in Caucasian wheat. PLANTA, 261(2), 12-25.")
    shot(page, "evaluation-04-wos-indexed")
    dialog.get_by_role("button", name="Save as draft").click()
    row = page.locator(".evaluation-entry", has_text="Heat-shock proteins in Caucasian wheat")
    expect(row.locator(".wos-badge")).to_have_text("WoS ✓ · cited 14 times")

    # Someone else's article: indexed, but the person isn't among its authors
    page.get_by_role("button", name="Add entry").first.click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(fake_clarivate.SOMEONE_ELSES)
    expect(dialog).to_contain_text("Admin isn't among the 1 author")
    dialog.get_by_role("button", name="Cancel").click()

    # Not indexed, and not registered anywhere: a typo
    page.get_by_role("button", name="Add entry").first.click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill("10.5555/pea.e2e.typo")
    expect(dialog).to_contain_text("This DOI isn't registered")
    dialog.get_by_role("button", name="Cancel").click()

    # Not indexed yet, but registered (Crossref) and in a journal Web of Science indexes
    page.get_by_role("button", name="Add entry").first.click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(fake_clarivate.NOT_YET_INDEXED)
    expect(dialog).to_contain_text("Not found in Web of Science")
    expect(dialog).to_contain_text(
        "Registered DOI · Journal article: Cold tolerance of Svanetian barley · Planta, 2026")
    expect(dialog).to_contain_text("The journal Planta is in Web of Science's journal list")
    expect(dialog.get_by_role("link", name="Journal in JCR")).to_have_attribute("href", "https://www.webofscience.com/jcr/planta")
    dialog.get_by_role("button", name="Use this citation").click()
    expect(dialog.get_by_label(re.compile("^Description"))).to_have_value(
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


def test_publications_are_found_by_researcher_id(admin_page: Page, shot):
    """With a ResearcherID on the profile, PEA finds the person's Web of Science documents: missing ones are offered
    on the evaluation form, and the CV builder imports them and fills in the metrics."""
    page = admin_page
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    # Without an identifier the form explains how to switch this on
    page.goto("/evaluation-form")
    expect(page.get_by_text("Let PEA find your Web of Science articles")).to_be_visible()

    # 1. The ResearcherID is saved on the profile, in canonical form
    page.goto("/profile#identifiers")
    card = page.locator("#identifiers")
    card.get_by_role("textbox", name="Web of Science ResearcherID").fill(fake_clarivate.RESEARCHER_ID.lower())
    card.get_by_role("button", name="Save").click()
    expect(card.get_by_role("status")).to_have_text("Saved")
    expect(card.get_by_role("textbox", name="Web of Science ResearcherID")).to_have_value(fake_clarivate.RESEARCHER_ID)

    # 2. The evaluation form lists the 2024-2026 documents that aren't in it (the 2019 one doesn't count)
    page.goto("/evaluation-form")
    missing = page.locator(".missing-card")
    expect(missing.get_by_role("heading")).to_have_text("2 Web of Science articles from 2024–2026 aren't in your form")
    expect(missing).not_to_contain_text("Seed bank digitisation")
    shot(page, "evaluation-06-missing-from-form")

    # Adding one opens a filled-in article entry, already checked
    missing.locator("li", has_text="Heat-shock proteins").get_by_role("button", name="Add").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_label(re.compile("^DOI"))).to_have_value(fake_clarivate.INDEXED)
    expect(dialog.get_by_label(re.compile("^Description"))).to_have_value(
        re.compile("Heat-shock proteins in Caucasian wheat"))
    expect(dialog).to_contain_text("Indexed in Web of Science")
    dialog.get_by_role("button", name="Save as draft").click()
    expect(missing.get_by_role("heading")).to_have_text("1 Web of Science article from 2024–2026 isn't in your form")

    # The same article can't be added to the same section twice
    page.get_by_role("button", name="Add entry").first.click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label(re.compile("^DOI")).fill(fake_clarivate.INDEXED)
    expect(dialog).to_contain_text("This DOI is already in this section")
    dialog.get_by_label(re.compile("^Description")).fill("Same article again")
    dialog.get_by_role("button", name="Save as draft").click()
    expect(dialog.get_by_role("alert")).to_contain_text("An article counts once")
    dialog.get_by_role("button", name="Cancel").click()

    # "Not mine" hides the other one, and the card goes away
    missing.get_by_role("button", name=re.compile("^Not mine")).click()
    expect(missing).to_have_count(0)

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

    page.get_by_role("button", name="My profile", exact=True).click()
    card.get_by_role("button", name="Disconnect to change it").click()
    expect(card.get_by_role("textbox", name="ORCID iD")).to_have_value(fake_clarivate.ORCID_ID)
    expect(card.get_by_role("link", name="Connect ORCID iD")).to_be_visible()

    assert not errors, errors
