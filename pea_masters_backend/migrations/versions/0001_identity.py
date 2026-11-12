"""Identity and access: organizations, domains, users, Google/password identities, sessions,
memberships, role assignments and the audit log.

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""

from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL = Path(__file__).parent.parent / "sql"


def upgrade() -> None:
    op.execute((SQL / "0001_identity_up.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute((SQL / "0001_identity_down.sql").read_text(encoding="utf-8"))
