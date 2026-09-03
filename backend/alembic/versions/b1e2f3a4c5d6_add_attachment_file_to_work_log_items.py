"""add attachment_file to work_log_items

Revision ID: b1e2f3a4c5d6
Revises: a0e47652820e
Create Date: 2026-09-03 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1e2f3a4c5d6'
down_revision: Union[str, Sequence[str], None] = 'a0e47652820e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('work_log_items', sa.Column('attachment_file', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('work_log_items', 'attachment_file')
