"""Profile sections on the server (app/profile_entries.py): entries, the Languages table, supporting documents and
who may open them, Research and Teaching. Nothing on the profile is reviewed: what's saved is on it."""

import io

import pytest
from PIL import Image

from tests.api.helpers import add_department, as_person, error_code, register

ENTRIES = "/api/v1/me/profile/entries"
PDF = b"%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"

AWARD = {"title": "Young Scientist Award", "body": "GNSF", "date": "2023-06-15", "url": "gnsf.ge/awards"}


def png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), (1, 2, 3)).save(buffer, "PNG")
    return buffer.getvalue()


@pytest.fixture
def researcher(signed_in, make_user):
    return signed_in(make_user(email="nino.beridze@iliauni.edu.ge", status="active"))


def upload(client, data, name="certificate.pdf", content_type="application/pdf"):
    return client.post("/api/v1/me/documents", files={"file": (name, data, content_type)})


# --- entries -------------------------------------------------------------------------------------

def test_entries_are_saved_and_listed_per_section(researcher):
    created = researcher.post(ENTRIES, json={"section": "awards", "values": AWARD})
    assert created.status_code == 201
    award = created.json()
    assert award["values"]["url"] == "https://gnsf.ge/awards"  # https:// added
    assert "status" not in award  # no review: saved means on the profile
    video = {"title": "Lecture 1", "url": "https://youtu.be/dQw4w9WgXcQ"}
    assert researcher.post(ENTRIES, json={"section": "videos", "values": video}).status_code == 201

    listed = researcher.get(ENTRIES).json()
    assert set(listed) >= {"education", "awards", "languages", "videos", "other"}  # every section, even empty ones
    assert [e["values"]["title"] for e in listed["awards"]] == ["Young Scientist Award"]
    assert listed["videos"][0]["values"]["url"] == video["url"] and listed["education"] == []


@pytest.mark.parametrize("body, code", [
    ({"section": "awards", "values": {"title": "Only a title"}}, "missing_fields"),
    ({"section": "awards", "values": {"title": "  ", "body": "GNSF", "date": "2023-01-01"}}, "missing_fields"),
    ({"section": "secrets", "values": {"title": "x"}}, "unknown_section"),
    ({"section": "videos", "values": {"title": "x", "url": "javascript:alert(1)"}}, "invalid_url"),
    ({"section": "awards", "values": {**AWARD, "bad name!": "x"}}, "invalid_field"),
    ({"section": "other", "values": {"title": "x" * 5001}}, "value_too_long"),
])
def test_entries_are_checked(researcher, body, code):
    response = researcher.post(ENTRIES, json=body)
    assert response.status_code == 422 and error_code(response) == code


def test_entries_are_edited_in_place(researcher):
    award = researcher.post(ENTRIES, json={"section": "awards", "values": AWARD}).json()
    updated = researcher.put(f"{ENTRIES}/{award['id']}", json={"values": {**AWARD, "body": "SRNSF"}}).json()
    assert updated["id"] == award["id"] and updated["values"]["body"] == "SRNSF"
    assert researcher.get(ENTRIES).json()["awards"][0]["values"]["body"] == "SRNSF"


def test_entries_belong_to_their_owner(researcher, signed_in, make_user):
    award = researcher.post(ENTRIES, json={"section": "awards", "values": AWARD}).json()
    other = signed_in(make_user(email="other@iliauni.edu.ge", status="active"))
    assert other.get(ENTRIES).json()["awards"] == []
    assert other.put(f"{ENTRIES}/{award['id']}", json={"values": AWARD}).status_code == 404
    assert other.delete(f"{ENTRIES}/{award['id']}").status_code == 404
    assert researcher.delete(f"{ENTRIES}/{award['id']}").status_code == 204
    assert researcher.get(ENTRIES).json()["awards"] == []


def test_the_languages_table_is_saved_as_a_whole(researcher):
    english = {"language": "English", "read": "C1", "write": "C1", "speak": "B2"}
    german = {"language": "German", "read": "B1", "write": "A2", "speak": "A2"}
    first = researcher.put("/api/v1/me/profile/sections/languages", json={"entries": [
        {"values": english}, {"values": german}]}).json()
    assert [e["values"]["language"] for e in first] == ["English", "German"]

    by_name = {e["values"]["language"]: e["id"] for e in first}
    second = researcher.put("/api/v1/me/profile/sections/languages", json={"entries": [
        {"id": by_name["English"], "values": english},  # kept as it is
        {"id": by_name["German"], "values": {**german, "speak": "B1"}},  # changed
        {"values": {"language": "Russian", "read": "B2", "write": "B1", "speak": "B1"}},  # new
    ]}).json()
    by_name_now = {e["values"]["language"]: e for e in second}
    assert by_name_now["English"]["id"] == by_name["English"] and by_name_now["German"]["id"] == by_name["German"]
    assert by_name_now["German"]["values"]["speak"] == "B1" and "Russian" in by_name_now

    third = researcher.put("/api/v1/me/profile/sections/languages", json={"entries": [
        {"id": by_name["English"], "values": english}]}).json()
    assert [e["values"]["language"] for e in third] == ["English"]  # the others were removed
    assert error_code(researcher.put("/api/v1/me/profile/sections/awards", json={"entries": []})) == "not_a_table"


