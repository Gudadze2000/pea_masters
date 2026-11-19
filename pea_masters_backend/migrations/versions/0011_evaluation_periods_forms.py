"""Evaluation periods, set by an organization's Admins, and evaluation forms created by coordinators. The ISU
self-assessment form is built in (app/evaluation_forms/isu_self_assessment.json) and isn't stored here.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-19
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table evaluation_periods (
          id uuid primary key default gen_random_uuid(),
          organization_id uuid not null references organizations (id) on delete restrict,
          name text not null,
          starts_on date not null,
          ends_on date not null,
          publication_from smallint not null,
          publication_to smallint not null,
          created_by uuid not null references users (id) on delete restrict,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          archived_at timestamptz,
          constraint evaluation_periods_dates_check check (starts_on <= ends_on),
          constraint evaluation_periods_years_check check (publication_from <= publication_to)
        );
        create index evaluation_periods_organization_idx on evaluation_periods (organization_id);
        comment on table evaluation_periods is 'An evaluation round, e.g. Annual evaluation 2025-2026 (app/evaluations.py)';
        comment on column evaluation_periods.ends_on is 'The deadline: forms can be submitted until the end of this day, '
          'Tbilisi time';
        comment on column evaluation_periods.publication_from is 'First publication year that counts';

        create table evaluation_forms (
          id uuid primary key default gen_random_uuid(),
          organization_id uuid not null references organizations (id) on delete restrict,
          owner_user_id uuid not null references users (id) on delete restrict,
          name text not null,
          description text not null default '',
          structure jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          archived_at timestamptz
        );
        create index evaluation_forms_organization_idx on evaluation_forms (organization_id);
        comment on table evaluation_forms is 'Forms coordinators create and send to their researchers: parts, items, '
          'points and limits in structure (same shape as the built-in ISU form)';
    """)


def downgrade() -> None:
    op.execute("""
        drop table evaluation_forms;
        drop table evaluation_periods;
    """)
