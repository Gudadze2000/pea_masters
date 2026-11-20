"""Adding and deactivating several people at once: the Admin downloads the template (with dropdown lists), fills the
list from a file, fixes the rows the page and the server point out, and saves everything at once. The file is read in
the browser; a formula in it is never run, and text that looks like a formula is refused. A Coordinator does the same
for Researchers in their own department."""

import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from playwright.sync_api import Page, expect

from tests.e2e.conftest import APP_URL

FACULTY = "Faculty of Import Studies"
DEPARTMENT = "Spreadsheet Science"


def api(page: Page, method: str, path: str, data=None):
    response = page.request.fetch(f"{APP_URL}/api/v1{path}", method=method, data=data)
    assert response.ok, response.text()
    return response.json()


def cell(ref: str, value) -> str:
    """A text cell, or ("formula", cached value) for a formula cell with the value Excel saved for it."""
    if isinstance(value, tuple):
        formula, cached = value
        return f'<c r="{ref}" t="str"><f>{escape(formula)}</f><v>{escape(cached)}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'


def write_xlsx(path: Path, rows: list[list]) -> Path:
    """A minimal .xlsx with one sheet, written by hand so the test needs no Excel library."""
    sheet_rows = "".join(
        f'<row r="{r}">' + "".join(cell(f"{'ABCDEF'[c]}{r}", v) for c, v in enumerate(values) if v != "") + "</row>"
        for r, values in enumerate(rows, start=1))
    parts = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',  # noqa: E501
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',  # noqa: E501
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="People" sheetId="1" r:id="rId1"/></sheets></workbook>',  # noqa: E501
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',  # noqa: E501
        "xl/worksheets/sheet1.xml": f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{sheet_rows}</sheetData></worksheet>',
    }
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in parts.items():
            archive.writestr(name, content)
    return path


def template_xml(page: Page, tmp_path: Path) -> dict[str, str]:
    """Downloads the template and returns its XML files by name."""
    with page.expect_download() as download:
        page.get_by_role("button", name="Download template").click()
    assert download.value.suggested_filename == "PEA people template.xlsx"
    path = tmp_path / f"template-{len(list(tmp_path.iterdir()))}.xlsx"
    download.value.save_as(path)
    with zipfile.ZipFile(path) as archive:
        return {name: archive.read(name).decode("utf-8") for name in archive.namelist() if name.endswith(".xml")}


