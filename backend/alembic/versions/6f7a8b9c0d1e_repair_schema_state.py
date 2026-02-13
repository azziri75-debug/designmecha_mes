"""repair_schema_state

Revision ID: 6f7a8b9c0d1e
Revises: 5e6f7a8b9c0d
Create Date: 2026-02-13 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '6f7a8b9c0d1e'
down_revision: Union[str, Sequence[str], None] = '5e6f7a8b9c0d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name, column_name, inspector):
    columns = [c['name'] for c in inspector.get_columns(table_name)]
    return column_name in columns

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # 1. Fix Columns in 'processes'
    if not column_exists('processes', 'course_type', inspector):
        op.add_column('processes', sa.Column('course_type', sa.String(), server_default='INTERNAL', nullable=True))

    # 2. Fix Columns in 'product_processes'
    pp_cols = ['partner_name', 'equipment_name', 'attachment_file', 'course_type']
    for col in pp_cols:
        if not column_exists('product_processes', col, inspector):
            op.add_column('product_processes', sa.Column(col, sa.String(), nullable=True))

    # 3. Fix 'products.partner_id' Foreign Key (Force SET NULL)
    # Reflect existing FKs
    fks = inspector.get_foreign_keys('products')
    fk_name = None
    for fk in fks:
        if 'partner_id' in fk['constrained_columns'] and fk['referred_table'] == 'partners':
            fk_name = fk['name']
            break
            
    # Always recreate to be safe (ensure ON DELETE SET NULL)
    with op.batch_alter_table('products', schema=None) as batch_op:
        if fk_name:
            batch_op.drop_constraint(fk_name, type_='foreignkey')
            
        batch_op.create_foreign_key(
            'fk_products_partner_id_final',
            'partners',
            ['partner_id'],
            ['id'],
            ondelete='SET NULL'
        )

def downgrade() -> None:
    # No exact downgrade for repair scripts usually, as state was unknown.
    pass
