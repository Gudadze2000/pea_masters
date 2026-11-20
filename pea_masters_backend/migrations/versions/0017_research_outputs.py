"""Research outputs on the profile: publications, datasets, and software and code.

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-20
"""

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table research_outputs (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references users (id) on delete cascade,
          kind text not null,
          subtype text not null,
          status text not null default 'Published',
          title text not null,
          authors text not null default '',
          venue text not null default '',
          year smallint,
          volume text not null default '',
          issue text not null default '',
          pages text not null default '',
          version text not null default '',
          license text not null default '',
          doi text not null default '',
          url text not null default '',
          description text not null default '',
          source text not null default 'manual',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint research_outputs_kind_check check (kind in ('publication', 'dataset', 'software')),
          constraint research_outputs_source_check check (source in ('manual', 'doi', 'wos', 'orcid', 'bibtex', 'cv'))
        );
        create index research_outputs_user_idx on research_outputs (user_id);
        create unique index research_outputs_one_per_doi on research_outputs (user_id, lower(doi)) where doi <> '';
        comment on table research_outputs is 'A person''s publications, datasets and software (app/research_outputs.py)';
        comment on column research_outputs.venue is 'Journal, conference or book; for datasets and software, the '
          'repository or publisher';
        comment on column research_outputs.source is 'How it was added: by hand, by DOI, imported from Web of Science, '
          'ORCID or BibTeX, or moved over from the CV builder';
    """)


def downgrade() -> None:
    op.execute("drop table research_outputs;")
