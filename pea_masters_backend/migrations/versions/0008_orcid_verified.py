"""When the person proved their ORCID iD by signing in to ORCID ("Connect ORCID"). Null: typed in, not proven.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-18
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        alter table profiles add column orcid_verified_at timestamptz;
        comment on column profiles.orcid_verified_at is
          'Set when identifiers->>orcid was confirmed by signing in to ORCID; cleared when the iD changes';
    """)


def downgrade() -> None:
    op.execute("alter table profiles drop column orcid_verified_at")
