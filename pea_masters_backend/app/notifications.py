"""In-app notifications: what happened that concerns someone, shown under the bell.

They're written by the actions that cause them, in the same transaction (`notify`):

    Researcher    a form was sent to them or changed · an entry was rejected · their form was returned, approved or
                  reopened · their deadline was extended (or the extension removed) · the deadline is a week away and
                  they haven't submitted (made when they next look, once per evaluation and deadline)
    Coordinator   one of their researchers submitted or resubmitted

Nobody is told about their own actions. Email will come later; for now these are only in the app."""

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import func, literal, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.sessions import current_user
from app.authz import target_user_id_in_scope
from app.db import get_db
from app.errors import problem
from app.models import CoordinatorAssignment, Notification, User

router = APIRouter(tags=["notifications"])

Kind = Literal["form_sent", "form_changed", "entry_rejected", "form_returned", "form_approved", "form_reopened",
               "deadline_extended", "deadline_soon", "form_submitted"]

REMINDER_DAYS = 7  # how long before the deadline the reminder comes
LISTED = 100  # newest ones listed; older ones stay in the database


def notify(db: Session, user_id: uuid.UUID, organization_id: uuid.UUID | None, kind: Kind, title: str,
           detail: str = "", link: str | None = None, entry_ref: dict[str, Any] | None = None,
           dedupe_key: str | None = None) -> None:
    """Adds a notification to the caller's transaction; it's saved when the caller commits. With a dedupe_key, a
    second one with the same key is quietly skipped."""
    statement = insert(Notification).values(
        user_id=user_id, organization_id=organization_id, kind=kind, title=title[:300], detail=detail[:2000],
        link=link, entry_ref=entry_ref, dedupe_key=dedupe_key)
    if dedupe_key:
        statement = statement.on_conflict_do_nothing(
            index_elements=[Notification.user_id, Notification.dedupe_key],
            index_where=Notification.dedupe_key.is_not(None))
    db.execute(statement)


def reviewers_of(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> list[uuid.UUID]:
    """The coordinators who review this person: the same rule that lets them review (app/authz.py)"""
    coordinators = db.scalars(select(CoordinatorAssignment.coordinator_user_id).distinct().where(
        CoordinatorAssignment.organization_id == org_id, CoordinatorAssignment.ends_on.is_(None),
        CoordinatorAssignment.coordinator_user_id != user_id)).all()
    return [c for c in coordinators
            if db.scalar(select(literal(True)).where(target_user_id_in_scope(c, org_id, user_id)))]


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    detail: str
    link: str | None
    entry_ref: dict[str, Any] | None
    created_at: datetime
    read: bool


class NotificationsOut(BaseModel):
    items: list[NotificationOut]  # newest first
    unread: int


@router.get("/api/v1/me/notifications", response_model=NotificationsOut)
def my_notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.sent_evaluations import add_deadline_reminders  # here, not at the top: it notifies through this module
    if add_deadline_reminders(db, user):
        db.commit()
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id)
                      .order_by(Notification.created_at.desc(), Notification.id).limit(LISTED)).all()
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None)))
    return NotificationsOut(unread=unread or 0, items=[
        NotificationOut(id=n.id, kind=n.kind, title=n.title, detail=n.detail, link=n.link, entry_ref=n.entry_ref,
                        created_at=n.created_at, read=n.read_at is not None) for n in rows])


@router.post("/api/v1/me/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    found = db.get(Notification, notification_id)
    if found is None or found.user_id != user.id:
        raise problem(status.HTTP_404_NOT_FOUND, "not_found", "Notification not found.")
    if found.read_at is None:
        found.read_at = func.now()
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api/v1/me/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=func.now()))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
