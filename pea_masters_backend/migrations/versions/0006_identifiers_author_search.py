"""Researcher identifiers (ORCID, Web of Science ResearcherID, Scopus Author ID) on the profile, and a cache of
Web of Science searches for a researcher's documents.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-17
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        alter table profiles add column identifiers jsonb not null default '{}';
        comment on column profiles.identifiers is '{"orcid": "0000-0002-1825-0097", "researcher_id": "ABC-1234-2020", '
          '"scopus_id": "57190000000"}, checked on save';

        create table wos_author_searches (
          query text primary key,
          total integer not null,
          hits jsonb not null,
          fetched_at timestamptz not null default now()
        );
        comment on table wos_author_searches is 'Web of Science Starter API answers for a researcher''s documents, '
          'by query. Refreshed after a day.';
    """)


def downgrade() -> None:
    op.execute("""
        drop table wos_author_searches;
        alter table profiles drop column identifiers;
    """)
