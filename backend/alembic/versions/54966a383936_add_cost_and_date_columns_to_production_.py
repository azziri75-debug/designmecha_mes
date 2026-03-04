"""Add cost and date columns to production_plan_items

Revision ID: 54966a383936
Revises: 35581743d96b
Create Date: 2026-02-25 23:17:22.025681

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54966a383936'
down_revision: Union[str, Sequence[str], None] = '35581743d96b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite does not support ADD COLUMN IF NOT EXISTS. 
    # Use batch_alter_table for SQLite compatibility.
    with op.batch_alter_table('production_plan_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('start_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('end_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('cost', sa.Float(), server_default='0.0', nullable=True))
        batch_op.add_column(sa.Column('attachment_file', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('worker_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('equipment_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('production_plan_items', 'equipment_id')
    op.drop_column('production_plan_items', 'worker_id')
    op.drop_column('production_plan_items', 'attachment_file')
    op.drop_column('production_plan_items', 'cost')
    op.drop_column('production_plan_items', 'end_date')
    op.drop_column('production_plan_items', 'start_date')
