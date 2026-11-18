"""Profile sections stored on the server: qualification entries (education, awards, languages, video lectures, ...)
with their supporting documents, and the Research and Teaching parts of the profile. The profile is the person's own:
nothing on it is reviewed (only the evaluation form is).

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-18
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        create table profile_entries (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references users (id) on delete restrict,
          section text not null,
          entry_values jsonb not null default '{}',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create index profile_entries_user_section_idx on profile_entries (user_id, section);
        comment on table profile_entries is 'One entry of a profile section (app/profile_entries.py). entry_values holds '
          'the form fields as {name: text}; the fields per section are defined by the frontend (sections.ts).';

        create table profile_entry_files (
          entry_id uuid not null references profile_entries (id) on delete cascade,
          file_id uuid not null references files (id) on delete restrict,
          position smallint not null default 0,
          primary key (entry_id, file_id)
        );
        create index profile_entry_files_file_id_idx on profile_entry_files (file_id);
        comment on table profile_entry_files is 'Supporting documents attached to a profile entry';

        alter table profiles add column research jsonb not null default '{}';
        alter table profiles add column teaching jsonb not null default '{}';
        comment on column profiles.research is '{"interests": [...], "projects": [...], "collaborations": [...], '
          '"organisations": [...]}';
        comment on column profiles.teaching is '{"interests": [...]}; programmes and students will come from Argus';

        alter table files add column purpose text not null default 'photo'
          constraint files_purpose_check check (purpose in ('photo', 'document'));
        comment on column files.purpose is 'photo: shown inside the organization; '
          'document: the owner, Admins of their organization and their head of department';
    """)


def downgrade() -> None:
    op.execute("""
        alter table files drop column purpose;
        alter table profiles drop column teaching;
        alter table profiles drop column research;
        drop table profile_entry_files;
        drop table profile_entries;
    """)
