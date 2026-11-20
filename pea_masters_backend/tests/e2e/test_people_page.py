"""People page end to end: an Admin sets up a faculty and department and registers someone; that person signs in,
is made head of the department, registers and manages their own Researchers, and is finally deactivated."""

import re

from playwright.sync_api import Page, expect

from tests.e2e.conftest import APP_URL

FACULTY = "School of Business, Technology and Education"
DEPARTMENT = "Computer Science"
HEAD_EMAIL, HEAD_NAME = "nika.lomidze@iliauni.edu.ge", "Nika Lomidze"
RESEARCHER_EMAIL, RESEARCHER_NAME = "mariam.kapanadze@iliauni.edu.ge", "Mariam Kapanadze"


def row(page: Page, text: str):
    return page.locator("tbody tr", has_text=text)


def test_admin_sets_up_a_department_whose_head_registers_researchers(admin_page: Page, google_sign_in, shot):
    page = admin_page

    # 1. The Admin opens People from the sidebar
    page.goto("/home")
    page.get_by_role("button", name="People").click()
    expect(page).to_have_url(re.compile("/admin/people$"))
    expect(page.get_by_role("heading", name="People", level=1)).to_be_visible()
    expect(row(page, "Test Admin")).to_be_visible()

    # 2. Adds a faculty and a department inside it
    page.get_by_role("tab", name="Structure").click()
    page.get_by_role("button", name="Add faculty").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Name in English *").fill(FACULTY)
    dialog.get_by_label("Name in Georgian").fill("ბიზნესის, ტექნოლოგიისა და განათლების სკოლა")
    dialog.get_by_role("button", name="Add faculty").click()
    expect(page.get_by_role("status")).to_contain_text(f"{FACULTY} was added.")

    page.get_by_role("button", name="Add department", exact=True).click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_label("Faculty *")).to_have_value(re.compile(".+"))  # the only faculty is preselected
    dialog.get_by_label("Name in English *").fill(DEPARTMENT)
    dialog.get_by_role("button", name="Add department").click()
    expect(page.get_by_role("status")).to_contain_text(f"{DEPARTMENT} was added.")
    expect(page.get_by_role("heading", name=FACULTY, level=3)).to_be_visible()
    expect(row(page, DEPARTMENT)).to_contain_text("No Coordinator yet")
    shot(page, "1-structure")

    # 3. Registers someone into the department as a Researcher
    page.get_by_role("tab", name=re.compile("^People")).click()
    page.get_by_role("button", name="Add person").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("University email *").fill(HEAD_EMAIL)
    expect(dialog.get_by_label("Full name *")).to_have_value(HEAD_NAME)  # filled in from name.surname@
    dialog.get_by_label("Department", exact=True).select_option(label=DEPARTMENT)
    expect(dialog.get_by_role("checkbox", name=re.compile("^Researcher"))).to_be_checked()
    shot(page, "2-add-person-form")
    dialog.get_by_role("button", name="Add person").click()

    # ...who shows up as Invited, with department and faculty
    expect(page.get_by_role("status")).to_contain_text(f"{HEAD_NAME} was registered.")
    person = row(page, HEAD_NAME)
    for text in (HEAD_EMAIL, DEPARTMENT, FACULTY, "Researcher", "Invited", "Never"):
        expect(person).to_contain_text(text)
    shot(page, "3-person-registered")

    # 4. They sign in with Google for the first time: active, but no People page for a Researcher
    nika = google_sign_in(HEAD_EMAIL, HEAD_NAME)
    nika.goto("/home")
    expect(nika.get_by_text("ADMINISTRATION")).to_have_count(0)
    nika.goto("/admin/people")
    expect(nika).to_have_url(re.compile(r"/home$"))  # Administration pages send Researchers back to the dashboard
    page.reload()
    expect(row(page, HEAD_NAME)).to_contain_text("Active")

    # 5. The Admin makes them head of the department
    page.get_by_role("button", name=f"Edit {HEAD_NAME}").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_role("checkbox", name=re.compile("^Coordinator")).check()
    dialog.get_by_label("Coordinates department *").select_option(label=DEPARTMENT)
    dialog.get_by_role("button", name="Save changes").click()
    expect(row(page, HEAD_NAME)).to_contain_text(f"Coordinator: {DEPARTMENT}")
    shot(page, "4-made-head")

    # 6. As head, they register a Researcher into their own department
    nika.goto("/home")
    nika.get_by_role("button", name="People").click()
    expect(nika.get_by_text(f"Researchers of {DEPARTMENT}.")).to_be_visible()
    expect(row(nika, "Test Admin")).to_have_count(0)  # not in their department
    expect(nika.get_by_role("tab", name="Structure")).to_have_count(0)  # structure is for Admins
    nika.get_by_role("button", name="Add researcher").click()
    dialog = nika.get_by_role("dialog")
    expect(dialog).to_contain_text(DEPARTMENT)  # fixed to their department
    expect(dialog.get_by_role("checkbox")).to_have_count(0)  # no role choice
    dialog.get_by_label("University email *").fill(RESEARCHER_EMAIL)
    expect(dialog.get_by_label("Full name *")).to_have_value(RESEARCHER_NAME)
    dialog.get_by_role("button", name="Add researcher").click()
    expect(row(nika, RESEARCHER_NAME)).to_contain_text("Invited")
    expect(row(nika, RESEARCHER_NAME)).to_contain_text(DEPARTMENT)
    shot(nika, "5-head-registered-researcher")

    # ...and can deactivate and reactivate them; heads have no actions on themselves (or on other heads and Admins)
    expect(nika.get_by_role("button", name=f"Deactivate {HEAD_NAME}")).to_have_count(0)
    nika.get_by_role("button", name=f"Deactivate {RESEARCHER_NAME}").click()
    nika.get_by_role("dialog").get_by_role("button", name="Deactivate").click()
    expect(row(nika, RESEARCHER_NAME)).to_contain_text("Deactivated")
    nika.get_by_role("button", name=f"Reactivate {RESEARCHER_NAME}").click()
    nika.get_by_role("dialog").get_by_role("button", name="Reactivate").click()
    expect(row(nika, RESEARCHER_NAME)).to_contain_text("Invited")

    # The Admin sees the new Researcher too
    page.reload()
    expect(row(page, RESEARCHER_NAME)).to_contain_text(DEPARTMENT)

    # 7. The Admin deactivates the head; they're signed out at once and stop heading the department
    page.get_by_role("button", name=f"Deactivate {HEAD_NAME}").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Reason").fill("End-to-end test")
    dialog.get_by_role("button", name="Deactivate").click()
    expect(row(page, HEAD_NAME)).to_contain_text("Deactivated")
    expect(row(page, HEAD_NAME)).not_to_contain_text("Head:")
    shot(page, "6-deactivated")

    nika.reload()
    expect(nika).to_have_url(re.compile("/login"))


