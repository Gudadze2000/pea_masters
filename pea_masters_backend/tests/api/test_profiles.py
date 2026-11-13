import io

import pytest
from PIL import Image
from sqlalchemy import select

from app.models import Affiliation, File, Organization, OrganizationMembership, RoleAssignment, User
from tests.api.helpers import add_department, add_faculty, as_person, error_code, register

ME = "/api/v1/me/profile"


def image_bytes(width=600, height=400, kind="PNG", color=(140, 36, 51)):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, kind)
    return buffer.getvalue()


def upload(client, data, name="me.png", content_type="image/png"):
    return client.put(f"{ME}/photo", files={"photo": (name, data, content_type)})


@pytest.fixture
def researcher(signed_in, make_user):
    return signed_in(make_user(email="nino.beridze@iliauni.edu.ge", status="active"))


# --- reading ------------------------------------------------------------------------------------

def test_new_profile_is_empty_with_institutional_details(as_admin, signed_in, base, db):
    faculty = add_faculty(as_admin, base)
    cs = add_department(as_admin, base, "Computer Science", faculty)
    professor = as_admin.post(f"{base}/positions", json={"name_en": "Associate Professor"}).json()["id"]
    person = register(as_admin, base, "giorgi.kekelidze.3@iliauni.edu.ge", department_id=cs,
                      name="Giorgi Kekelidze").json()
    as_admin.patch(f"{base}/people/{person['id']}", json={"position_id": professor})

    profile = as_person(signed_in, db, person).get(ME).json()
    assert (profile["display_name"], profile["email"]) == ("Giorgi Kekelidze", "giorgi.kekelidze.3@iliauni.edu.ge")
    assert profile["biography"] == {} and profile["photo_url"] is None
    [place] = profile["affiliations"]
    assert place["organization"]["name"]["en"] == "Ilia State University"
    assert place["faculty"]["name"]["en"] == "School of Business, Technology and Education"
    assert place["department"]["name"]["en"] == "Computer Science"
    assert place["position"]["name"]["en"] == "Associate Professor"


def test_profile_needs_sign_in(client):
    assert client.get(ME).status_code == 401


# --- biography ----------------------------------------------------------------------------------

def test_biography_is_saved_per_language_and_cleaned(researcher, db):
    dirty = ('<p onclick="steal()">I study <b>wheat</b> <i>genetics</i>.</p><script>alert(1)</script>'
             '<ul><li>one</li></ul><a href="javascript:alert(1)">bad</a> <a href="https://iliauni.edu.ge">ISU</a>'
             '<img src="data:image/png;base64,iVBORw0KGgo=" onerror="x()">'
             '<img src="data:text/html;base64,PHNjcmlwdD4=">')
    saved = researcher.put(ME, json={"biography": {"en": dirty, "ka": "<p>ვსწავლობ ხორბალს.</p>"}}).json()
    english = saved["biography"]["en"]
    assert "<b>wheat</b>" in english and "<i>genetics</i>" in english and "<li>one</li>" in english
    for removed in ("onclick", "<script", "javascript:", "onerror", "data:text/html"):
        assert removed not in english
    assert 'href="https://iliauni.edu.ge"' in english and 'rel="noopener noreferrer nofollow"' in english
    assert 'src="data:image/png;base64,iVBORw0KGgo="' in english  # inline images in the editor are kept
    assert saved["biography"]["ka"] == "<p>ვსწავლობ ხორბალს.</p>"

    # Saving one language leaves the other alone
    researcher.put(ME, json={"biography": {"ka": "<p>ახალი.</p>"}})
    assert researcher.get(ME).json()["biography"]["en"] == english


def test_biography_limits(researcher):
    too_long = researcher.put(ME, json={"biography": {"en": "<p>" + "a" * 3001 + "</p>"}})
    assert error_code(too_long) == "biography_too_long"
    assert researcher.put(ME, json={"biography": {"en": "<p>" + "a" * 3000 + "</p>"}}).status_code == 200
    assert error_code(researcher.put(ME, json={"biography": {"de": "<p>Hallo</p>"}})) == "unknown_language"


# --- photo --------------------------------------------------------------------------------------

def test_photo_is_checked_cropped_and_served(researcher, db):
    response = upload(researcher, image_bytes(800, 600))
    assert response.status_code == 200, response.text
    url = response.json()["photo_url"]
    served = researcher.get(url)
    assert served.status_code == 200 and served.headers["content-type"] == "image/jpeg"
    with Image.open(io.BytesIO(served.content)) as photo:
        assert (photo.format, photo.size) == ("JPEG", (512, 512))  # square, small, re-encoded without metadata
    stored = db.scalar(select(File))
    assert stored.mime_type == "image/jpeg" and stored.original_name == "me.png"


def test_bad_photos_are_refused(researcher):
    assert error_code(upload(researcher, b"%PDF-1.7 not an image", "cv.pdf", "image/png")) == "not_an_image"
    assert error_code(upload(researcher, image_bytes(120, 120))) == "photo_too_small"
    gif = io.BytesIO()
    Image.new("RGB", (400, 400)).save(gif, "GIF")
    assert error_code(upload(researcher, gif.getvalue(), "a.gif", "image/gif")) == "not_an_image"
    too_big = upload(researcher, b"\x89PNG" + b"0" * (5 * 1024 * 1024))
    assert too_big.status_code == 413 and error_code(too_big) == "photo_too_large"


