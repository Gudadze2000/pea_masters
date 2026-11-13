"""End-to-end tests: a real browser drives the real app (backend + frontend) against a throwaway database.

Run on their own (Docker Desktop must be running), not together with tests/api, which uses another database:
    uv run pytest tests/e2e                          # headless
    uv run pytest tests/e2e --headed --slowmo 400    # watch it in a browser window

Nothing touches your development data: the tests use the pea_e2e database and their own servers on ports
8011 (API) and 5180 (app). Google's own sign-in page can't be automated, so sign-in starts from a session
(admin) or from verified Google claims handed to the same code the real callback uses (new people).
"""

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

E2E_DB = "postgresql+psycopg://pea:pea@127.0.0.1:5434/pea_e2e"
API_PORT, APP_PORT = 8011, 5180  # away from the usual 8000/5173 and Vite's fallback ports
APP_URL = f"http://localhost:{APP_PORT}"

if "app.db" in sys.modules:  # tests/api already pointed the app at pea_test in this run
    raise RuntimeError("Run the browser tests on their own: uv run pytest tests/e2e")
os.environ["DATABASE_URL"] = E2E_DB
os.environ["PUBLIC_URL"] = APP_URL
os.environ.setdefault("GOOGLE_CLIENT_ID", "e2e-client.apps.googleusercontent.com")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "e2e-secret")
os.environ.setdefault("SESSION_SECRET", "e2e-session-secret")
os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="pea-e2e-storage-")  # uploads go to a throwaway folder

import psycopg  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import func, text  # noqa: E402

from app.auth.google import complete_login  # noqa: E402
from app.auth.sessions import COOKIE_NAME, create_session  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.models import Organization, OrganizationDomain, OrganizationMembership, RoleAssignment, User  # noqa: E402

BACKEND = Path(__file__).parents[2]
FRONTEND = BACKEND.parent / "pea_masters_frontend"
SCREENSHOTS = Path(__file__).parent / "screenshots"


def port_free(port: int) -> bool:
    """Free on both IPv4 and IPv6 (Vite listens on ::1 when started with "localhost")."""
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        with socket.socket(family) as s:
            if s.connect_ex((host, port)) == 0:
                return False
    return True


def wait_for(url: str, process: subprocess.Popen, name: str, seconds: int = 60) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"{name} exited early with code {process.returncode}")
        try:
            urllib.request.urlopen(url, timeout=2)
            return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"{name} didn't start within {seconds}s ({url})")


def stop(process: subprocess.Popen) -> None:
    """Stops a server and its child processes (`bun run dev` starts Vite as a child, which would outlive bun)."""
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(process.pid)], capture_output=True)
    else:
        process.terminate()
    try:
        process.wait(10)
    except subprocess.TimeoutExpired:
        process.kill()


@pytest.fixture(scope="session")
def database():
    """Fresh pea_e2e database built by the real migrations."""
    try:
        with psycopg.connect("host=127.0.0.1 port=5434 user=pea password=pea dbname=pea connect_timeout=5",
                             autocommit=True) as conn:
            if not conn.execute("select 1 from pg_database where datname = 'pea_e2e'").fetchone():
                conn.execute("create database pea_e2e owner pea")
    except psycopg.OperationalError as error:
        pytest.exit(f"PostgreSQL isn't reachable on 127.0.0.1:5434. Start it with: docker compose up -d\n{error}")
    with engine.begin() as conn:
        conn.execute(text("drop schema public cascade; create schema public"))
    config = Config(str(BACKEND / "alembic.ini"))
    config.attributes["database_url"] = E2E_DB
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def servers(database):
    for port in (API_PORT, APP_PORT):
        if not port_free(port):
            pytest.exit(f"Port {port} is in use. Stop whatever runs there and try again.")
    bun = shutil.which("bun")
    if bun is None:
        pytest.exit("Bun isn't on PATH; it's needed to run the frontend.")
    env = {**os.environ, "DATABASE_URL": E2E_DB, "PUBLIC_URL": APP_URL, "PEA_API_URL": f"http://127.0.0.1:{API_PORT}"}
    logs = Path(__file__).parent / "logs"
    logs.mkdir(exist_ok=True)
    api = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                            "--port", str(API_PORT)], cwd=BACKEND, env=env,
                           stdout=open(logs / "api.log", "w"), stderr=subprocess.STDOUT)
    app = subprocess.Popen([bun, "run", "dev", "--port", str(APP_PORT), "--strictPort"], cwd=FRONTEND, env=env,
                           stdout=open(logs / "app.log", "w"), stderr=subprocess.STDOUT)
    try:
        wait_for(f"http://127.0.0.1:{API_PORT}/api/v1/health", api, "API")
        wait_for(f"{APP_URL}/api/v1/health", app, "Frontend dev server")  # also proves the proxy works
        yield
    finally:
        for process in (app, api):
            stop(process)


@pytest.fixture(scope="session")
def organization(database):
    """Ilia State University with its verified domain and one Admin, like scripts/seed.py makes."""
    with SessionLocal() as db:
        org = Organization(slug="iliauni", name={"en": "Ilia State University", "ka": "ილიას სახელმწიფო უნივერსიტეტი"},
                           kind="university")
        db.add(org)
        db.flush()
        db.add(OrganizationDomain(organization_id=org.id, domain="iliauni.edu.ge", verified_at=func.now()))
        admin = User(email="e2e.admin@iliauni.edu.ge", display_name="Test Admin", status="active")
        db.add(admin)
        db.flush()
        db.add(OrganizationMembership(user_id=admin.id, organization_id=org.id))
        for role in ("admin", "member"):
            db.add(RoleAssignment(user_id=admin.id, organization_id=org.id, role=role))
        db.commit()
        return {"org_id": org.id, "admin_id": admin.id}


def session_cookie(token: str) -> dict:
    return {"name": COOKIE_NAME, "value": token, "url": APP_URL}


@pytest.fixture
def admin_page(browser, servers, organization):
    """A browser tab signed in as the Admin."""
    with SessionLocal() as db:
        token, _ = create_session(db, organization["admin_id"], None, "e2e")
        db.commit()
    context = browser.new_context(base_url=APP_URL, viewport={"width": 1400, "height": 900})
    context.add_cookies([session_cookie(token)])
    yield context.new_page()
    context.close()


@pytest.fixture
def google_sign_in(browser, servers):
    """Signs someone in as if Google had returned these verified claims; returns their browser tab."""
    contexts = []

    def sign_in(email: str, name: str):
        claims = {"sub": f"google-{email}", "email": email, "email_verified": True, "hd": email.split("@")[1],
                  "name": name, "given_name": name.split()[0], "family_name": name.split()[-1]}
        token, error = complete_login(claims, None, "e2e")
        assert token, f"sign-in refused: {error}"
        context = browser.new_context(base_url=APP_URL, viewport={"width": 1400, "height": 900})
        context.add_cookies([session_cookie(token)])
        contexts.append(context)
        return context.new_page()

    yield sign_in
    for context in contexts:
        context.close()


@pytest.fixture
def shot():
    SCREENSHOTS.mkdir(exist_ok=True)

    def take(page, name: str):
        page.screenshot(path=SCREENSHOTS / f"{name}.png", full_page=True)
    return take
