"""An Admin registers someone on the People page; that person signs in, gets a role, and is deactivated."""

import re

from playwright.sync_api import Page, expect

EMAIL = "nika.lomidze@iliauni.edu.ge"
NAME = "Nika Lomidze"
DEPARTMENT = "Department of Physics"


def row(page: Page, text: str):
    return page.locator("tbody tr", has_text=text)


def test_admin_registers_a_person_who_then_signs_in(admin_page: Page, google_sign_in, shot):
    page = admin_page

    # 1. The Admin opens People from the sidebar
    page.goto("/home")
    page.get_by_role("button", name="People").click()
    expect(page).to_have_url(re.compile("/admin/people$"))
    expect(page.get_by_role("heading", name="People", level=1)).to_be_visible()
    expect(row(page, "Test Admin")).to_be_visible()

    # 2. Adds a department
    page.get_by_role("tab", name=re.compile("^Departments")).click()
    page.get_by_role("button", name="Add department").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Name in English *").fill(DEPARTMENT)
    dialog.get_by_label("Name in Georgian").fill("ფიზიკის დეპარტამენტი")
    dialog.get_by_role("button", name="Add department").click()
    expect(page.get_by_role("status")).to_contain_text(f"{DEPARTMENT} was added.")
    expect(row(page, DEPARTMENT)).to_contain_text("No Coordinator")
    shot(page, "1-department-added")

    # 3. Registers a new person by email, in that department, as a Member
    page.get_by_role("tab", name=re.compile("^People")).click()
    page.get_by_role("button", name="Add person").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("University email *").fill(EMAIL)
    dialog.get_by_label("Full name *").fill(NAME)
    dialog.get_by_label("Department", exact=True).select_option(label=DEPARTMENT)
    expect(dialog.get_by_role("checkbox", name=re.compile("^Member"))).to_be_checked()
    shot(page, "2-add-person-form")
    dialog.get_by_role("button", name="Add person").click()

    # 4. They show up in the table, invited until their first sign-in
    expect(page.get_by_role("status")).to_contain_text(f"{NAME} was registered.")
    person = row(page, NAME)
    expect(person).to_contain_text(EMAIL)
    expect(person).to_contain_text(DEPARTMENT)
    expect(person).to_contain_text("Member")
    expect(person).to_contain_text("Invited")
    expect(person).to_contain_text("Never")
    shot(page, "3-person-registered")

    # 5. They sign in with Google for the first time
    nika = google_sign_in(EMAIL, NAME)
    nika.goto("/home")
    expect(nika.get_by_text("ADMINISTRATION")).to_have_count(0)  # Members don't get the People page
    nika.goto("/admin/people")
    expect(nika.get_by_text("This page is for Admins and Coordinators")).to_be_visible()

    page.reload()
    expect(row(page, NAME)).to_contain_text("Active")
    expect(row(page, NAME)).not_to_contain_text("Never")

    # 6. The Admin makes them the department's Coordinator
    page.get_by_role("button", name=f"Edit {NAME}").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_role("checkbox", name=re.compile("^Coordinator")).check()
    dialog.get_by_label("Coordinates department *").select_option(label=DEPARTMENT)
    dialog.get_by_role("button", name="Save changes").click()
    expect(row(page, NAME)).to_contain_text(f"Coordinator: {DEPARTMENT}")
    shot(page, "4-made-coordinator")

    # ...so they now see their department's Members, read-only
    nika.goto("/home")
    nika.get_by_role("button", name="People").click()
    expect(nika.get_by_text(f"Members of {DEPARTMENT}.")).to_be_visible()
    expect(row(nika, NAME)).to_be_visible()
    expect(row(nika, "Test Admin")).to_have_count(0)  # not in Physics
    expect(nika.get_by_role("button", name="Add person")).to_have_count(0)
    shot(nika, "5-coordinator-view")

    # 7. The Admin deactivates them; they're signed out at once
    page.get_by_role("button", name=f"Deactivate {NAME}").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Reason").fill("End-to-end test")
    dialog.get_by_role("button", name="Deactivate").click()
    expect(row(page, NAME)).to_contain_text("Deactivated")
    expect(row(page, NAME)).not_to_contain_text("Coordinator")  # stops coordinating
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
    dialog.get_by_label("Full name *").fill("Someone")
    dialog.get_by_role("button", name="Add person").click()
    expect(dialog.get_by_role("alert")).to_contain_text("Use an address from the organization's domain")
