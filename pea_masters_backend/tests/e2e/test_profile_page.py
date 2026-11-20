"""General information end to end: an Admin sets up a position, gives themselves a department and position, then
writes a biography and uploads a photo, which are saved on the server and shown across the app."""

import re

from PIL import Image
from playwright.sync_api import Page, expect

from tests.e2e.conftest import APP_URL

FACULTY = "School of Natural Sciences and Medicine"
DEPARTMENT = "Molecular Biology"
POSITION = "Associate Professor"


def api(page: Page, method: str, path: str, data=None):
    response = page.request.fetch(f"{APP_URL}/api/v1{path}", method=method, data=data)
    assert response.ok, response.text()
    return response.json()


def test_profile_is_saved_on_the_server_and_shown_everywhere(admin_page: Page, organization, shot, tmp_path):
    page = admin_page
    org = organization["org_id"]
    faculty = api(page, "POST", f"/orgs/{org}/units", {"kind": "faculty", "name_en": FACULTY})["id"]
    api(page, "POST", f"/orgs/{org}/units", {"kind": "department", "name_en": DEPARTMENT, "parent_id": faculty})

    # 1. The Admin adds an academic position in the Structure tab...
    page.goto("/admin/people")
    page.get_by_role("tab", name="Structure").click()
    page.get_by_role("button", name="Add position").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("Name in English *").fill(POSITION)
    dialog.get_by_role("button", name="Add position").click()
    expect(page.locator("tbody tr", has_text=POSITION)).to_contain_text("0")

    # ...and gives themselves a department and that position
    page.get_by_role("tab", name=re.compile("^People")).click()
    page.get_by_role("button", name="Edit Test Admin").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_label("Academic position")).to_be_disabled()  # needs a department first
    dialog.get_by_label("Department", exact=True).select_option(label=DEPARTMENT)
    dialog.get_by_label("Academic position").select_option(label=POSITION)
    dialog.get_by_role("button", name="Save changes").click()
    expect(page.locator("tbody tr", has_text="Test Admin")).to_contain_text(POSITION)

    # 2. The profile header shows the real details, not sample data (the old address leads to the one page)
    page.goto("/profile/general")
    expect(page).to_have_url(re.compile(r"/profile#general$"))
    header = page.get_by_role("region", name="Your details")
    for text in ("Test Admin", "e2e.admin@iliauni.edu.ge", FACULTY, DEPARTMENT, POSITION):
        expect(header).to_contain_text(text)
    expect(page.get_by_text("Nino Beridze")).to_have_count(0)

    # 3. Writes a biography and uploads a photo, then saves
    editor = page.get_by_role("textbox", name="Biography (English)")
    editor.click()
    page.keyboard.type("I study the molecular genetics of Caucasian wheat.")
    photo = tmp_path / "portrait.png"
    Image.new("RGB", (640, 480), (140, 36, 51)).save(photo)
    page.locator('.photo-row input[type="file"]').set_input_files(photo)
    expect(page.get_by_role("img", name="Your profile photo")).to_be_visible()
    page.get_by_role("button", name="Save changes").click()
    expect(page.get_by_role("status").filter(has_text="Changes saved")).to_be_visible()
    shot(page, "7-general-information")

    # 4. After a reload everything comes back from the server
    page.reload()
    biography = page.get_by_role("textbox", name="Biography (English)")
    expect(biography).to_contain_text("molecular genetics of Caucasian wheat")
    expect(page.get_by_role("img", name="Your profile photo")).to_have_attribute("src", re.compile(r"^/api/v1/files/"))
    expect(page.locator(".dashboard-avatar img")).to_have_attribute("src", re.compile(r"^/api/v1/files/"))  # sidebar

    # 5. Settings → Account shows the same person
    page.goto("/settings/account")
    account = page.locator(".settings-readonly-grid")
    for text in ("Test Admin", DEPARTMENT, POSITION):
        expect(account).to_contain_text(text)
    shot(page, "8-settings-account")


