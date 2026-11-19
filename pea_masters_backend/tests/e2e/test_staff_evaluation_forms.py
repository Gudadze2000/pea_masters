"""Evaluation forms (Administration → Evaluation forms): a head of department copies the built-in ISU form and changes
the copy, makes a form from scratch, and is warned before leaving unsaved changes. Admins see every coordinator's
forms; researchers can't open the page at all. (Who may see and change which form: tests/api/test_evaluations.py.)

Sorts after test_people_page.py, which expects a single faculty."""

import re

from playwright.sync_api import Page, expect

from tests.e2e.conftest import APP_URL

HEAD = ("Lasha Head", "lasha.head.forms@iliauni.edu.ge")
RESEARCHER = ("Mari Researcher", "mari.researcher.forms@iliauni.edu.ge")
COPY = "ISU academic staff self-assessment (copy)"


def api(page: Page, method: str, path: str, data=None):
    response = page.request.fetch(f"{APP_URL}/api/v1{path}", method=method, data=data)
    assert response.ok, response.text()
    return response.json()


def setup_people(admin_page: Page, org) -> None:
    faculty = api(admin_page, "POST", f"/orgs/{org}/units",
                  {"kind": "faculty", "name_en": "School of Engineering"})["id"]
    department = api(admin_page, "POST", f"/orgs/{org}/units",
                     {"kind": "department", "name_en": "Robotics", "parent_id": faculty})["id"]
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": HEAD[1], "display_name": HEAD[0],
        "roles": ["coordinator", "member"], "department_id": department, "coordinates_unit_id": department})
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": RESEARCHER[1], "display_name": RESEARCHER[0],
        "roles": ["member"], "department_id": department})


def test_researchers_dont_get_the_administration_pages(admin_page: Page, organization, google_sign_in):
    setup_people(admin_page, organization["org_id"])
    page = google_sign_in(RESEARCHER[1], RESEARCHER[0])
    page.goto("/home")
    sidebar = page.locator(".dashboard-sidebar")
    expect(sidebar.get_by_role("button", name="Evaluation form", exact=True)).to_be_visible()
    expect(sidebar.get_by_text("ADMINISTRATION")).to_have_count(0)
    expect(sidebar.get_by_role("button", name="Evaluation forms")).to_have_count(0)
    # Typing the address leads back to the dashboard
    for address in ("/admin/evaluation-forms", "/admin/evaluation-forms/isu-self-assessment", "/admin/people"):
        page.goto(address)
        expect(page).to_have_url(re.compile(r"/home$"))


