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

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.public_url.rstrip('/')}/api/v1/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
