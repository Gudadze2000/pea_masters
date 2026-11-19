"""Reviewing evaluations: a decision on each entry, then on the whole form, and the final score.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-19
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        alter table evaluations
          add column review_state text,
          add column review_comment text,
          add column reviewed_by uuid references users (id) on delete restrict,
          add column reviewed_at timestamptz,
          add column final_score numeric(8, 2),
          add constraint evaluations_review_state_check check (review_state in ('approved', 'returned')),
          add constraint evaluations_final_score_check check ((review_state = 'approved') = (final_score is not null));
        comment on column evaluations.review_state is 'The coordinator''s decision on the submitted form: approved '
          '(final, locked) or returned (to be fixed and resubmitted); empty while waiting for review';
        comment on column evaluations.final_score is 'Points from approved entries, with the form''s limits applied';

        alter table evaluation_entries
          add column reviewed_by uuid references users (id) on delete restrict,
          add column reviewed_at timestamptz;
    """)


def downgrade() -> None:
    op.execute("""
        alter table evaluation_entries drop column reviewed_at, drop column reviewed_by;
        alter table evaluations drop constraint evaluations_final_score_check,
          drop constraint evaluations_review_state_check, drop column final_score, drop column reviewed_at,
          drop column reviewed_by, drop column review_comment, drop column review_state;
    """)
