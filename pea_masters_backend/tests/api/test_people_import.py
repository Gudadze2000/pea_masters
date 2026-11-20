"""Registering and deactivating many people at once (POST /people/import). The browser reads the spreadsheet or the
page and sends the rows; the server checks every row with the same rules as the single-person buttons and saves all
or nothing."""

from sqlalchemy import func, select

from app.models import AuditLog, CoordinatorAssignment, OrganizationMembership, User, UserSession
from tests.api.helpers import add_department, add_faculty, as_person, register


def row(email, roles=("member",), department_id=None, name=None):
    return {"email": email, "display_name": name, "roles": list(roles), "department_id": department_id}


def deactivate(email):
    return {"email": email, "action": "deactivate"}


def run(client, base, rows, save=False):
    return client.post(f"{base}/people/import", json={"rows": rows, "save": save})


def status_of(client, base, email):
    return next(p["status"] for p in client.get(f"{base}/people").json()["people"] if p["email"] == email)


def member_count(db):
    return db.scalar(select(func.count()).select_from(OrganizationMembership))


def test_checking_reports_each_row_and_saves_nothing(as_admin, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    before = member_count(db)
    response = run(as_admin, base, [
        row("nino.beridze.1@iliauni.edu.ge", department_id=cs),
        row("giorgi.kapanadze@iliauni.edu.ge", roles=["coordinator", "member"], department_id=cs),
    ])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body == {"results": [
        {"email": "nino.beridze.1@iliauni.edu.ge", "code": None, "message": None},
        {"email": "giorgi.kapanadze@iliauni.edu.ge", "code": None, "message": None},
    ], "errors": 0, "registered": 0, "deactivated": 0}
    db.expire_all()
    assert member_count(db) == before
    assert db.scalar(select(User).where(User.email == "nino.beridze.1@iliauni.edu.ge")) is None


def test_saving_registers_everyone_with_departments_roles_and_audit(as_admin, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    response = run(as_admin, base, [
        row("nino.beridze.1@iliauni.edu.ge", department_id=cs),
        row("head@iliauni.edu.ge", roles=["coordinator", "member"], department_id=cs, name="Tamar Head"),
        row("second.admin@iliauni.edu.ge", roles=["admin"]),
    ], save=True)
    assert response.status_code == 200, response.text
    assert response.json()["registered"] == 3

    people = {p["email"]: p for p in as_admin.get(f"{base}/people").json()["people"]}
    assert people["nino.beridze.1@iliauni.edu.ge"]["display_name"] == "Nino Beridze"  # guessed from the email
    assert people["nino.beridze.1@iliauni.edu.ge"]["department"]["id"] == cs
    assert people["nino.beridze.1@iliauni.edu.ge"]["status"] == "invited"
    assert people["head@iliauni.edu.ge"]["display_name"] == "Tamar Head"
    assert people["head@iliauni.edu.ge"]["coordinates"]["id"] == cs  # heads the department they're in
    assert people["second.admin@iliauni.edu.ge"]["roles"] == ["admin"]

    db.expire_all()
    wanted = ["person.registered", "people.imported"]
    actions = db.scalars(select(AuditLog.action).where(AuditLog.action.in_(wanted))).all()
    assert sorted(actions) == ["people.imported"] + ["person.registered"] * 3


def test_one_bad_row_saves_nobody_and_says_which(as_admin, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    register(as_admin, base, "already@iliauni.edu.ge", department_id=cs)
    before = member_count(db)
    response = run(as_admin, base, [
        row("fine@iliauni.edu.ge", department_id=cs, name="Fine Person"),
        row("already@iliauni.edu.ge", department_id=cs),
        row("someone@gmail.com"),
        row("not an email"),
        row("fine@iliauni.edu.ge", name="Fine Again"),
        row("=cmd|' /C calc'!A0@iliauni.edu.ge"),
        row("formula@iliauni.edu.ge", name="=HYPERLINK(\"http://evil\")"),
        row("lonely.head@iliauni.edu.ge", roles=["coordinator"]),
    ], save=True)
    assert response.status_code == 200, response.text
    body = response.json()
    assert [r["code"] for r in body["results"]] == [
        None, "already_registered", "email_domain", "invalid_email", "duplicate_row", "invalid_email", "formula",
        "coordinator_needs_department"]
    assert body["errors"] == 7 and body["registered"] == 0
    db.expire_all()
    assert member_count(db) == before
    assert db.scalar(select(User).where(User.email == "fine@iliauni.edu.ge")) is None


def test_an_existing_person_is_reported_never_changed(as_admin, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    math = add_department(as_admin, base, "Mathematics")
    person = register(as_admin, base, "kept@iliauni.edu.ge", department_id=cs, name="Kept As Is").json()
    response = run(as_admin, base, [row("KEPT@iliauni.edu.ge", roles=["admin"], department_id=math, name="Other")],
                   save=True)
    assert response.json()["results"][0]["code"] == "already_registered"
    after = as_admin.get(f"{base}/people/{person['id']}").json()
    assert (after["display_name"], after["roles"], after["department"]["id"]) == ("Kept As Is", ["member"], cs)


def test_two_heads_for_one_department_are_caught(as_admin, base):
    cs = add_department(as_admin, base, "Computer Science")
    response = run(as_admin, base, [
        row("head.one@iliauni.edu.ge", roles=["coordinator"], department_id=cs),
        row("head.two@iliauni.edu.ge", roles=["coordinator"], department_id=cs),
    ])
    assert [r["code"] for r in response.json()["results"]] == [None, "department_has_coordinator"]


def test_people_go_into_departments_not_faculties(as_admin, base):
    faculty = add_faculty(as_admin, base)
    response = run(as_admin, base, [row("x.y@iliauni.edu.ge", department_id=faculty)])
    assert response.json()["results"][0]["code"] == "not_a_department"


def test_coordinators_import_researchers_into_their_own_department_only(as_admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    math = add_department(as_admin, base, "Mathematics")
    head = register(as_admin, base, "head.cs@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs,
                    department_id=cs).json()
    coordinator = as_person(signed_in, db, head)

    refused = run(coordinator, base, [
        row("new.admin@iliauni.edu.ge", roles=["admin"], department_id=cs),
        row("other.dept@iliauni.edu.ge", department_id=math),
    ], save=True)
    assert [r["code"] for r in refused.json()["results"]] == ["researchers_only", "own_department_only"]

    # No department given: they join the one department this Coordinator heads
    saved = run(coordinator, base, [row("new.one@iliauni.edu.ge"), row("new.two@iliauni.edu.ge", department_id=cs)],
                save=True)
    assert saved.json()["registered"] == 2
    people = {p["email"]: p for p in as_admin.get(f"{base}/people").json()["people"]}
    assert people["new.one@iliauni.edu.ge"]["department"]["id"] == cs
    assert people["new.one@iliauni.edu.ge"]["roles"] == ["member"]


def test_researchers_cannot_import(as_admin, signed_in, base, db):
    researcher = register(as_admin, base, "plain@iliauni.edu.ge", name="Plain Person").json()
    assert run(as_person(signed_in, db, researcher), base, [row("a.b@iliauni.edu.ge")]).status_code == 403


# --- deactivating from the list ------------------------------------------------------------------

def test_a_list_registers_and_deactivates_together(as_admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    leaving = register(as_admin, base, "leaving.person@iliauni.edu.ge", department_id=cs).json()
    as_person(signed_in, db, leaving)  # signed in somewhere: deactivation signs them out

    checked = run(as_admin, base, [row("arriving.person@iliauni.edu.ge", department_id=cs),
                                   deactivate("LEAVING.person@iliauni.edu.ge")])
    assert checked.json()["errors"] == 0
    assert status_of(as_admin, base, "leaving.person@iliauni.edu.ge") == "active"  # a check changes nothing

    saved = run(as_admin, base, [row("arriving.person@iliauni.edu.ge", department_id=cs),
                                 deactivate("leaving.person@iliauni.edu.ge")], save=True)
    assert (saved.json()["registered"], saved.json()["deactivated"]) == (1, 1)
    assert status_of(as_admin, base, "leaving.person@iliauni.edu.ge") == "deactivated"
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(UserSession).where(
        UserSession.user_id == leaving["id"], UserSession.revoked_at.is_(None))) == 0
    reason = db.scalar(select(AuditLog.reason).where(AuditLog.action == "person.deactivated"))
    assert reason == "From a list (Add several people)"


def test_deactivation_rows_follow_the_same_rules(as_admin, admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    gone = register(as_admin, base, "gone.person@iliauni.edu.ge", department_id=cs).json()
    as_admin.post(f"{base}/people/{gone['id']}/deactivate", json={"reason": None})
    response = run(as_admin, base, [
        deactivate("gone.person@iliauni.edu.ge"),
        deactivate("nobody.here@iliauni.edu.ge"),
        deactivate(admin.email),
    ], save=True)
    assert [r["code"] for r in response.json()["results"]] == [
        "already_deactivated", "not_registered", "cannot_deactivate_self"]


def test_coordinators_deactivate_only_their_own_researchers(as_admin, signed_in, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    math = add_department(as_admin, base, "Mathematics")
    head = register(as_admin, base, "head.cs@iliauni.edu.ge", roles=["coordinator", "member"], coordinates=cs,
                    department_id=cs).json()
    register(as_admin, base, "own.researcher@iliauni.edu.ge", department_id=cs)
    register(as_admin, base, "math.researcher@iliauni.edu.ge", department_id=math)
    register(as_admin, base, "cs.admin@iliauni.edu.ge", roles=["admin", "member"], department_id=cs)
    coordinator = as_person(signed_in, db, head)

    response = run(coordinator, base, [deactivate("math.researcher@iliauni.edu.ge"),
                                       deactivate("cs.admin@iliauni.edu.ge")], save=True)
    assert [r["code"] for r in response.json()["results"]] == ["not_registered", "researchers_only"]
    assert response.json()["results"][0]["message"] == "Nobody with this email is registered in your department."
    assert run(coordinator, base, [deactivate("own.researcher@iliauni.edu.ge")], save=True).json()["deactivated"] == 1
    assert status_of(as_admin, base, "own.researcher@iliauni.edu.ge") == "deactivated"
    assert status_of(as_admin, base, "math.researcher@iliauni.edu.ge") != "deactivated"


def test_the_last_admin_cannot_be_deactivated_from_a_list(as_admin, signed_in, base, db):
    other = register(as_admin, base, "other.admin@iliauni.edu.ge", roles=["admin"], name="Other Admin").json()
    other_client = as_person(signed_in, db, other)
    # Deactivating the first Admin leaves the other one; the list can't then take the other one too
    response = run(other_client, base, [deactivate("admin@iliauni.edu.ge")], save=True)
    assert response.json()["deactivated"] == 1
    response = run(as_admin, base, [deactivate("other.admin@iliauni.edu.ge")], save=True)
    assert response.status_code in (401, 403)  # the first Admin was deactivated and signed out


def test_at_most_1000_rows(as_admin, base):
    rows = [row(f"person.{n}@iliauni.edu.ge") for n in range(1001)]
    assert run(as_admin, base, rows).status_code == 422
    assert run(as_admin, base, []).status_code == 422


def test_a_thousand_rows_can_be_saved(as_admin, base, db):
    rows = [row(f"person.number{n}@iliauni.edu.ge", name=f"Person {n}") for n in range(1000)]
    response = run(as_admin, base, rows, save=True)
    assert response.status_code == 200, response.text
    assert response.json()["registered"] == 1000
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(User).where(User.email.like("person.number%"))) == 1000


def test_a_head_imported_with_a_department_gets_its_assignment(as_admin, base, db):
    cs = add_department(as_admin, base, "Computer Science")
    run(as_admin, base, [row("new.head@iliauni.edu.ge", roles=["coordinator", "member"], department_id=cs)], save=True)
    db.expire_all()
    assert db.scalar(select(CoordinatorAssignment.unit_id).where(CoordinatorAssignment.ends_on.is_(None))) is not None
