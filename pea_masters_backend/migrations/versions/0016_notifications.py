"""Notifications: what happened that concerns someone, shown under the bell in the app.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-19
"""

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table notifications (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references users (id) on delete cascade,
          organization_id uuid references organizations (id) on delete cascade,
          kind text not null,
          title text not null,
          detail text not null default '',
          link text,
          entry_ref jsonb,
          dedupe_key text,
          created_at timestamptz not null default now(),
          read_at timestamptz
        );
        create index notifications_user_idx on notifications (user_id, created_at desc);
        create unique index notifications_once on notifications (user_id, dedupe_key) where dedupe_key is not null;
        comment on table notifications is 'In-app notifications (app/notifications.py)';
        comment on column notifications.link is 'The page it opens, e.g. /evaluation-form';
        comment on column notifications.entry_ref is 'An evaluation entry it is about: {"recordId", "entryId"}, so the '
          'app can open that entry';
        comment on column notifications.dedupe_key is 'Set on reminders, so each is sent once';
    """)


def downgrade() -> None:
    op.execute("drop table notifications;")
