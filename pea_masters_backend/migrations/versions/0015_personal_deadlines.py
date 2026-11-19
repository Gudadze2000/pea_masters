"""A personal deadline: an Admin can give one researcher more time than the period allows.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-19
"""

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        alter table evaluations add column deadline_override date;
        comment on column evaluations.deadline_override is 'Set by an Admin: this person can submit until the end of '
          'this day (Tbilisi time), after the period''s own deadline';
    """)


def downgrade() -> None:
    op.execute("alter table evaluations drop column deadline_override;")
