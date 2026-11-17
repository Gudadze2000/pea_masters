"""A small cache for answers from outside services (Crossref, Web of Science journals, ORCID, ...), so the same
question isn't sent twice within a while. Failures are never cached: only answers, including "found nothing"."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import ExternalLookup

Record = dict[str, Any] | None


def cached(db: Session, source: str, key: str, fetch: Callable[[], Record],
           found_for: timedelta, missing_for: timedelta) -> tuple[Record, datetime]:
    """The cached answer while it's fresh, otherwise fetch() (which raises on failure) and store its answer.
    Returns (record, when it was fetched)."""
    now = datetime.now(UTC)
    row = db.get(ExternalLookup, (source, key))
    if row and now - row.fetched_at < (found_for if row.record is not None else missing_for):
        return row.record, row.fetched_at
    record = fetch()
    statement = insert(ExternalLookup).values(source=source, key=key, record=record, fetched_at=now)
    db.execute(statement.on_conflict_do_update(index_elements=[ExternalLookup.source, ExternalLookup.key],
                                               set_={"record": statement.excluded.record, "fetched_at": now}))
    db.commit()
    return record, now