def test_admin_registers_and_deactivates_a_list_from_excel(admin_page: Page, organization, shot, tmp_path):
    page = admin_page
    org = organization["org_id"]
    faculty = api(page, "POST", f"/orgs/{org}/units", {"kind": "faculty", "name_en": FACULTY})
    api(page, "POST", f"/orgs/{org}/units", {"kind": "department", "name_en": DEPARTMENT,
                                             "name_ka": "ცხრილების მეცნიერება", "parent_id": faculty["id"]})
    for email, name in (("already.here@iliauni.edu.ge", "Already Here"),
                        ("leaving.soon@iliauni.edu.ge", "Leaving Soon")):
        api(page, "POST", f"/orgs/{org}/people", {"email": email, "display_name": name, "roles": ["member"]})

    # 1. From People, "Add several" opens the list page
    page.goto("/admin/people")
    page.get_by_role("button", name="Add several").click()
    expect(page).to_have_url(re.compile("/admin/people/import"))
    expect(page.get_by_role("heading", name="Add several people", level=1)).to_be_visible()

    # 2. The template is made in the browser: the columns (name marked optional), how to fill them in, the structure,
    #    and dropdown lists: faculties and departments that exist, the roles an Admin may give, and X to deactivate
    files = template_xml(page, tmp_path)
    text = "".join(files.values())
    for expected in ("People", "How to fill in", "Structure", "name (optional)", "deactivate", DEPARTMENT,
                     "ცხრილების მეცნიერება"):
        assert expected in text
    people_sheet = files["xl/worksheets/sheet1.xml"]
    pattern = r'<dataValidation [^>]*sqref="([A-F])2:\1(\d+)"><formula1>([^<]*)</formula1>'
    validations = re.findall(pattern, people_sheet)
    by_column = {column: formula for column, _, formula in validations}
    assert {last for _, last, _ in validations} == {"1001"}
    assert by_column["C"].startswith("Structure!$F$2:$F$") and by_column["D"].startswith("Structure!$G$2:$G$")
    assert "Admin" in by_column["E"] and "Coordinator" in by_column["E"]
    assert by_column["F"] == "&quot;X&quot;"
    assert 'prompt="Enter X to deactivate' in people_sheet
    # Excel refuses a sheet whose parts are out of order: the lists come after the cells
    assert people_sheet.index("</sheetData>") < people_sheet.index("<dataValidations")

    # 3. Fills the list from a file: a Georgian department name, a formula (its saved value is used, never run),
    #    text that looks like a formula, someone to deactivate (X), and rows with mistakes
    file = write_xlsx(tmp_path / "people.xlsx", [
        ["email", "name (optional)", "faculty", "department", "role", "deactivate"],
        ["nino.beridze@iliauni.edu.ge", "", FACULTY, DEPARTMENT, "Researcher", ""],                         # row 2
        ["tamar.head@iliauni.edu.ge", "Tamar Head", "", "ცხრილების მეცნიერება", "Coordinator + Researcher", ""],
        ["already.here@iliauni.edu.ge", "", "", DEPARTMENT, "", ""],                                           # row 4
        ["giorgi.formula@iliauni.edu.ge", ('CONCATENATE("Giorgi"," Formula")', "Giorgi Formula"), "", DEPARTMENT, "",
         ""],
        ["levan.text@iliauni.edu.ge", '=HYPERLINK("http://example.com","click")', "", DEPARTMENT, "", ""],    # row 6
        ["ana.lost@iliauni.edu.ge", "", "", "Astrobiology Nowhere", "", ""],                                  # row 7
        ["dean.role@iliauni.edu.ge", "", "", DEPARTMENT, "Dean", ""],                                         # row 8
        ["outside.person@gmail.com", "Outside Person", "", "", "", ""],                                       # row 9
        ["leaving.soon@iliauni.edu.ge", "", "", "", "", "X"],                                                 # row 10
        ["maybe.leaving@iliauni.edu.ge", "Maybe Leaving", "", DEPARTMENT, "", "yes"],                          # row 11
    ])
    page.locator("input[type=file]").set_input_files(file)
    expect(page.get_by_role("status").filter(has_text="Added 10 rows from people.xlsx")).to_be_visible()
    expect(page.get_by_label("Department, Excel row 3")).to_have_value(re.compile(".+"))  # matched by its Georgian name
    expect(page.get_by_label("Name (optional), Excel row 5")).to_have_value("Giorgi Formula")
    already = "Already registered: Already Here. To deactivate them, tick Deactivate."
    expect(page.get_by_text(already)).to_be_visible()
    expect(page.get_by_text("A name can't start with =, +, - or @.")).to_be_visible()
    expect(page.get_by_text("No department called “Astrobiology Nowhere”. Choose one.")).to_be_visible()
    expect(page.get_by_text("Unknown role: “dean”.")).to_be_visible()
    expect(page.get_by_label("Deactivate, Excel row 10")).to_be_checked()
    expect(page.get_by_text("Will be deactivated: Leaving Soon.")).to_be_visible()
    expect(page.get_by_text("Enter X or leave it empty, not “yes”.")).to_be_visible()
    expect(page.get_by_text("9 to register, 1 to deactivate")).to_be_visible()
    expect(page.get_by_text("5 rows need fixing")).to_be_visible()
    shot(page, "import-1-from-excel")

    # 4. Saving is refused until the rows are fixed; only those rows are shown
    page.get_by_role("button", name="Register 9 and deactivate 1").click()
    expect(page.get_by_role("alert")).to_contain_text("5 rows need fixing first")
    expect(page.get_by_label("Email, Excel row 2")).to_be_hidden()

    page.get_by_role("button", name="Remove Excel row 4").click()
    page.get_by_label("Name (optional), Excel row 6").fill("Levan Text")
    page.get_by_label("Department, Excel row 7").select_option(label=DEPARTMENT)
    page.get_by_label("Roles, Excel row 8").get_by_role("checkbox", name="Researcher").click()
    # "yes" isn't X: ticking clears it (deactivate), unticking registers them after all
    page.get_by_label("Deactivate, Excel row 11").click()
    page.get_by_label("Deactivate, Excel row 11").click()
    expect(page.get_by_text("No rows need fixing.")).to_be_visible()

    # 5. The server checks too: the gmail address isn't the university's. Nothing is saved yet.
    page.get_by_label("Show only rows that need fixing").click()
    page.get_by_role("button", name="Register 8 and deactivate 1").click()
    expect(page.get_by_role("alert")).to_contain_text("The server found 1 row to fix. Nothing has been saved.")
    expect(page.get_by_text("Use an address from the organization's domain (iliauni.edu.ge).")).to_be_visible()
    shot(page, "import-2-server-check")
    page.get_by_role("button", name="Remove Excel row 9").click()

    # 6. Everything is fine: confirm, and all of it is saved at once
    page.get_by_label("Show only rows that need fixing").click()
    page.get_by_role("button", name="Register 7 and deactivate 1").click()
    dialog = page.get_by_role("alertdialog")
    expect(dialog).to_contain_text("Register 7 and deactivate 1?")
    expect(dialog).to_contain_text("signed out at once")
    dialog.get_by_role("button", name="Save").click()
    expect(page.get_by_role("heading", name="7 people were registered, 1 person was deactivated")).to_be_visible()
    shot(page, "import-3-done")

    page.get_by_role("button", name="Back to People").click()
    expect(page).to_have_url(re.compile("/admin/people$"))
    people = page.locator("tbody tr")
    expect(people.filter(has_text="nino.beridze@iliauni.edu.ge")).to_contain_text("Nino Beridze")  # from the email
    expect(people.filter(has_text="nino.beridze@iliauni.edu.ge")).to_contain_text(DEPARTMENT)
    expect(people.filter(has_text="tamar.head@iliauni.edu.ge")).to_contain_text(f"Coordinator: {DEPARTMENT}")
    expect(people.filter(has_text="giorgi.formula@iliauni.edu.ge")).to_contain_text("Giorgi Formula")
    expect(people.filter(has_text="dean.role@iliauni.edu.ge")).to_contain_text("Researcher")
    expect(people.filter(has_text="maybe.leaving@iliauni.edu.ge")).to_contain_text("Invited")
    expect(people.filter(has_text="already.here@iliauni.edu.ge")).to_contain_text("Already Here")  # unchanged
    expect(people.filter(has_text="leaving.soon@iliauni.edu.ge")).to_contain_text("Deactivated")
    expect(people.filter(has_text="outside.person@gmail.com")).to_have_count(0)


