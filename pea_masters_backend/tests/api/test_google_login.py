import pytest
from fastapi.responses import RedirectResponse
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app import audit
from app.auth import google
from app.models import AuditLog, AuthIdentity, OrganizationDomain, RoleAssignment, User, UserSession

CALLBACK = "/api/v1/auth/google/callback?code=x&state=y"


def callback(client):
    return client.get(CALLBACK, follow_redirects=False)


def assert_denied(response, code):
    assert response.status_code == 303
    assert response.headers["location"] == f"http://localhost:5173/login?error={code}"
    assert "pea_session" not in response.cookies


# --- starting sign-in ---------------------------------------------------------------------------

def test_email_from_another_domain_is_rejected_before_google(client, org):
    assert_denied(client.get("/api/v1/auth/google/login?email=someone@gmail.com", follow_redirects=False),
                  "not_organization_account")


def test_email_from_organization_domain_goes_to_google_with_hints(client, org, monkeypatch):
    seen = {}

    async def fake_redirect(request, redirect_uri, **params):
        seen.update(params, redirect_uri=redirect_uri)
        return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth", status_code=302)
    monkeypatch.setattr(google.oauth.google, "authorize_redirect", fake_redirect)

    response = client.get("/api/v1/auth/google/login?email=Nino.Beridze@IliaUni.edu.ge", follow_redirects=False)
    assert response.headers["location"].startswith("https://accounts.google.com/")
    assert seen == {"prompt": "select_account", "login_hint": "nino.beridze@iliauni.edu.ge",
                    "hd": "iliauni.edu.ge", "redirect_uri": "http://localhost:5173/api/v1/auth/google/callback"}


# --- who may sign in ----------------------------------------------------------------------------

def test_registered_user_signs_in_and_is_linked(client, db, make_user, google_returns):
    user = make_user(roles=("admin", "member"))
    google_returns()

    response = callback(client)
    assert response.status_code == 303
    assert response.headers["location"] == "http://localhost:5173/home"
    cookie = response.headers["set-cookie"]
    assert "pea_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie

    db.expire_all()
    assert db.get(User, user.id).status == "active"  # invited -> active on first sign-in
    assert db.get(User, user.id).last_login_at is not None
    identity = db.scalar(select(AuthIdentity))
    assert (identity.user_id, identity.provider, identity.provider_subject) == (user.id, "google", "google-sub-1")
    stored = db.scalar(select(UserSession))
    assert stored.token_hash != response.cookies["pea_session"]  # only the hash is kept

    me = client.get("/api/v1/auth/me").json()
    assert me["email"] == "nino.beridze@iliauni.edu.ge"
    assert me["is_root"] is False
    assert [(o["slug"], o["roles"]) for o in me["organizations"]] == [("iliauni", ["admin", "member"])]


def test_returning_user_is_matched_by_google_id_not_email(client, db, make_user, google_returns):
    user = make_user()
    google_returns()
    callback(client)
    google_returns(email="n.beridze@iliauni.edu.ge")  # renamed in Google Workspace, same account

    assert callback(client).headers["location"].endswith("/home")
    assert db.scalar(select(AuthIdentity.user_id)) == user.id


def test_personal_google_account_is_rejected(client, make_user, google_returns):
    make_user()
    google_returns(hd=None, email="nino.beridze@gmail.com")
    assert_denied(callback(client), "not_organization_account")


def test_workspace_domain_without_organization_is_rejected(client, org, google_returns):
    google_returns(hd="tsu.ge", email="someone@tsu.ge")
    assert_denied(callback(client), "not_organization_account")


def test_unverified_domain_is_rejected(client, db, make_user, google_returns):
    make_user()
    db.scalar(select(OrganizationDomain)).verified_at = None
    db.commit()
    google_returns()
    assert_denied(callback(client), "not_organization_account")


def test_unverified_email_is_rejected(client, make_user, google_returns):
    make_user()
    google_returns(email_verified=False)
    assert_denied(callback(client), "email_not_verified")


def test_person_not_registered_by_an_admin_is_rejected(client, db, org, google_returns):
    google_returns()
    assert_denied(callback(client), "not_registered")
    assert db.scalar(select(User)) is None
    assert db.scalar(select(AuthIdentity)) is None


def test_inactive_membership_is_rejected(client, make_user, google_returns):
    make_user(membership="inactive")
    google_returns()
    assert_denied(callback(client), "not_registered")


def test_deactivated_account_is_rejected(client, make_user, google_returns):
    make_user(status="deactivated")
    google_returns()
    assert_denied(callback(client), "account_disabled")


def test_self_signup_creates_a_member(client, db, org, google_returns):
    db.scalar(select(OrganizationDomain)).allow_self_signup = True
    db.commit()
    google_returns()

    assert callback(client).headers["location"].endswith("/home")
    user = db.scalar(select(User))
    assert (user.email, user.display_name, user.status) == ("nino.beridze@iliauni.edu.ge", "Nino Beridze", "active")
    assert db.scalars(select(RoleAssignment.role)).all() == ["member"]


def test_cancelled_at_google(client):
    assert_denied(client.get("/api/v1/auth/google/callback?error=access_denied", follow_redirects=False),
                  "cancelled")


# --- session ------------------------------------------------------------------------------------

def test_me_requires_sign_in(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_logout_revokes_the_session(client, db, make_user, google_returns):
    make_user()
    google_returns()
    callback(client)
    token = client.cookies["pea_session"]

    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    client.cookies.set("pea_session", token)  # an old copy of the cookie no longer works
    assert client.get("/api/v1/auth/me").status_code == 401
    assert db.scalar(select(UserSession.revoked_at)) is not None


# --- audit --------------------------------------------------------------------------------------

def test_attempts_are_audited_in_a_hash_chain(client, db, make_user, google_returns):
    make_user()
    google_returns(email_verified=False)
    callback(client)
    google_returns()
    callback(client)
    client.post("/api/v1/auth/logout")

    rows = db.scalars(select(AuditLog).order_by(AuditLog.id)).all()
    assert [(r.action, r.reason) for r in rows] == [
        ("auth.login.denied", "email_not_verified"), ("auth.login.succeeded", None), ("auth.logout", None)]
    assert rows[0].prev_hash is None
    assert all(rows[i].prev_hash == rows[i - 1].row_hash for i in range(1, len(rows)))


def test_audit_log_cannot_be_edited(db, org):
    audit.record(db, "test", entity_type="x", actor_kind="system")
    db.commit()
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(text("update audit_log set action = 'hidden'"))
