"""Remember where each person's display name came from, so Google's official name can replace a name typed at
registration without ever overwriting a deliberate correction.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-13
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        alter table users add column name_source text not null default 'registration'
          constraint users_name_source_check check (name_source in ('registration', 'google', 'manual'));
        comment on column users.name_source is
          'registration: typed or guessed when registered (Google''s name replaces it at sign-in); '
          'google: the official name from the Google directory (kept in sync); '
          'manual: corrected by a person (never overwritten)';
    """)


def downgrade() -> None:
    op.execute("alter table users drop column name_source")