def test_profile_is_one_page_with_contents(admin_page: Page, shot, tmp_path):
    page = admin_page
    page.goto("/home")
    sidebar = page.locator(".dashboard-sidebar")
    sidebar.get_by_role("button", name="My profile", exact=True).click()
    expect(page).to_have_url(re.compile(r"/profile$"))
    expect(sidebar.get_by_text("Professional & qualifications")).to_have_count(0)  # no sub-menu any more

    # A new profile has no sample entries: the fixed parts, and every section waiting in "Add to your profile"
    contents = page.get_by_role("navigation", name="On this page")
    for label in ("General information", "Teaching", "Research"):
        # "Research" but not "Research outputs", which is there too once the outputs have loaded
        expect(contents.get_by_role("button", name=re.compile(rf"{label}(?! outputs)"))).to_be_visible()
    expect(contents.get_by_role("button", name=re.compile(r"^Add \d+ more sections"))).to_be_visible()
    add_more = page.get_by_role("region", name="Add to your profile")
    expect(add_more.get_by_role("button", name="Awards")).to_be_visible()

    # An award with its certificate is saved on the server: still there after a reload, with the document attached
    add_more.get_by_role("button", name="Awards").click()
    awards = page.get_by_role("region", name=re.compile("^Awards"))
    awards.get_by_label(re.compile("^Award title")).fill("Young Scientist Award")
    awards.get_by_label(re.compile("^Award body")).fill("Shota Rustaveli National Science Foundation")
    awards.get_by_label(re.compile("^Award date")).fill("2023-06-15")
    certificate = tmp_path / "certificate.pdf"
    certificate.write_bytes(b"%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n")
    awards.locator("input[type=file]").set_input_files(certificate)
    expect(awards.get_by_role("link", name="certificate.pdf")).to_be_visible()  # uploaded straight away
    awards.get_by_role("button", name="Save entry").click()
    expect(page.locator(".profile-notice")).to_contain_text("Award saved.")

    page.reload()
    card = page.locator("#awards .entry-card", has_text="Young Scientist Award")
    expect(card).to_contain_text("1 document")
    expect(card.locator(".status-badge")).to_have_count(0)  # the profile isn't reviewed: saved means on it

    # ...so it's on the public profile straight away
    page.get_by_role("button", name="Preview public profile").click()
    expect(page.get_by_role("dialog")).to_contain_text("Young Scientist Award")
    page.get_by_role("dialog").get_by_role("button", name="Back to editing").click()
    shot(page, "9-profile-one-page")

    # The contents jump to a part of the page
    contents.get_by_role("button", name=re.compile("^Awards")).click()
    expect(page).to_have_url(re.compile(r"#awards$"))
    expect(page.get_by_role("heading", name=re.compile("^Awards"), level=2)).to_be_in_viewport()

    # The Languages table is saved as a whole, also on the server
    add_more.get_by_role("button", name="Languages").click()
    languages = page.locator("#languages")
    languages.get_by_label("Language, row 1").select_option("English")
    for skill in ("Read", "Write", "Speak"):
        languages.get_by_label(f"{skill} level for English").select_option(index=5)
    languages.get_by_role("button", name="Save").click()
    expect(languages.get_by_role("status")).to_contain_text("Languages saved")
    page.reload()
    expect(page.locator("#languages").get_by_label("Language, row 1")).to_have_value("English")

    # Empty sections wait in "Add to your profile" until chosen
    expect(page.get_by_role("heading", name=re.compile("^Creative activities"), level=2)).to_have_count(0)
    add_more.get_by_role("button", name="Creative activities").click()
    creative = page.get_by_role("region", name=re.compile("^Creative activities"))
    expect(creative.get_by_role("button", name="Save entry")).to_be_visible()  # opens straight into a new entry
    creative.get_by_role("button", name="Cancel", exact=True).click()
    expect(page.get_by_role("heading", name=re.compile("^Creative activities"), level=2)).to_have_count(0)
    expect(add_more.get_by_role("button", name="Creative activities")).to_be_visible()

    # Old addresses still work: they lead to the matching part, with the editor open for "new"
    page.goto("/profile/qualifications/patents")
    expect(page).to_have_url(re.compile(r"/profile#patents$"))
    page.goto("/profile/qualifications/awards/new")
    awards = page.get_by_role("region", name=re.compile("^Awards"))
    expect(awards.get_by_role("button", name="Save entry")).to_be_visible()


def test_a_cv_kept_in_the_browser_moves_to_the_server(admin_page: Page):
    """CVs used to live in the browser and start from a sample CV. Opening the CV builder moves the browser copy to the
    server once, without the sample items, and forgets the browser copy. Its publications go to the profile's research
    outputs."""
    page = admin_page
    page.goto("/home")
    old_cv = {"data": {"version": 1, "visibility": "private", "personal": {
        "headline": "Associate Professor of Biology", "phone": "",
        "summary": "I study how plants adapt to drought and climate change, combining molecular genetics..."},
        "publications": [
            {"id": "pub1", "type": "Journal article", "status": "Published", "title": "Allelic variation (sample)"},
            {"id": "mine", "type": "Book", "status": "Published", "title": "My own book", "authors": "Admin T"}],
        "talks": [{"id": "talk1", "title": "Mining landraces (sample)", "type": "Keynote"}]}, "savedAt": 1}
    page.evaluate("cv => localStorage.setItem('pea.cv-builder.v1', JSON.stringify(cv))", old_cv)

    page.get_by_role("button", name="CV builder").click()
    expect(page.get_by_role("status").filter(has_text="from this browser")).to_contain_text(
        "Your CV from this browser is now saved on the server.")
    expect(page.locator(".cv-paper")).to_contain_text("My own book")
    expect(page.locator(".cv-paper")).not_to_contain_text("(sample)")
    expect(page.get_by_role("textbox", name="Research statement")).to_have_value("")
    assert page.evaluate("localStorage.getItem('pea.cv-builder.v1')") is None

    page.reload()
    expect(page.locator(".cv-paper")).to_contain_text("My own book")  # it's on the server now
    # Its publication went to My profile → Research outputs, where CVs now take publications from
    page.goto("/profile#outputs")
    expect(page.locator("#outputs")).to_contain_text("My own book")
    expect(page.locator("#outputs")).not_to_contain_text("(sample)")


