import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Affiliation,
    AuditLog,
    CoordinatorAssignment,
    Organization,
    OrganizationDomain,
    OrganizationMembership,
    OrganizationUnit,
    RoleAssignment,
    UnitType,
    User,
)


@pytest.fixture
def admin(make_user):
    return make_user(email="admin@iliauni.edu.ge", roles=("admin", "member"), status="active")


@pytest.fixture
def as_admin(signed_in, admin):
    return signed_in(admin)


@pytest.fixture
def base(org):
    return f"/api/v1/orgs/{org.id}"


def add_faculty(client, base, name="School of Business, Technology and Education"):
    response = client.post(f"{base}/units", json={"kind": "faculty", "name_en": name})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def add_department(client, base, name, faculty=None):
    faculty = faculty or add_faculty(client, base, f"Faculty of {name}")
    response = client.post(f"{base}/units", json={"kind": "department", "name_en": name, "parent_id": faculty})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def register(client, base, email, roles=("member",), department_id=None, coordinates=None, name=None):
    return client.post(f"{base}/people", json={
        "email": email, "display_name": name or email.split("@")[0], "roles": list(roles),
        "department_id": department_id, "coordinates_unit_id": coordinates})


def error_code(response):
    return response.json()["detail"]["code"]


def as_person(signed_in, db, person):
    """Signs in as someone registered through the API, as if they had completed their first Google sign-in."""
    user = db.get(User, person["id"])
    user.status = "active"
    db.commit()
    return signed_in(user)


@pytest.fixture
def head_of_cs(as_admin, signed_in, base, db):
    """A Coordinator heading Computer Science, plus a second department (Mathematics) in the same faculty."""
    faculty = add_faculty(as_admin, base)
    cs = add_department(as_admin, base, "Computer Science", faculty)
    math = add_department(as_admin, base, "Mathematics", faculty)
    head = register(as_admin, base, "head.cs@iliauni.edu.ge", roles=["coordinator", "member"],
                    coordinates=cs, department_id=cs).json()
    return {"client": as_person(signed_in, db, head), "id": head["id"], "cs": cs, "math": math, "faculty": faculty}


# --- who may do what ----------------------------------------------------------------------------

def test_signed_out_requests_are_refused(client, base):
    assert client.get(f"{base}/people").status_code == 401


def test_researcher_cannot_see_or_manage_people(signed_in, make_user, base, db):
    researcher = make_user(email="member@iliauni.edu.ge", status="active")
    c = signed_in(researcher)
    assert c.get(f"{base}/people").status_code == 403
    assert register(c, base, "x@iliauni.edu.ge").status_code == 403
    denied = db.scalars(select(AuditLog).where(AuditLog.action == "authz.denied")).all()
    assert [row.entity_id for row in denied] == ["people.view", "people.register"]
    assert denied[0].actor_user_id == researcher.id


def test_admin_of_another_organization_is_refused(signed_in, db, base):
    other = Organization(slug="tsu", name={"en": "Other University"}, kind="university")
    db.add(other)
    db.flush()
    stranger = User(email="admin@tsu.ge", display_name="Other Admin")
    db.add(stranger)
    db.flush()
    db.add(OrganizationMembership(user_id=stranger.id, organization_id=other.id))
    db.add(RoleAssignment(user_id=stranger.id, organization_id=other.id, role="admin"))
    db.commit()
    assert signed_in(stranger).get(f"{base}/people").status_code == 403


def test_root_can_manage_any_organization(signed_in, db, base, admin):
    root = User(email="root@pea.ge", display_name="Root")
    db.add(root)
    db.flush()
    db.add(RoleAssignment(user_id=root.id, organization_id=None, role="root"))
    db.commit()
    c = signed_in(root)
    response = c.get(f"{base}/people")
    assert response.status_code == 200
    assert response.json()["can_manage_roles"] is True
    assert register(c, base, "second.admin@iliauni.edu.ge", roles=["admin"]).status_code == 201


# --- structure: faculties and departments -------------------------------------------------------

