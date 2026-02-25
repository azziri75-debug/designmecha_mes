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
    # Add columns to production_plan_items idempotently using raw SQL for Postgres
    op.execute('ALTER TABLE production_plan_items ADD COLUMN IF NOT EXISTS start_date DATE')
    op.execute('ALTER TABLE production_plan_items ADD COLUMN IF NOT EXISTS end_date DATE')
    op.execute('ALTER TABLE production_plan_items ADD COLUMN IF NOT EXISTS cost FLOAT DEFAULT 0.0')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('production_plan_items', 'cost')
    op.drop_column('production_plan_items', 'end_date')
    op.drop_column('production_plan_items', 'start_date')
