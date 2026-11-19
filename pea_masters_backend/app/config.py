import logging
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)

# Values that only make sense on a developer's own computer
_DEV_DATABASE_PASSWORD = ":pea@"
_MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    """Read from environment variables, falling back to the .env file next to pyproject.toml."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_client_id: str
    google_client_secret: str
    public_url: str = "http://localhost:5173"
    session_secret: str
    database_url: str = "postgresql+psycopg://pea:pea@127.0.0.1:5434/pea"
    secure_cookies: bool = False
    session_hours: int = 12
    # Uploaded files (photos, documents). A folder for now; object storage (S3-compatible) on a server later.
    storage_dir: str = "storage"
    # Clarivate Web of Science Starter API (app/wos.py). Empty: article checks are switched off.
    clarivate_api_key: str = ""
    wos_starter_url: str = "https://api.clarivate.com/apis/wos-starter/v1"
    # Optional project contact address for Crossref's "polite" pool (app/crossref.py). Never a person's own address.
    crossref_mailto: str = ""
    crossref_url: str = "https://api.crossref.org"
    # ORCID Public API (app/orcid.py). Empty client: "Connect ORCID" and the works import are switched off.
    orcid_client_id: str = ""
    orcid_client_secret: str = ""
    orcid_base_url: str = "https://orcid.org"  # https://sandbox.orcid.org for testing
    orcid_api_url: str = ""  # default: the public API next to orcid_base_url (pub.orcid.org/v3.0)
    orcid_redirect_uri: str = ""  # default: PUBLIC_URL + /api/v1/orcid/callback
    # Interactive API documentation at /api/docs. Unset: on in development, off in production.
    api_docs: bool | None = None

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.public_url.rstrip('/')}/api/v1/auth/google/callback"

    @property
    def production(self) -> bool:
        """Served over https at a real address: everything below must be set up for real use"""
        return self.public_url.startswith("https://")

    @property
    def docs_enabled(self) -> bool:
        return self.api_docs if self.api_docs is not None else not self.production

    @model_validator(mode="after")
    def _ready_for_production(self) -> "Settings":
        """On an https address, refuse to start with development values rather than run unsafely."""
        if not self.production:
            return self
        problems = []
        if not self.secure_cookies:
            problems.append("SECURE_COOKIES must be true, so sign-in cookies are only sent over https")
        if len(self.session_secret) < _MIN_SECRET_LENGTH:
            problems.append(f"SESSION_SECRET must be a long random value (at least {_MIN_SECRET_LENGTH} characters); "
                            'generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"')
        if _DEV_DATABASE_PASSWORD in self.database_url:
            problems.append("DATABASE_URL still uses the development password; give the database a strong one")
        if not (self.google_client_id and self.google_client_secret):
            problems.append("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are needed for sign-in")
        if problems:
            raise ValueError("PEA isn't configured for production:\n- " + "\n- ".join(problems))
        if self.orcid_client_id and "sandbox." in self.orcid_base_url:
            log.warning("ORCID uses the sandbox (ORCID_BASE_URL): iDs connected there aren't real ORCID iDs")
        if "github.io" in self.orcid_redirect_uri:
            log.warning("ORCID_REDIRECT_URI is the development forwarding page; register %s/api/v1/orcid/callback",
                        self.public_url.rstrip("/"))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