def test_faculties_contain_departments(as_admin, signed_in, make_user, base):
    faculty = add_faculty(as_admin, base)
    cs = add_department(as_admin, base, "Computer Science", faculty)
    add_department(as_admin, base, "Mathematics", faculty)

    units = as_admin.get(f"{base}/units").json()
    assert [(u["kind"], u["name"]["en"]) for u in units] == [
        ("faculty", "School of Business, Technology and Education"),
        ("department", "Computer Science"), ("department", "Mathematics")]
    assert all(u["parent_id"] == faculty for u in units if u["kind"] == "department")

    # A department needs a faculty, and must not be put under another department
    no_faculty = as_admin.post(f"{base}/units", json={"kind": "department", "name_en": "Law"})
    assert error_code(no_faculty) == "department_needs_faculty"
    under_department = as_admin.post(f"{base}/units", json={"kind": "department", "name_en": "AI", "parent_id": cs})
    assert error_code(under_department) == "not_a_faculty"

    # Names are unique among faculties, and among departments of one faculty
    assert error_code(as_admin.post(f"{base}/units", json={
        "kind": "department", "name_en": "computer science", "parent_id": faculty})) == "duplicate_department"
    other_faculty = add_faculty(as_admin, base, "School of Natural Sciences and Medicine")
    assert add_department(as_admin, base, "Computer Science", other_faculty)  # fine in another faculty

    researcher = signed_in(make_user(email="m@iliauni.edu.ge", status="active"))
    assert len(researcher.get(f"{base}/units").json()) == 5  # 2 faculties, 3 departments: everyone can list
    assert researcher.post(f"{base}/units", json={"kind": "faculty", "name_en": "Law"}).status_code == 403


def test_department_can_move_to_another_faculty(as_admin, base):
    first = add_faculty(as_admin, base, "First")
    second = add_faculty(as_admin, base, "Second")
    dept = add_department(as_admin, base, "Physics", first)
    moved = as_admin.patch(f"{base}/units/{dept}", json={"name_en": "Physics", "parent_id": second})
    assert moved.status_code == 200 and moved.json()["parent_id"] == second


def test_people_belong_to_departments_not_faculties(as_admin, base):
    faculty = add_faculty(as_admin, base)
    assert error_code(register(as_admin, base, "a@iliauni.edu.ge", department_id=faculty)) == "not_a_department"


# --- registering --------------------------------------------------------------------------------

def test_admin_registers_a_researcher_into_a_department(as_admin, base):
    faculty = add_faculty(as_admin, base)
    cs = add_department(as_admin, base, "Computer Science", faculty)
    response = register(as_admin, base, "Nika.Lomidze@IliaUni.edu.ge", department_id=cs, name="Nika Lomidze")
    assert response.status_code == 201, response.text
    person = response.json()
    assert person["email"] == "nika.lomidze@iliauni.edu.ge"
    assert person["status"] == "invited"  # until their first Google sign-in
    assert person["roles"] == ["member"]
    assert person["department"]["name"]["en"] == "Computer Science"
    assert person["faculty"]["id"] == faculty

    listed = as_admin.get(f"{base}/people").json()
    assert listed["can_register"] is True and listed["can_manage_roles"] is True
    assert {p["email"] for p in listed["people"]} == {"admin@iliauni.edu.ge", "nika.lomidze@iliauni.edu.ge"}


def test_registering_checks_domain_duplicates_and_coordinator_department(as_admin, base):
    assert error_code(register(as_admin, base, "someone@gmail.com")) == "email_domain"
    assert register(as_admin, base, "a@iliauni.edu.ge").status_code == 201
    assert error_code(register(as_admin, base, "A@iliauni.edu.ge")) == "already_registered"
    assert error_code(register(as_admin, base, "c@iliauni.edu.ge", roles=["coordinator"])) == \
        "coordinator_needs_department"


def test_registered_person_can_then_sign_in_with_google(as_admin, base, client, google_returns):
    register(as_admin, base, "nino.beridze@iliauni.edu.ge")
    google_returns()
    assert client.get("/api/v1/auth/google/callback?code=x&state=y", follow_redirects=False) \
        .headers["location"].endswith("/home")


# --- heads of department (Coordinators) ---------------------------------------------------------

