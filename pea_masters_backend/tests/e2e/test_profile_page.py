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


def test_profile_is_one_page_with_contents(admin_page: Page, shot):
    page = admin_page
    page.goto("/home")
    sidebar = page.locator(".dashboard-sidebar")
    sidebar.get_by_role("button", name="My profile", exact=True).click()
    expect(page).to_have_url(re.compile(r"/profile$"))
    expect(sidebar.get_by_text("Professional & qualifications")).to_have_count(0)  # no sub-menu any more

    # Every part is on one page, listed in the contents
    contents = page.get_by_role("navigation", name="On this page")
    for label in ("General information", "Education", "Employment", "Languages", "Awards", "Teaching", "Research"):
        expect(contents.get_by_role("button", name=re.compile(label))).to_be_visible()
    shot(page, "9-profile-one-page")

    # The contents jump to a part of the page
    contents.get_by_role("button", name=re.compile("^Awards")).click()
    expect(page).to_have_url(re.compile(r"#awards$"))
    expect(page.get_by_role("heading", name=re.compile("^Awards"), level=2)).to_be_in_viewport()

    # Empty sections wait in "Add to your profile" until chosen
    add_more = page.get_by_role("region", name="Add to your profile")
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


def test_research_saved_on_the_profile_appears_on_the_cv(admin_page: Page):
    """Projects and research interests saved under My profile → Research show on the CV; the CV can keep its own
    interests instead. (Research is kept in the browser for now, so the CV is opened without reloading the page.)"""
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
