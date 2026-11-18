"""The CV builder's CV, one per person, stored on the server instead of the browser.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-18
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table cvs (
          user_id uuid primary key references users (id) on delete restrict,
          data jsonb not null,
          updated_at timestamptz not null default now()
        );
        comment on table cvs is 'The CV builder document (app/cv.py): statement, links, publications, talks, layout, '
          'visibility. Profile entries shown on the CV are read from profile_entries, not copied here.';
    """)


def downgrade() -> None:
    op.execute("drop table cvs")