def test_a_head_of_department_makes_forms(admin_page: Page, google_sign_in, shot):
    page = google_sign_in(HEAD[1], HEAD[0])
    page.goto("/home")
    page.locator(".dashboard-sidebar").get_by_role("button", name="Evaluation forms").click()
    expect(page).to_have_url(re.compile(r"/admin/evaluation-forms$"))
    table = page.locator(".form-list-table")
    expect(table).to_contain_text("ISU academic staff self-assessment")
    expect(table).to_contain_text("3 parts · 60 items")
    expect(table).to_contain_text("No forms of your own yet")
    shot(page, "forms-01-list")

    # The built-in form opens read-only
    table.get_by_role("button", name="View ISU academic staff self-assessment").click()
    expect(page.locator(".form-readonly-badge")).to_have_text("Built-in form")
    expect(page.get_by_role("button", name="Save")).to_have_count(0)
    expect(page.locator(".evaluation-record")).to_have_count(60)

    # Copy it and change the copy: teaching needs 60 points instead of 80
    page.get_by_role("button", name="Make a copy").click()
    expect(page.get_by_label(re.compile(r"^Name \(English\)")).first).to_have_value(COPY)
    expect(page.locator(".form-save-status")).to_have_text("Not saved yet")
    teaching = page.locator(".form-part").first
    expect(teaching.locator(".form-item")).to_have_count(7)
    teaching.get_by_label("Points needed").fill("60")
    expect(teaching).to_contain_text("at least 60 pts needed")
    page.get_by_role("button", name="Save").click()
    expect(page.locator(".form-save-status")).to_have_text("Saved")
    expect(page).to_have_url(re.compile(r"/admin/evaluation-forms/[0-9a-f-]{36}\?org="))
    expect(page.get_by_role("button", name="Cancel")).to_have_count(0)  # only before the first save
    shot(page, "forms-02-copy-saved")

    # Leaving with unsaved changes asks first
    teaching.locator(".form-item").first.get_by_role("button", name=re.compile(r"^1\.1 Teaching a course")).click()
    page.locator(".form-item-body").first.get_by_label("Points per entry", exact=False).fill("25")
    expect(page.locator(".form-save-status")).to_have_text("Unsaved changes")
    page.locator(".dashboard-sidebar").get_by_role("button", name="People").click()
    dialog = page.get_by_role("alertdialog")
    expect(dialog).to_contain_text("Leave without saving?")
    dialog.get_by_role("button", name="Stay on this page").click()
    expect(page).to_have_url(re.compile(r"/admin/evaluation-forms/"))
    page.keyboard.press("Control+s")
    expect(page.locator(".form-save-status")).to_have_text("Saved")

    # Cancel on a copy that isn't saved yet asks first; leaving discards it
    page.goto("/admin/evaluation-forms")
    table.get_by_role("button", name="Make a copy of ISU academic staff self-assessment", exact=True).click()
    expect(page.locator(".form-save-status")).to_have_text("Not saved yet")
    page.get_by_role("button", name="Cancel").click()
    dialog = page.get_by_role("alertdialog")
    expect(dialog).to_contain_text("Leave without saving?")
    dialog.get_by_role("button", name="Stay on this page").click()
    expect(page.get_by_role("button", name="Save")).to_be_visible()
    page.get_by_role("button", name="Cancel").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Leave without saving").click()
    expect(page).to_have_url(re.compile(r"/admin/evaluation-forms$"))
    expect(table.locator("tr", has_text="(copy 2)")).to_have_count(0)

    # Cancel on a new form nobody has typed in yet just goes back
    page.get_by_role("button", name="New form").click()
    expect(page.get_by_role("heading", name="New form", level=1)).to_be_visible()
    page.get_by_role("button", name="Cancel").click()
    expect(page).to_have_url(re.compile(r"/admin/evaluation-forms$"))

    # A new form: saving an empty one points out what's missing
    page.get_by_role("button", name="New form").click()
    expect(page.get_by_role("heading", name="New form", level=1)).to_be_visible()
    page.get_by_label(re.compile(r"^Name \(English\)")).first.fill("Robotics lab evaluation")
    page.get_by_role("button", name="Save").click()
    expect(page.get_by_role("alert").first).to_contain_text("need fixing before the form can be saved")
    expect(page.locator(".form-part")).to_contain_text("Give the part a name.")
    expect(page.locator(".form-item")).to_contain_text("Give the item a name.")

    part = page.locator(".form-part").first
    part.get_by_label(re.compile(r"^Part name \(English\)")).fill("Lab work")
    item = part.locator(".form-item-body")
    item.get_by_label(re.compile(r"^Name \(English\)")).fill("Supervising a student project")
    item.get_by_label(re.compile(r"^Points per entry")).fill("10")
    item.get_by_label("Most entries").fill("3")
    item.get_by_label(re.compile(r"^What researchers write")).fill("Student's name and project title.")
    part.get_by_role("button", name="Add item").click()
    second = part.locator(".form-item").nth(1)
    second.get_by_label(re.compile(r"^Name \(English\)")).fill("A lab demonstration")
    second.get_by_label(re.compile(r"^Points per entry")).fill("5")
    second.get_by_label("Points vary per entry").check()
    second.get_by_label(re.compile(r"^How the points")).fill("5 points, or 10 for a public demonstration.")
    expect(part).to_contain_text("2 items · no upper limit")
    page.get_by_role("button", name="Save").click()
    expect(page.locator(".form-save-status")).to_have_text("Saved")

    page.get_by_role("tab", name="Preview").click()
    preview = page.locator(".form-preview")
    expect(preview.locator(".evaluation-record")).to_have_count(2)
    expect(preview).to_contain_text("10 pts per entry · up to 3 entries")
    expect(preview).to_contain_text("How points are worked out: 5 points, or 10 for a public demonstration.")
    shot(page, "forms-03-preview")

    # Both forms are listed as the head's; one is removed
    page.locator(".dashboard-sidebar").get_by_role("button", name="Evaluation forms").click()
    for name in (COPY, "Robotics lab evaluation"):
        expect(table.locator("tr", has_text=name)).to_contain_text(HEAD[0])
    table.get_by_role("button", name="Remove Robotics lab evaluation").click()
    page.get_by_role("dialog").get_by_role("button", name="Remove form").click()
    expect(table.locator("tr", has_text="Robotics lab evaluation")).to_have_count(0)
    expect(page.locator(".save-status")).to_contain_text("Robotics lab evaluation was removed.")


def test_admins_see_every_coordinators_forms(admin_page: Page):
    admin_page.goto("/admin/evaluation-forms")
    expect(admin_page.get_by_role("heading", name="Forms in this organization")).to_be_visible()
    row = admin_page.locator(".form-list-table tr", has_text=COPY)
    expect(row).to_contain_text(HEAD[0])
    expect(row.get_by_role("button", name=f"Edit {COPY}")).to_be_visible()