def test_deactivating_on_the_page(admin_page: Page, organization):
    page = admin_page
    org = organization["org_id"]
    api(page, "POST", f"/orgs/{org}/people", {"email": "typed.leaver@iliauni.edu.ge", "display_name": "Typed Leaver",
                                              "roles": ["member"]})
    page.goto("/admin/people/import")
    page.get_by_label("Email, line 1").fill("typed.leaver@iliauni.edu.ge")
    expect(page.get_by_text("Already registered: Typed Leaver. To deactivate them, tick Deactivate.")).to_be_visible()
    page.get_by_label("Deactivate, line 1").check()
    expect(page.get_by_label("Name (optional), line 1")).to_be_disabled()  # only the email is needed
    expect(page.get_by_text("Will be deactivated: Typed Leaver.")).to_be_visible()

    page.get_by_role("button", name="Add row").click()
    page.get_by_label("Email, line 2").fill("e2e.admin@iliauni.edu.ge")
    page.get_by_label("Deactivate, line 2").check()
    expect(page.get_by_text("You can't deactivate your own account.")).to_be_visible()
    page.get_by_role("button", name="Remove line 2").click()

    page.get_by_role("button", name="Deactivate 1 person").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Deactivate").click()
    expect(page.get_by_role("heading", name="1 person was deactivated")).to_be_visible()