# --- documents -----------------------------------------------------------------------------------

def test_documents_are_uploaded_attached_and_checked(researcher):
    document = upload(researcher, PDF).json()
    assert (document["name"], document["type"], document["size"]) == ("certificate.pdf", "application/pdf", len(PDF))
    image = upload(researcher, png(), "scan.png", "image/png").json()

    award = researcher.post(ENTRIES, json={"section": "awards", "values": AWARD,
                                           "document_ids": [document["id"], image["id"]]}).json()
    assert [d["name"] for d in award["documents"]] == ["certificate.pdf", "scan.png"]
    assert researcher.get(document["url"]).content == PDF

    # The file's own bytes decide what it is, not its name
    disguised = upload(researcher, b"MZ\x90\x00 not a pdf", "virus.pdf")
    assert disguised.status_code == 422 and error_code(disguised) == "unsupported_document"
    big = upload(researcher, PDF + b"0" * (10 * 1024 * 1024))
    assert big.status_code == 413


def test_only_your_own_documents_can_be_attached(researcher, signed_in, make_user):
    other = signed_in(make_user(email="other@iliauni.edu.ge", status="active"))
    theirs = upload(other, PDF).json()
    response = researcher.post(ENTRIES, json={"section": "awards", "values": AWARD, "document_ids": [theirs["id"]]})
    assert error_code(response) == "unknown_document"


def test_documents_are_seen_by_their_owner_admins_and_head_of_department_only(as_admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    math = add_department(as_admin, base, "Mathematics")
    head = register(as_admin, base, "head@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs,
                    department_id=cs).json()
    other_head = register(as_admin, base, "mathhead@iliauni.edu.ge", roles=["coordinator", "member"],
                          coordinates=math, department_id=math).json()
    owner = register(as_admin, base, "owner@iliauni.edu.ge", department_id=cs).json()
    colleague = register(as_admin, base, "colleague@iliauni.edu.ge", department_id=cs).json()

    owner_client = as_person(signed_in, db, owner)
    url = upload(owner_client, PDF).json()["url"]
    assert owner_client.get(url).status_code == 200
    assert as_admin.get(url).status_code == 200  # Admin of the organization
    assert as_person(signed_in, db, head).get(url).status_code == 200  # their head of department
    assert as_person(signed_in, db, other_head).get(url).status_code == 404  # another department's head
    assert as_person(signed_in, db, colleague).get(url).status_code == 404  # a colleague

    # Photos are still visible across the organization
    photo = io.BytesIO()
    Image.new("RGB", (600, 600), (5, 6, 7)).save(photo, "PNG")
    profile = owner_client.put("/api/v1/me/profile/photo", files={"photo": ("me.png", photo.getvalue(), "image/png")})
    assert as_person(signed_in, db, colleague).get(profile.json()["photo_url"]).status_code == 200


# --- research and teaching -----------------------------------------------------------------------

PROJECT = {"id": "p1", "title": "GENDROUGHT", "donor": "Horizon Europe", "startYear": "2022", "endYear": "",
           "type": "International", "role": "PI"}


def test_research_and_teaching_are_saved(researcher):
    assert researcher.get("/api/v1/me/profile/research").json() == {
        "interests": [], "projects": [], "collaborations": [], "organisations": []}
    saved = researcher.put("/api/v1/me/profile/research", json={
        "interests": [" Genetics ", "Genetics", ""], "projects": [PROJECT],
        "collaborations": [{"id": "c1", "name": "Dr. K. Schulz", "institution": "Göttingen", "topic": "Wheat"}],
        "organisations": ["University of Göttingen"]}).json()
    assert saved["interests"] == ["Genetics"]  # trimmed, repeats and blanks dropped
    assert researcher.get("/api/v1/me/profile/research").json()["projects"] == [PROJECT]

    assert researcher.put("/api/v1/me/profile/teaching", json={"interests": ["Bioinformatics"]}).status_code == 200
    assert researcher.get("/api/v1/me/profile/teaching").json() == {"interests": ["Bioinformatics"]}


@pytest.mark.parametrize("change", [
    {"projects": [{**PROJECT, "startYear": "twenty"}]},
    {"projects": [{**PROJECT, "type": "Galactic"}]},
    {"interests": ["x" * 121]},
    {"interests": [f"k{i}" for i in range(31)]},
])
def test_research_is_checked(researcher, change):
    assert researcher.put("/api/v1/me/profile/research", json=change).status_code == 422


def test_everything_needs_sign_in(client):
    assert client.get(ENTRIES).status_code == 401
    assert client.get("/api/v1/me/profile/research").status_code == 401
    assert client.post("/api/v1/me/documents", files={"file": ("a.pdf", PDF, "application/pdf")}).status_code == 401