def test_research_saved_on_the_profile_appears_on_the_cv(admin_page: Page):
    """Projects and research interests saved under My profile → Research are kept on the server and show on the CV;
    the CV can keep its own interests instead."""
    page = admin_page
    page.goto("/profile")
    research = page.locator("#research")
    research.get_by_role("button", name="Add project").click()
    research.get_by_label(re.compile("^Project title")).fill("Svaneti seed survey")
    research.get_by_label(re.compile("^Donor")).fill("GNSF")
    research.get_by_label(re.compile("^Type")).select_option("Local")
    research.get_by_label(re.compile("^Start year")).select_option("2025")
    research.get_by_label(re.compile("^Your role")).select_option("PI")
    research.get_by_role("button", name="Add project").last.click()
    research.get_by_label("New research interest").fill("Mountain agriculture")
    research.get_by_label("New research interest").press("Enter")
    research.get_by_role("button", name="Save").click()
    expect(research.get_by_role("status")).to_contain_text("Changes saved")
    page.reload()
    expect(page.locator("#research")).to_contain_text("Svaneti seed survey")  # saved on the server

    page.get_by_role("button", name="CV builder").click()
    cv = page.locator(".cv-paper")
    expect(cv).to_contain_text("Svaneti seed survey")
    expect(cv).to_contain_text("Mountain agriculture")

    # A separate list for the CV starts from the profile's and then goes its own way
    page.get_by_role("switch", name="Use the interests from My profile").click()
    page.get_by_label("New research interest").fill("Only on my CV")
    page.get_by_label("New research interest").press("Enter")
    expect(cv).to_contain_text("Only on my CV")
    expect(cv).to_contain_text("Mountain agriculture")

    # The CV is saved with the Save button; leaving with unsaved changes asks first
    statement = "I map drought-response genes in Caucasian wheat."
    page.get_by_role("textbox", name="Research statement").fill(statement)
    expect(page.locator(".cv-save-status")).to_have_text("Unsaved changes")
    page.get_by_role("button", name="My profile", exact=True).click()
    leave = page.get_by_role("alertdialog")
    expect(leave).to_contain_text("Leave without saving?")
    leave.get_by_role("button", name="Stay on this page").click()
    expect(page).to_have_url(re.compile(r"/cv-builder$"))
    expect(page.get_by_role("textbox", name="Research statement")).to_have_value(statement)  # nothing lost

    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".cv-save-status")).to_contain_text("Saved ·")
    page.reload()
    expect(page.get_by_role("textbox", name="Research statement")).to_have_value(statement)
    expect(page.locator(".cv-paper")).to_contain_text("Only on my CV")


def test_video_lectures_play_on_the_profile(admin_page: Page, shot):
    """Video lectures link videos from around the web; embeddable ones play on the page once the viewer presses play
    (nothing loads from the video site before that), others link out."""
    page = admin_page
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/profile")
    page.locator("#add-more").get_by_role("button", name="Video lectures").click()
    section = page.locator("#videos")
    section.get_by_label(re.compile("^Title")).fill("Drought genes in wheat: an introduction")
    section.get_by_label(re.compile("^Video link")).fill("youtu.be/dQw4w9WgXcQ?t=90")
    section.get_by_label(re.compile("^Type")).select_option("Lecture")
    section.get_by_role("button", name="Save entry").click()

    card = section.locator(".entry-card", has_text="Drought genes in wheat")
    expect(card.get_by_role("link", name="Open on YouTube")).to_have_attribute("href", "https://youtu.be/dQw4w9WgXcQ?t=90")
    expect(card.locator("iframe")).to_have_count(0)  # nothing from YouTube until play
    card.scroll_into_view_if_needed()
    shot(page, "profile-02-video-before-play")
    card.get_by_role("button", name="Play “Drought genes in wheat: an introduction”").click()
    player = card.locator("iframe")
    expect(player).to_have_attribute(
        "src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90&autoplay=1")
    expect(player).to_have_attribute("title", "Drought genes in wheat: an introduction (YouTube)")

    # A site that can't be embedded links out instead
    section.get_by_role("button", name="Add video lecture").click()
    section.get_by_label(re.compile("^Title")).fill("Genetics MOOC")
    section.get_by_label(re.compile("^Video link")).fill("https://www.coursera.org/learn/genetics")
    section.get_by_role("button", name="Save entry").click()
    other = section.locator(".entry-card", has_text="Genetics MOOC")
    expect(other.get_by_role("link", name="Watch on coursera.org")).to_be_visible()
    expect(other.get_by_role("button", name=re.compile("^Play"))).to_have_count(0)

    assert not errors, errors
