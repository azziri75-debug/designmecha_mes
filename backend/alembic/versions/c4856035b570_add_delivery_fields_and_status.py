"""Add Delivery Fields and Status

Revision ID: c4856035b570
Revises: 3c9f797689fa
Create Date: 2026-02-19 16:51:51.443526

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4856035b570'
down_revision: Union[str, Sequence[str], None] = '3c9f797689fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres specific command to add enum value
    bind = op.get_bind()
    if bind.engine.name == 'postgresql':
        op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'DELIVERY_COMPLETED'")

    # Add columns to sales_orders
    op.add_column('sales_orders', sa.Column('actual_delivery_date', sa.Date(), nullable=True))
    op.add_column('sales_orders', sa.Column('delivery_method', sa.String(), nullable=True))
    op.add_column('sales_orders', sa.Column('transaction_date', sa.Date(), nullable=True))


def downgrade() -> None:
    # Remove columns
    op.drop_column('sales_orders', 'transaction_date')
    op.drop_column('sales_orders', 'delivery_method')
    op.drop_column('sales_orders', 'actual_delivery_date')
    # Cannot remove enum value easily
    pass
