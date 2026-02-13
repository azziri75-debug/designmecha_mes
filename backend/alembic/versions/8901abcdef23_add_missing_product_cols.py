"""add_missing_product_cols

Revision ID: 8901abcdef23
Revises: 7890abcdef12
Create Date: 2026-02-13 11:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8901abcdef23'
down_revision: Union[str, Sequence[str], None] = '7890abcdef12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name, column_name, inspector):
    columns = [c['name'] for c in inspector.get_columns(table_name)]
    return column_name in columns

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # List of columns to check/add in 'products' table
    # Based on error: SELECT products.note ... FROM products
    columns_to_check = [
        ('note', sa.Text()),
        ('drawing_file', sa.String()),
        ('specification', sa.String()),
        ('material', sa.String()),
        ('unit', sa.String())
    ]
    
    for col_name, col_type in columns_to_check:
        if not column_exists('products', col_name, inspector):
            op.add_column('products', sa.Column(col_name, col_type, nullable=True))

def downgrade() -> None:
    # Downgrade logic is complex for conditional adds, skipping for repair migration
    pass
