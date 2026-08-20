"""add_unit_price_to_production_plan_items

Revision ID: fa8ed189c675
Revises: d1a66ca34639
Create Date: 2026-08-20 11:14:24.720897

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa8ed189c675'
down_revision: Union[str, Sequence[str], None] = 'd1a66ca34639'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('production_plan_items', sa.Column('unit_price', sa.Float(), nullable=True, server_default='0.0'))
    
    # 데이터 역산 업데이트 (단가가 없는 기존 데이터)
    op.execute('''
        UPDATE production_plan_items
        SET unit_price = CASE
            WHEN quantity IS NOT NULL AND quantity > 0 AND cost IS NOT NULL AND cost > 0
            THEN ROUND(CAST(cost AS NUMERIC) / quantity, 2)
            ELSE 0.0
        END
        WHERE unit_price IS NULL OR unit_price = 0.0
    ''')

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('production_plan_items', 'unit_price')
