"""Profiles (General information) and uploaded files, from the PEA schema.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-13
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
create type scan_status as enum ('pending', 'clean', 'infected', 'failed');

create table files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  owner_user_id uuid not null,
  storage_key text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 char(64) not null,
  scan_status scan_status not null default 'pending',
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text,
  constraint files_check_1 check (size_bytes > 0)
);
create table profiles (
  user_id uuid primary key,
  biography jsonb not null default '{}',
  photo_file_id uuid,
  is_public boolean not null default false,
  public_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table files add constraint files_organization_id_fkey foreign key (organization_id) references organizations (id) on delete restrict;
alter table files add constraint files_owner_user_id_fkey foreign key (owner_user_id) references users (id) on delete restrict;
alter table files add constraint files_deleted_by_fkey foreign key (deleted_by) references users (id) on delete restrict;
alter table profiles add constraint profiles_user_id_fkey foreign key (user_id) references users (id) on delete restrict;
alter table profiles add constraint profiles_photo_file_id_fkey foreign key (photo_file_id) references files (id) on delete restrict;

create index files_organization_id_idx on files (organization_id);
create index files_owner_user_id_idx on files (owner_user_id);
create index files_deleted_by_idx on files (deleted_by);
create index profiles_photo_file_id_idx on profiles (photo_file_id);

comment on table profiles is 'General Information. One per user, shared by every organization the person belongs to.';
comment on column profiles.biography is '{"ka": html, "en": html}, sanitised on save';
comment on table files is 'Metadata only. The bytes live in storage (storage_key) and are served through the API after a permission check.';
comment on column files.mime_type is 'Detected from the content';
""")


def downgrade() -> None:
    op.execute("""
drop table if exists profiles, files cascade;
drop type if exists scan_status;
""")