def test_a_coordinator_adds_and_deactivates_their_own_researchers(admin_page: Page, google_sign_in, organization,
                                                                   shot, tmp_path):
    org = organization["org_id"]
    faculty = api(admin_page, "POST", f"/orgs/{org}/units", {"kind": "faculty", "name_en": "Faculty of Coordination"})
    own = api(admin_page, "POST", f"/orgs/{org}/units", {"kind": "department", "name_en": "Own Department",
                                                          "parent_id": faculty["id"]})
    api(admin_page, "POST", f"/orgs/{org}/units", {"kind": "department", "name_en": "Other Department",
                                                    "parent_id": faculty["id"]})
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": "coord.inator@iliauni.edu.ge",
                                                    "display_name": "Coord Inator",
                                                    "roles": ["coordinator", "member"], "department_id": own["id"],
                                                    "coordinates_unit_id": own["id"]})
    api(admin_page, "POST", f"/orgs/{org}/people", {"email": "own.researcher@iliauni.edu.ge", "roles": ["member"],
                                                    "display_name": "Own Researcher", "department_id": own["id"]})
    page = google_sign_in("coord.inator@iliauni.edu.ge", "Coord Inator")

    page.goto("/admin/people")
    page.get_by_role("button", name="Add several").click()
    expect(page.get_by_text("Register Researchers in your department")).to_be_visible()
    # Coordinators register Researchers only: no role choice, and their department is filled in
    expect(page.get_by_role("columnheader", name="Role", exact=True)).to_be_visible()
    expect(page.get_by_label("Roles, line 1")).to_have_count(0)
    department = page.get_by_label("Department, line 1")
    expect(department).to_have_value(own["id"])
    expect(department.locator("option", has_text="Other Department")).to_have_count(0)

    # Their template offers only their department and the Researcher role
    people_sheet = template_xml(page, tmp_path)["xl/worksheets/sheet1.xml"]
    lists = people_sheet.split("<dataValidations")[1]
    assert "&quot;Researcher&quot;</formula1>" in lists and "Admin" not in lists

    page.get_by_label("Email, line 1").fill("new.researcher@iliauni.edu.ge")
    page.get_by_role("button", name="Add row").click()
    page.get_by_label("Email, line 2").fill("own.researcher@iliauni.edu.ge")
    page.get_by_label("Deactivate, line 2").check()
    page.get_by_role("button", name="Add row").click()
    page.get_by_label("Email, line 3").fill("e2e.admin@iliauni.edu.ge")
    page.get_by_label("Deactivate, line 3").check()
    expect(page.get_by_text("Nobody with this email is registered in your department.")).to_be_visible()
    shot(page, "import-4-coordinator")
    page.get_by_role("button", name="Remove line 3").click()

    page.get_by_role("button", name="Register 1 and deactivate 1").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Save").click()
    expect(page.get_by_role("heading", name="1 person was registered, 1 person was deactivated")).to_be_visible()


def test_leaving_with_an_unsaved_list_asks_first(admin_page: Page):
    page = admin_page
    page.goto("/admin/people/import")
    page.get_by_label("Email, line 1").fill("someone.new@iliauni.edu.ge")
    page.get_by_role("button", name="People", exact=True).first.click()
    dialog = page.get_by_role("alertdialog")
    expect(dialog).to_contain_text("Leave without saving?")
    dialog.get_by_role("button", name="Stay on this page").click()
    expect(page.get_by_label("Email, line 1")).to_have_value("someone.new@iliauni.edu.ge")


def test_researchers_cant_open_the_list_page(admin_page: Page, google_sign_in, organization):
    api(admin_page, "POST", f"/orgs/{organization['org_id']}/people",
        {"email": "not.staff.import@iliauni.edu.ge", "display_name": "Not Staff", "roles": ["member"]})
    page = google_sign_in("not.staff.import@iliauni.edu.ge", "Not Staff")
    page.goto("/admin/people/import")
    expect(page).to_have_url(re.compile("/home$"))
