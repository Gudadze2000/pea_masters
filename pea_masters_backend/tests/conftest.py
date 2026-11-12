import os
from pathlib import Path

# Configure before the app is imported: tests use their own database and never the real Google client
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://pea:pea@127.0.0.1:5434/pea_test")
os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-secret"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["PUBLIC_URL"] = "http://localhost:5173"
os.environ["SECURE_COOKIES"] = "false"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import func, text  # noqa: E402

from app.auth import google  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Organization, OrganizationDomain, OrganizationMembership, RoleAssignment, User  # noqa: E402

TABLES = ("audit_log, coordinator_assignments, affiliations, positions, organization_units, unit_types, "
          "role_assignments, organization_memberships, sessions, password_credentials, "
          "auth_identities, identity_providers, organization_domains, organizations, users")


@pytest.fixture(scope="session", autouse=True)
def schema():
    """Fresh schema built by the real migrations, so tests also check them."""
    with engine.begin() as conn:
        conn.execute(text("drop schema public cascade; create schema public"))
    command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")


@pytest.fixture(autouse=True)
def clean():
    with engine.begin() as conn:
        conn.execute(text(f"truncate {TABLES} restart identity cascade"))  # truncate skips the append-only trigger


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app, base_url="http://localhost:5173") as c:
        yield c


@pytest.fixture
def org(db):
    org = Organization(slug="iliauni", name={"en": "Ilia State University"}, kind="university")
    db.add(org)
    db.flush()
    db.add(OrganizationDomain(organization_id=org.id, domain="iliauni.edu.ge", verified_at=func.now()))
    db.commit()
    return org


@pytest.fixture
def make_user(db, org):
    def make(email="nino.beridze@iliauni.edu.ge", roles=("member",), membership="active", status="invited"):
        user = User(email=email, display_name="Nino Beridze", status=status)
        db.add(user)
        db.flush()
        db.add(OrganizationMembership(user_id=user.id, organization_id=org.id, status=membership))
        for role in roles:
            db.add(RoleAssignment(user_id=user.id, organization_id=org.id, role=role))
        db.commit()
        return user
    return make


@pytest.fixture
def google_returns(monkeypatch):
    """Makes the callback receive these ID-token claims, as if Google had verified them."""
    def set_claims(**overrides):
        claims = {"sub": "google-sub-1", "email": "nino.beridze@iliauni.edu.ge", "email_verified": True,
                  "hd": "iliauni.edu.ge", "name": "Nino Beridze", "given_name": "Nino", "family_name": "Beridze"}
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}

        async def fake_exchange(request):
            return {"userinfo": claims}
        monkeypatch.setattr(google.oauth.google, "authorize_access_token", fake_exchange)
    return set_claims


@pytest.fixture
def signed_in():
    """Returns a new client signed in as the given user (each client has its own cookies)."""
    from app.auth.sessions import COOKIE_NAME, create_session

    clients = []

    def sign_in(user):
        with SessionLocal() as session:
            raw, _ = create_session(session, user.id, None, "pytest")
            session.commit()
        c = TestClient(app, base_url="http://localhost:5173")
        c.cookies.set(COOKIE_NAME, raw)
        clients.append(c)
        return c
    yield sign_in
    for c in clients:
        c.close()
