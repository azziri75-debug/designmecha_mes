"""add_product_groups

Revision ID: 5ba817148c30
Revises: e4c210e9598e
Create Date: 2026-02-26 20:24:30.733007

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5ba817148c30'
down_revision: Union[str, Sequence[str], None] = 'e4c210e9598e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create product_groups table
    op.create_table(
        'product_groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['parent_id'], ['product_groups.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_product_groups_id'), 'product_groups', ['id'], unique=False)
    op.create_index(op.f('ix_product_groups_name'), 'product_groups', ['name'], unique=False)

    # 2. Add group_id to products
    op.add_column('products', sa.Column('group_id', sa.Integer(), nullable=True))
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.create_foreign_key('fk_products_group_id', 'product_groups', ['group_id'], ['id'])

    # 3. Add group_id to processes
    op.add_column('processes', sa.Column('group_id', sa.Integer(), nullable=True))
    with op.batch_alter_table('processes', schema=None) as batch_op:
        batch_op.create_foreign_key('fk_processes_group_id', 'product_groups', ['group_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('processes', schema=None) as batch_op:
        batch_op.drop_constraint('fk_processes_group_id', type_='foreignkey')
    op.drop_column('processes', 'group_id')

    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_constraint('fk_products_group_id', type_='foreignkey')
    op.drop_column('products', 'group_id')

    op.drop_index(op.f('ix_product_groups_name'), table_name='product_groups')
    op.drop_index(op.f('ix_product_groups_id'), table_name='product_groups')
    op.drop_table('product_groups')
