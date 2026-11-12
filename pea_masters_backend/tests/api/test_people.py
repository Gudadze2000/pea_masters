import pytest
from sqlalchemy import func, select

from app.models import (
    Affiliation,
    AuditLog,
    CoordinatorAssignment,
    Organization,
    OrganizationDomain,
    OrganizationMembership,
    RoleAssignment,
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


def add_department(client, base, name):
    response = client.post(f"{base}/units", json={"name_en": name})
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


# --- who may do what ----------------------------------------------------------------------------

def test_signed_out_requests_are_refused(client, base):
    assert client.get(f"{base}/people").status_code == 401


def test_member_cannot_see_or_manage_people(signed_in, make_user, base, db):
    member = make_user(email="member@iliauni.edu.ge", status="active")
    c = signed_in(member)
    assert c.get(f"{base}/people").status_code == 403
    assert register(c, base, "x@iliauni.edu.ge").status_code == 403
    denied = db.scalars(select(AuditLog).where(AuditLog.action == "authz.denied")).all()
    assert [row.entity_id for row in denied] == ["people.view", "people.manage"]
    assert denied[0].actor_user_id == member.id


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
    response = signed_in(root).get(f"{base}/people")
    assert response.status_code == 200
    assert response.json()["can_manage"] is True


# --- departments --------------------------------------------------------------------------------

def test_departments(as_admin, signed_in, make_user, base):
    add_department(as_admin, base, "Physics")
    assert as_admin.post(f"{base}/units", json={"name_en": "physics"}).status_code == 409  # names are unique

    member = signed_in(make_user(email="m@iliauni.edu.ge", status="active"))
    assert [u["name"]["en"] for u in member.get(f"{base}/units").json()] == ["Physics"]  # everyone can list
    assert member.post(f"{base}/units", json={"name_en": "Law"}).status_code == 403  # only Admins change them


# --- registering --------------------------------------------------------------------------------

def test_admin_registers_a_member_into_a_department(as_admin, base):
    physics = add_department(as_admin, base, "Physics")
    response = register(as_admin, base, "Nika.Lomidze@IliaUni.edu.ge", department_id=physics, name="Nika Lomidze")
    assert response.status_code == 201, response.text
    person = response.json()
    assert person["email"] == "nika.lomidze@iliauni.edu.ge"
    assert person["status"] == "invited"  # until their first Google sign-in
    assert person["roles"] == ["member"]
    assert person["department"]["name"]["en"] == "Physics"

    listed = as_admin.get(f"{base}/people").json()
    assert listed["can_manage"] is True
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


# --- coordinators -------------------------------------------------------------------------------

def test_one_coordinator_per_department(as_admin, base):
    physics = add_department(as_admin, base, "Physics")
    first = register(as_admin, base, "c1@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=physics)
    assert first.json()["coordinates"]["id"] == physics
    second = register(as_admin, base, "c2@iliauni.edu.ge", roles=["coordinator"], coordinates=physics)
    assert second.status_code == 409
    assert error_code(second) == "department_has_coordinator"
    assert "c1" in second.json()["detail"]["message"]


def test_coordinator_sees_only_their_departments_members(as_admin, signed_in, base, db):
    physics = add_department(as_admin, base, "Physics")
    law = add_department(as_admin, base, "Law")
    coordinator = register(as_admin, base, "coord@iliauni.edu.ge", roles=["coordinator", "member"],
                           coordinates=physics, department_id=physics).json()
    register(as_admin, base, "physicist@iliauni.edu.ge", department_id=physics)
    lawyer = register(as_admin, base, "lawyer@iliauni.edu.ge", department_id=law).json()

    c = as_person(signed_in, db, coordinator)
    listed = c.get(f"{base}/people").json()
    assert listed["can_manage"] is False
    assert {p["email"] for p in listed["people"]} == {"coord@iliauni.edu.ge", "physicist@iliauni.edu.ge"}
    assert c.get(f"{base}/people/{lawyer['id']}").status_code == 403  # outside their department
    assert register(c, base, "new@iliauni.edu.ge").status_code == 403  # and they can't register anyone

    me = c.get("/api/v1/auth/me").json()
    assert [u["name"]["en"] for u in me["organizations"][0]["coordinates"]] == ["Physics"]


def test_moving_someone_keeps_department_history(as_admin, base, db):
    physics = add_department(as_admin, base, "Physics")
    law = add_department(as_admin, base, "Law")
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


def test_last_admin_cannot_lose_the_admin_role(as_admin, admin, base):
    response = as_admin.put(f"{base}/people/{admin.id}/roles", json={"roles": ["member"]})
    assert response.status_code == 409 and error_code(response) == "last_admin"

    second = register(as_admin, base, "second@iliauni.edu.ge", roles=["admin"]).json()
    assert second["roles"] == ["admin"]  # only Admins of the same organization grant Admin
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
    assert response.json()["roles"] == ["member"]  # stops coordinating, so Physics can get a new Coordinator
    assert theirs.get("/api/v1/auth/me").status_code == 401  # signed out immediately
    google_returns()
    assert client.get("/api/v1/auth/google/callback?code=x&state=y", follow_redirects=False) \
        .headers["location"].endswith("error=not_registered")
    assert register(as_admin, base, "next@iliauni.edu.ge", roles=["coordinator"], coordinates=physics) \
        .status_code == 201

    assert as_admin.post(f"{base}/people/{person['id']}/deactivate").status_code == 409  # already
    assert as_admin.post(f"{base}/people/{person['id']}/reactivate").json()["status"] == "active"


def test_database_allows_one_current_coordinator_per_department(db, org, admin):
    """The rule also holds if two requests race past the application check."""
    from sqlalchemy.exc import IntegrityError

    from app.models import OrganizationUnit, UnitType
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
