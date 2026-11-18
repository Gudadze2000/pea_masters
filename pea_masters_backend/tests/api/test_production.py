"""Production readiness (app/config.py, app/main.py): on an https address PEA refuses development settings; every API
response carries security headers; the health check covers the database."""

import pytest
from pydantic import ValidationError

from app.config import Settings

GOOD = {
    "public_url": "https://pea.example.edu", "secure_cookies": True,
    "session_secret": "k" * 48, "google_client_id": "id.apps.googleusercontent.com", "google_client_secret": "secret",
    "database_url": "postgresql+psycopg://pea:Long-Strong-Password-1@db:5432/pea",
}


def settings(**changes) -> Settings:
    return Settings(_env_file=None, **{**GOOD, **changes})


def test_production_settings_are_accepted():
    ready = settings()
    assert ready.production and not ready.docs_enabled  # API docs off in production by default
    assert settings(api_docs=True).docs_enabled


@pytest.mark.parametrize("change, complaint", [
    ({"secure_cookies": False}, "SECURE_COOKIES"),
    ({"session_secret": "short"}, "SESSION_SECRET"),
    ({"database_url": "postgresql+psycopg://pea:pea@127.0.0.1:5434/pea"}, "DATABASE_URL"),
    ({"google_client_secret": ""}, "GOOGLE_CLIENT_ID"),
])
def test_development_values_are_refused_on_an_https_address(change, complaint):
    with pytest.raises(ValidationError) as refused:
        settings(**change)
    assert complaint in str(refused.value)


def test_development_on_http_is_not_checked():
    local = settings(public_url="http://localhost:5173", secure_cookies=False, session_secret="dev",
                     database_url="postgresql+psycopg://pea:pea@127.0.0.1:5434/pea")
    assert not local.production and local.docs_enabled


def test_sandbox_orcid_in_production_is_only_a_warning(caplog):
    settings(orcid_client_id="APP-X", orcid_base_url="https://sandbox.orcid.org",
             orcid_redirect_uri="https://someone.github.io/pea-orcid/callback/")
    assert "sandbox" in caplog.text and "forwarding page" in caplog.text


def test_api_responses_carry_security_headers(client):
    response = client.get("/api/v1/auth/me")  # even a refusal
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Cache-Control"] == "no-store"
    assert "Strict-Transport-Security" not in response.headers  # only on https


def test_health_checks_the_database(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
