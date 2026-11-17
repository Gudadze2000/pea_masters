"""Cache of Web of Science look-ups by DOI, so the same article isn't fetched from Clarivate again and again
(the Starter API allows 20,000 requests a day).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-17
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table wos_lookups (
          doi text primary key,
          record jsonb,
          fetched_at timestamptz not null default now(),
          constraint wos_lookups_doi_check check (doi = lower(doi) and doi like '10.%')
        );
        comment on table wos_lookups is 'Web of Science Starter API answers by DOI. Refreshed after a few days.';
        comment on column wos_lookups.doi is 'Normalized: lower case, without https://doi.org/';
        comment on column wos_lookups.record is 'The first matching Web of Science record as returned; null: not indexed';
    """)


def downgrade() -> None:
    op.execute("drop table wos_lookups")
