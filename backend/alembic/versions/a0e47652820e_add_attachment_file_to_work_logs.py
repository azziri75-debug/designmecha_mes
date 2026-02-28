"""add attachment_file to work_logs

Revision ID: a0e47652820e
Revises: d4d9bef6d6a4
Create Date: 2026-02-28 16:49:32.738718

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a0e47652820e'
down_revision: Union[str, Sequence[str], None] = 'd4d9bef6d6a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('work_logs', sa.Column('attachment_file', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('work_logs', 'attachment_file')
