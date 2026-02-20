"""add_missing_sales_order_columns

Revision ID: 0a0de421ff66
Revises: c4856035b570
Create Date: 2026-02-20 09:53:19.550479

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0a0de421ff66'
down_revision: Union[str, Sequence[str], None] = 'c4856035b570'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('sales_orders')]

    with op.batch_alter_table('sales_orders', schema=None) as batch_op:
        if 'actual_delivery_date' not in columns:
            batch_op.add_column(sa.Column('actual_delivery_date', sa.Date(), nullable=True))
        if 'delivery_method' not in columns:
            batch_op.add_column(sa.Column('delivery_method', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('sales_orders', schema=None) as batch_op:
        batch_op.drop_column('delivery_method')
        batch_op.drop_column('actual_delivery_date')
