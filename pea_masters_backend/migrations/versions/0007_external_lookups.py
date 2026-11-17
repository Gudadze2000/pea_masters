"""One cache for answers from outside services that don't need their own table (Crossref works, Web of Science
journals), keyed by source and look-up key.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-17
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table external_lookups (
          source text not null,
          key text not null,
          record jsonb,
          fetched_at timestamptz not null default now(),
          primary key (source, key)
        );
        comment on table external_lookups is 'Cached answers from outside services (app/lookups.py). '
          'record is null when the service found nothing.';
        comment on column external_lookups.source is 'crossref.work, wos.journal, ...';
    """)


def downgrade() -> None:
    op.execute("drop table external_lookups")