def test_admin_cannot_deactivate_themselves_or_register_outside_domain(admin_page: Page):
    page = admin_page
    page.goto("/admin/people")
    expect(page.get_by_role("button", name="Deactivate Test Admin")).to_be_disabled()

    page.get_by_role("button", name="Add person").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("University email *").fill("someone@gmail.com")
    expect(dialog.get_by_label("Full name *")).to_have_value("")  # nothing to guess from "someone"
    dialog.get_by_label("Full name *").fill("Someone")
    dialog.get_by_role("button", name="Add person").click()
    expect(dialog.get_by_role("alert")).to_contain_text("Use an address from the organization's domain")


def test_settings_show_google_sign_in_instead_of_a_password(admin_page: Page):
    page = admin_page
    page.goto("/settings/security")
    expect(page.get_by_role("heading", name="How you sign in")).to_be_visible()
    expect(page.get_by_text("e2e.admin@iliauni.edu.ge")).to_be_visible()
    expect(page.get_by_label("Current password")).to_have_count(0)


def test_admins_set_up_evaluation_periods(admin_page: Page, shot):
    """Admins add a period with its deadline and publication years, extend the deadline and remove it; names are
    unique. (Only Admins may manage periods: tests/api/test_evaluations.py.)"""
    page = admin_page
    page.goto("/admin/people")
    page.get_by_role("tab", name="Evaluation periods").click()
    panel = page.locator(".evaluation-periods")
    expect(panel).to_contain_text("No evaluation periods yet")

    def fill_period(name: str):
        sheet = page.get_by_role("dialog")
        sheet.get_by_label(re.compile("^Name")).fill(name)
        sheet.get_by_label(re.compile("^Opens on")).fill("2026-09-01")
        sheet.get_by_label(re.compile("^Deadline")).fill("2026-11-30")
        sheet.get_by_label(re.compile("^Publications from")).select_option("2024")
        sheet.get_by_label(re.compile("^Publications to")).select_option("2026")
        return sheet

    page.get_by_role("button", name="Add period").click()
    fill_period("Annual evaluation 2025-2026").get_by_role("button", name="Add period").click()
    row = panel.locator("tbody tr", has_text="Annual evaluation 2025-2026")
    expect(row).to_contain_text("30 Nov 2026")
    expect(row).to_contain_text("2024–2026")
    expect(page.get_by_role("dialog")).to_have_count(0)
    shot(page, "people-02-evaluation-periods")

    # The same name again: the server says so and the sheet stays open
    page.get_by_role("button", name="Add period").click()
    sheet = fill_period("annual evaluation 2025-2026")
    sheet.get_by_role("button", name="Add period").click()
    expect(sheet.get_by_role("alert")).to_contain_text("There's already a period called")
    sheet.get_by_role("button", name="Cancel").click()

    # Extending the deadline
    row.get_by_role("button", name="Edit Annual evaluation 2025-2026").click()
    sheet = page.get_by_role("dialog")
    sheet.get_by_label(re.compile("^Deadline")).fill("2026-12-15")
    sheet.get_by_role("button", name="Save period").click()
    expect(row).to_contain_text("15 Dec 2026")

    row.get_by_role("button", name="Remove Annual evaluation 2025-2026").click()
    page.get_by_role("dialog").get_by_role("button", name="Remove period").click()
    expect(panel).to_contain_text("No evaluation periods yet")


def test_the_privacy_page_is_public(browser, servers, shot):
    """Google asks for a privacy policy it can read without signing in; the login page links to it."""
    context = browser.new_context(base_url=APP_URL, viewport={"width": 1400, "height": 900})
    page = context.new_page()
    page.goto("/login")
    page.get_by_role("link", name="Privacy").click()
    expect(page).to_have_url(re.compile(r"/privacy$"))
    expect(page.get_by_role("heading", name="Privacy", level=1)).to_be_visible()
    for heading in ("What PEA keeps", "Who can see it", "Outside services", "Cookies and your browser"):
        expect(page.get_by_role("heading", name=heading)).to_be_visible()
    shot(page, "privacy-01-page")
    page.get_by_role("link", name="Back to sign in").click()
    expect(page).to_have_url(re.compile(r"/login$"))
    context.close()
