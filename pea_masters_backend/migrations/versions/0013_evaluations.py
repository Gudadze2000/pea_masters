"""Evaluations sent to researchers: one per researcher and period, with the form as it was when sent, the entries the
researcher adds, and the evidence attached to them.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-19
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table evaluations (
          id uuid primary key default gen_random_uuid(),
          organization_id uuid not null references organizations (id) on delete restrict,
          period_id uuid not null references evaluation_periods (id) on delete restrict,
          user_id uuid not null references users (id) on delete restrict,
          form_ref text not null,
          form_name text not null,
          form_name_ka text not null default '',
          form_structure jsonb not null,
          sent_by uuid not null references users (id) on delete restrict,
          sent_at timestamptz not null default now(),
          started_at timestamptz,
          state text not null default 'draft',
          submitted_at timestamptz,
          submission jsonb,
          withdrawn_at timestamptz,
          updated_at timestamptz not null default now(),
          constraint evaluations_state_check check (state in ('draft', 'submitted', 'updating')),
          constraint evaluations_submitted_check check ((state = 'draft') = (submitted_at is null))
        );
        create unique index evaluations_one_per_period on evaluations (period_id, user_id) where withdrawn_at is null;
        create index evaluations_user_idx on evaluations (user_id) where withdrawn_at is null;
        comment on table evaluations is 'A form sent to one researcher for one evaluation period (app/sent_evaluations.py)';
        comment on column evaluations.form_ref is 'The form it was sent with: a built-in key or a custom form''s id';
        comment on column evaluations.form_structure is 'The form as it was when sent; changing the form later '
          'doesn''t change it';
        comment on column evaluations.started_at is 'When the researcher added their first entry; until then the '
          'coordinator can replace the form or withdraw it';
        comment on column evaluations.state is 'draft: never submitted; submitted; updating: reopened after '
          'submitting (the coordinator still sees the submission)';
        comment on column evaluations.submission is 'The entries as last submitted';

        create table evaluation_entries (
          id uuid primary key default gen_random_uuid(),
          evaluation_id uuid not null references evaluations (id) on delete cascade,
          item_id text not null,
          description text not null,
          detail text not null default '',
          points numeric(8, 2),
          hidden boolean not null default false,
          status text not null default 'draft',
          review_comment text,
          wos jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint evaluation_entries_status_check check (status in ('draft', 'submitted', 'approved', 'rejected'))
        );
        create index evaluation_entries_evaluation_idx on evaluation_entries (evaluation_id);
        comment on column evaluation_entries.item_id is 'The form item (in evaluations.form_structure) it belongs to';
        comment on column evaluation_entries.hidden is 'Kept but not sent with the form, and not counted';
        comment on column evaluation_entries.wos is 'The Web of Science check of its DOI when it was saved';

        create table evaluation_entry_files (
          entry_id uuid not null references evaluation_entries (id) on delete cascade,
          file_id uuid not null references files (id) on delete restrict,
          position smallint not null default 0,
          primary key (entry_id, file_id)
        );
    """)


def downgrade() -> None:
    op.execute("""
        drop table evaluation_entry_files;
        drop table evaluation_entries;
        drop table evaluations;
    """)