def test_replacing_and_removing_the_photo(researcher, db):
    first = upload(researcher, image_bytes()).json()["photo_url"]
    second = upload(researcher, image_bytes(color=(0, 0, 0))).json()["photo_url"]
    assert first != second
    assert researcher.get(first).status_code == 404  # the old one is retired
    assert researcher.delete(f"{ME}/photo").json()["photo_url"] is None
    assert researcher.get(second).status_code == 404
    assert len(db.scalars(select(File).where(File.deleted_at.is_not(None))).all()) == 2  # kept on record


def test_photos_are_visible_inside_the_organization_only(researcher, signed_in, make_user, db):
    url = upload(researcher, image_bytes()).json()["photo_url"]
    colleague = signed_in(make_user(email="colleague@iliauni.edu.ge", status="active"))
    assert colleague.get(url).status_code == 200

    other = Organization(slug="tsu", name={"en": "Other University"}, kind="university")
    db.add(other)
    db.flush()
    stranger = User(email="someone@tsu.ge", display_name="Stranger", status="active")
    db.add(stranger)
    db.flush()
    db.add(OrganizationMembership(user_id=stranger.id, organization_id=other.id))
    db.add(RoleAssignment(user_id=stranger.id, organization_id=other.id, role="member"))
    db.commit()
    assert signed_in(stranger).get(url).status_code == 404


# --- others' profiles ---------------------------------------------------------------------------

def test_admins_and_heads_see_profiles_within_their_reach(as_admin, signed_in, base, db):
    faculty = add_faculty(as_admin, base)
    cs = add_department(as_admin, base, "Computer Science", faculty)
    math = add_department(as_admin, base, "Mathematics", faculty)
    head = register(as_admin, base, "head@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs,
                    department_id=cs).json()
    student = register(as_admin, base, "cs@iliauni.edu.ge", department_id=cs).json()
    mathematician = register(as_admin, base, "math@iliauni.edu.ge", department_id=math).json()

    assert as_admin.get(f"{base}/people/{mathematician['id']}/profile").status_code == 200
    head_client = as_person(signed_in, db, head)
    assert head_client.get(f"{base}/people/{student['id']}/profile").status_code == 200
    assert head_client.get(f"{base}/people/{mathematician['id']}/profile").status_code == 403


# --- academic positions -------------------------------------------------------------------------

def test_positions_are_managed_by_admins(as_admin, signed_in, make_user, base):
    created = as_admin.post(f"{base}/positions", json={"name_en": "Professor", "name_ka": "პროფესორი"})
    assert created.status_code == 201
    assert error_code(as_admin.post(f"{base}/positions", json={"name_en": "professor"})) == "duplicate_position"
    renamed = as_admin.patch(f"{base}/positions/{created.json()['id']}", json={"name_en": "Full Professor"})
    assert renamed.json()["name"]["en"] == "Full Professor"

    researcher = signed_in(make_user(email="r@iliauni.edu.ge", status="active"))
    assert [p["name"]["en"] for p in researcher.get(f"{base}/positions").json()] == ["Full Professor"]
    assert researcher.post(f"{base}/positions", json={"name_en": "Dean"}).status_code == 403


def test_a_position_is_held_in_a_department_and_moves_with_the_person(as_admin, signed_in, base, db):
    faculty = add_faculty(as_admin, base)
    cs = add_department(as_admin, base, "Computer Science", faculty)
    math = add_department(as_admin, base, "Mathematics", faculty)
    professor = as_admin.post(f"{base}/positions", json={"name_en": "Professor"}).json()["id"]
    person = register(as_admin, base, "p@iliauni.edu.ge").json()
    url = f"{base}/people/{person['id']}"

    assert error_code(as_admin.patch(url, json={"position_id": professor})) == "position_needs_department"
    as_admin.patch(url, json={"department_id": cs})
    assert as_admin.patch(url, json={"position_id": professor}).json()["position"]["id"] == professor
    moved = as_admin.patch(url, json={"department_id": math}).json()
    assert (moved["department"]["id"], moved["position"]["id"]) == (math, professor)
    assert as_admin.get(f"{base}/positions").json()[0]["holder_count"] == 1
    # Every change ended the previous row instead of editing it
    rows = db.scalars(select(Affiliation).order_by(Affiliation.created_at)).all()
    assert [(str(r.unit_id), str(r.position_id) if r.position_id else None, r.ends_on is None) for r in rows] == [
        (cs, None, False), (cs, professor, False), (math, professor, True)]


def test_heads_of_department_cannot_set_positions(as_admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    professor = as_admin.post(f"{base}/positions", json={"name_en": "Professor"}).json()["id"]
    head = register(as_admin, base, "head@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs).json()
    researcher = register(as_admin, base, "r@iliauni.edu.ge", department_id=cs).json()
    c = as_person(signed_in, db, head)
    assert error_code(c.patch(f"{base}/people/{researcher['id']}", json={"position_id": professor})) == \
        "admins_set_positions"
    assert c.post(f"{base}/positions", json={"name_en": "Dean"}).status_code == 403
