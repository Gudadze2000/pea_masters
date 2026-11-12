"""Append-only audit trail. Each row stores the hash of the previous row, so editing or removing
history breaks the chain and is detectable (the table also rejects UPDATE/DELETE via a trigger)."""

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    db: Session,
    action: str,
    *,
    entity_type: str,
    entity_id: str | uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    actor_kind: str = "user",
    organization_id: uuid.UUID | None = None,
    after: dict[str, Any] | None = None,
    reason: str | None = None,
    ip: str | None = None,
) -> None:
    """Adds an audit row to the caller's transaction; it's saved when the caller commits."""
    # One writer at a time, so two rows can't both claim the same previous hash
    db.execute(text("select pg_advisory_xact_lock(hashtext('audit_log'))"))
    prev_hash = db.scalar(select(AuditLog.row_hash).order_by(AuditLog.id.desc()).limit(1))
    occurred_at = datetime.now(UTC)
    row = {
        "occurred_at": occurred_at.isoformat(),
        "actor_kind": actor_kind,
        "actor_user_id": str(actor_user_id) if actor_user_id else None,
        "organization_id": str(organization_id) if organization_id else None,
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
        "after": after,
        "reason": reason,
        "ip": ip,
    }
    row_hash = hashlib.sha256(
        ((prev_hash or "") + json.dumps(row, sort_keys=True, default=str)).encode()
    ).hexdigest()
    db.add(AuditLog(
        occurred_at=occurred_at, actor_kind=actor_kind, actor_user_id=actor_user_id,
        organization_id=organization_id, action=action, entity_type=entity_type,
        entity_id=row["entity_id"], after=after, reason=reason, ip=ip,
        prev_hash=prev_hash, row_hash=row_hash,
    ))
