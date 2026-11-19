"""Coordinators' evaluation forms get a Georgian name next to the English one.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-19
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        alter table evaluation_forms add column name_ka text not null default '';
        comment on column evaluation_forms.name is 'The form''s name in English';
        comment on column evaluation_forms.name_ka is 'The form''s name in Georgian (optional)';
        create index evaluation_forms_owner_idx on evaluation_forms (owner_user_id) where archived_at is null;
    """)


def downgrade() -> None:
    op.execute("""
        drop index evaluation_forms_owner_idx;
        alter table evaluation_forms drop column name_ka;
    """)
