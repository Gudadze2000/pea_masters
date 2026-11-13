"""Small helpers shared by the API tests."""

from app.models import User


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