def test_one_head_per_department(as_admin, base):
    cs = add_department(as_admin, base, "Computer Science")
    first = register(as_admin, base, "c1@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs)
    assert first.json()["coordinates"]["id"] == cs
    second = register(as_admin, base, "c2@iliauni.edu.ge", roles=["coordinator"], coordinates=cs)
    assert second.status_code == 409
    assert error_code(second) == "department_has_coordinator"
    assert "c1" in second.json()["detail"]["message"]


def test_head_registers_researchers_into_their_own_department(head_of_cs, base):
    c = head_of_cs["client"]
    listed = c.get(f"{base}/people").json()
    assert listed["can_register"] is True and listed["can_manage_roles"] is False

    # The department is filled in for them
    created = register(c, base, "student.researcher@iliauni.edu.ge")
    assert created.status_code == 201, created.text
    assert created.json()["department"]["id"] == head_of_cs["cs"]
    assert created.json()["roles"] == ["member"]

    # ...but only Researchers, and only into their own department
    assert error_code(register(c, base, "x@iliauni.edu.ge", department_id=head_of_cs["math"])) == "own_department_only"
    assert error_code(register(c, base, "y@iliauni.edu.ge", roles=["admin"])) == "researchers_only"
    assert error_code(register(c, base, "z@iliauni.edu.ge", roles=["coordinator", "member"],
                               coordinates=head_of_cs["cs"])) == "researchers_only"


def test_head_sees_only_their_departments_people(as_admin, head_of_cs, base):
    register(as_admin, base, "cs.researcher@iliauni.edu.ge", department_id=head_of_cs["cs"])
    mathematician = register(as_admin, base, "math.researcher@iliauni.edu.ge",
                             department_id=head_of_cs["math"]).json()

    c = head_of_cs["client"]
    assert {p["email"] for p in c.get(f"{base}/people").json()["people"]} == \
        {"head.cs@iliauni.edu.ge", "cs.researcher@iliauni.edu.ge"}
    assert c.get(f"{base}/people/{mathematician['id']}").status_code == 403
    assert c.patch(f"{base}/people/{mathematician['id']}", json={"display_name": "X"}).status_code == 403
    assert c.post(f"{base}/people/{mathematician['id']}/deactivate").status_code == 403

    me = c.get("/api/v1/auth/me").json()
    assert [u["name"]["en"] for u in me["organizations"][0]["coordinates"]] == ["Computer Science"]


def test_head_edits_deactivates_and_reactivates_their_researchers(head_of_cs, base):
    c = head_of_cs["client"]
    person = register(c, base, "r@iliauni.edu.ge", name="Typo Nmae").json()

    renamed = c.patch(f"{base}/people/{person['id']}", json={"display_name": "Fixed Name"})
    assert renamed.json()["display_name"] == "Fixed Name"
    moved = c.patch(f"{base}/people/{person['id']}", json={"department_id": head_of_cs["math"]})
    assert error_code(moved) == "admins_move_people"
    assert c.put(f"{base}/people/{person['id']}/roles", json={"roles": ["admin"]}).status_code == 403

    assert c.post(f"{base}/people/{person['id']}/deactivate").json()["status"] == "deactivated"
    # Deactivated Researchers stay in the head's list, so they can be reactivated
    listed = {p["email"]: p["status"] for p in c.get(f"{base}/people").json()["people"]}
    assert listed["r@iliauni.edu.ge"] == "deactivated"
    assert c.post(f"{base}/people/{person['id']}/reactivate").json()["status"] == "invited"


def test_head_cannot_act_on_admins_or_other_heads(as_admin, admin, head_of_cs, base, db):
    # An Admin who works in Computer Science is visible to the head, but not theirs to manage
    as_admin.patch(f"{base}/people/{admin.id}", json={"department_id": head_of_cs["cs"]})
    c = head_of_cs["client"]
    assert error_code(c.post(f"{base}/people/{admin.id}/deactivate")) == "researchers_only"
    assert error_code(c.patch(f"{base}/people/{admin.id}", json={"display_name": "X"})) == "researchers_only"
    assert error_code(c.post(f"{base}/people/{head_of_cs['id']}/deactivate")) == "cannot_deactivate_self"


def test_moving_someone_keeps_department_history(as_admin, base, db):
    faculty = add_faculty(as_admin, base)
    physics = add_department(as_admin, base, "Physics", faculty)
    law = add_department(as_admin, base, "Law", faculty)
    person = register(as_admin, base, "p@iliauni.edu.ge", department_id=physics).json()

    moved = as_admin.patch(f"{base}/people/{person['id']}", json={"department_id": law}).json()
    assert moved["department"]["id"] == law
    rows = db.scalars(select(Affiliation).order_by(Affiliation.created_at)).all()
    assert [(str(r.unit_id), r.ends_on is None) for r in rows] == [(physics, False), (law, True)]


# --- roles --------------------------------------------------------------------------------------

def test_role_changes_are_kept_and_audited(as_admin, base, db):
    physics = add_department(as_admin, base, "Physics")
    person = register(as_admin, base, "p@iliauni.edu.ge").json()

    response = as_admin.put(f"{base}/people/{person['id']}/roles",
                            json={"roles": ["coordinator", "member"], "coordinates_unit_id": physics})
    assert response.json()["roles"] == ["coordinator", "member"]
    response = as_admin.put(f"{base}/people/{person['id']}/roles", json={"roles": ["member"], "reason": "Term ended"})
    assert response.json()["roles"] == ["member"] and response.json()["coordinates"] is None

    revoked = db.scalar(select(RoleAssignment).where(RoleAssignment.role == "coordinator"))
    assert revoked.revoked_at is not None and revoked.revoke_reason == "Term ended"  # kept, not deleted
    assert db.scalar(select(CoordinatorAssignment.ends_on)) is not None
    log = db.scalars(select(AuditLog).where(AuditLog.action == "person.roles_changed").order_by(AuditLog.id)).all()
    assert log[-1].before["roles"] == ["coordinator", "member"] and log[-1].after["roles"] == ["member"]
    assert log[-1].acting_role == "admin"


def test_a_faculty_cannot_have_a_head(as_admin, base):
    faculty = add_faculty(as_admin, base)
    response = register(as_admin, base, "c@iliauni.edu.ge", roles=["coordinator"], coordinates=faculty)
    assert error_code(response) == "not_a_department"


def test_last_admin_cannot_lose_the_admin_role(as_admin, admin, base):
    response = as_admin.put(f"{base}/people/{admin.id}/roles", json={"roles": ["member"]})
    assert response.status_code == 409 and error_code(response) == "last_admin"

    second = register(as_admin, base, "second@iliauni.edu.ge", roles=["admin"]).json()
    assert second["roles"] == ["admin"]  # Admins of the same organization may grant Admin
    assert as_admin.put(f"{base}/people/{admin.id}/roles", json={"roles": ["member"]}).status_code == 200


# --- deactivating -------------------------------------------------------------------------------

def test_admin_cannot_deactivate_themselves(as_admin, admin, base):
    response = as_admin.post(f"{base}/people/{admin.id}/deactivate")
    assert response.status_code == 409 and error_code(response) == "cannot_deactivate_self"


def test_deactivation_signs_out_and_blocks_sign_in(as_admin, signed_in, base, db, client, google_returns):
    physics = add_department(as_admin, base, "Physics")
    person = register(as_admin, base, "nino.beridze@iliauni.edu.ge", roles=["coordinator", "member"],
                      coordinates=physics).json()
    theirs = as_person(signed_in, db, person)
    assert theirs.get("/api/v1/auth/me").status_code == 200

    response = as_admin.post(f"{base}/people/{person['id']}/deactivate", json={"reason": "Left the university"})
    assert response.json()["status"] == "deactivated"
    assert response.json()["roles"] == ["member"]  # stops heading the department, so it can get a new head
    assert theirs.get("/api/v1/auth/me").status_code == 401  # signed out immediately
    google_returns()
    assert client.get("/api/v1/auth/google/callback?code=x&state=y", follow_redirects=False) \
        .headers["location"].endswith("error=not_registered")
    assert register(as_admin, base, "next@iliauni.edu.ge", roles=["coordinator"], coordinates=physics) \
        .status_code == 201

    assert as_admin.post(f"{base}/people/{person['id']}/deactivate").status_code == 409  # already
    assert as_admin.post(f"{base}/people/{person['id']}/reactivate").json()["status"] == "active"


def test_database_allows_one_current_head_per_department(db, org, admin):
    """The rule also holds if two requests race past the application check."""
    unit_type = UnitType(organization_id=org.id, name={"en": "Department"})
    db.add(unit_type)
    db.flush()
    unit = OrganizationUnit(organization_id=org.id, unit_type_id=unit_type.id, name={"en": "Physics"})
    db.add(unit)
    db.flush()
    for _ in range(2):
        db.add(CoordinatorAssignment(organization_id=org.id, coordinator_user_id=admin.id, target="unit",
                                     unit_id=unit.id, assigned_by=admin.id))
    with pytest.raises(IntegrityError):
        db.flush()


def test_domain_must_be_verified_to_register(as_admin, base, db):
    db.scalar(select(OrganizationDomain)).verified_at = None
    db.commit()
    assert error_code(register(as_admin, base, "a@iliauni.edu.ge")) == "email_domain"
    assert db.scalar(select(func.count()).select_from(User)) == 1
