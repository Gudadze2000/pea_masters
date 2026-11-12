"""Organization structure: departments, affiliations and Coordinator assignments.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-12
"""

from pathlib import Path

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

SQL = Path(__file__).parent.parent / "sql"


def upgrade() -> None:
    op.execute((SQL / "0002_structure_up.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute((SQL / "0002_structure_down.sql").read_text(encoding="utf-8"))
