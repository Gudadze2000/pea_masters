from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.public_url.rstrip('/')}/api/v1/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
