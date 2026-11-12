from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# Synchronous on purpose: psycopg's async mode doesn't run on Windows' default event loop.
# FastAPI runs sync endpoints and dependencies in a thread pool, so requests still run concurrently.
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db
