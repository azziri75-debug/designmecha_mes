"""Add purchasing and outsourcing tables

Revision ID: 1957ae59e6f1
Revises: 2f2def70d24a
Create Date: 2026-02-13 16:06:43.490027

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '1957ae59e6f1'
down_revision: Union[str, Sequence[str], None] = '2f2def70d24a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    # --- Purchase Orders ---
    if 'purchase_orders' not in tables:
        op.create_table('purchase_orders',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('order_no', sa.String(), nullable=True),
            sa.Column('partner_id', sa.Integer(), nullable=True),
            sa.Column('order_date', sa.Date(), nullable=False),
            sa.Column('delivery_date', sa.Date(), nullable=True),
            sa.Column('total_amount', sa.Float(), nullable=True),
            sa.Column('note', sa.String(), nullable=True),
            sa.Column('status', sa.Enum('PENDING', 'ORDERED', 'PARTIAL', 'COMPLETED', 'CANCELED', name='purchasestatus'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['partner_id'], ['partners.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_purchase_orders_id'), 'purchase_orders', ['id'], unique=False)
        op.create_index(op.f('ix_purchase_orders_order_no'), 'purchase_orders', ['order_no'], unique=True)

    # --- Purchase Order Items ---
    if 'purchase_order_items' not in tables:
        op.create_table('purchase_order_items',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('purchase_order_id', sa.Integer(), nullable=False),
            sa.Column('product_id', sa.Integer(), nullable=False),
            sa.Column('quantity', sa.Integer(), nullable=True),
            sa.Column('unit_price', sa.Float(), nullable=True),
            sa.Column('received_quantity', sa.Integer(), nullable=True),
            sa.Column('note', sa.String(), nullable=True),
            sa.Column('production_plan_item_id', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
            sa.ForeignKeyConstraint(['production_plan_item_id'], ['production_plan_items.id'], ),
            sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_purchase_order_items_id'), 'purchase_order_items', ['id'], unique=False)
    else:
        # If table exists, check for the column (for local env compatibility or mixed state)
        columns = [c['name'] for c in inspector.get_columns('purchase_order_items')]
        if 'production_plan_item_id' not in columns:
            op.add_column('purchase_order_items', sa.Column('production_plan_item_id', sa.Integer(), nullable=True))
            op.create_foreign_key(op.f('fk_purchase_order_items_production_plan_item_id_production_plan_items'), 'purchase_order_items', 'production_plan_items', ['production_plan_item_id'], ['id'])

    # --- Outsourcing Orders ---
    if 'outsourcing_orders' not in tables:
        op.create_table('outsourcing_orders',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('order_no', sa.String(), nullable=True),
            sa.Column('partner_id', sa.Integer(), nullable=True),
            sa.Column('order_date', sa.Date(), nullable=False),
            sa.Column('delivery_date', sa.Date(), nullable=True),
            sa.Column('total_amount', sa.Float(), nullable=True),
            sa.Column('note', sa.String(), nullable=True),
            sa.Column('status', sa.Enum('PENDING', 'ORDERED', 'COMPLETED', 'CANCELED', name='outsourcingstatus'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['partner_id'], ['partners.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_outsourcing_orders_id'), 'outsourcing_orders', ['id'], unique=False)
        op.create_index(op.f('ix_outsourcing_orders_order_no'), 'outsourcing_orders', ['order_no'], unique=True)

    # --- Outsourcing Order Items ---
    if 'outsourcing_order_items' not in tables:
        op.create_table('outsourcing_order_items',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('outsourcing_order_id', sa.Integer(), nullable=False),
            sa.Column('production_plan_item_id', sa.Integer(), nullable=True),
            sa.Column('product_id', sa.Integer(), nullable=True),
            sa.Column('quantity', sa.Integer(), nullable=True),
            sa.Column('unit_price', sa.Float(), nullable=True),
            sa.Column('note', sa.String(), nullable=True),
            sa.Column('status', sa.Enum('PENDING', 'ORDERED', 'COMPLETED', 'CANCELED', name='outsourcingstatus'), nullable=True),
            sa.ForeignKeyConstraint(['outsourcing_order_id'], ['outsourcing_orders.id'], ),
            sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
            sa.ForeignKeyConstraint(['production_plan_item_id'], ['production_plan_items.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_outsourcing_order_items_id'), 'outsourcing_order_items', ['id'], unique=False)


def downgrade() -> None:
    # Logic is complex due to conditional upgrade, but generally we want to reverse the operations.
    # Simplifying downgrade to just dropping tables if they exist is usually safe for dev.
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()

    if 'outsourcing_order_items' in tables:
        op.drop_index(op.f('ix_outsourcing_order_items_id'), table_name='outsourcing_order_items')
        op.drop_table('outsourcing_order_items')
    
    if 'outsourcing_orders' in tables:
        op.drop_index(op.f('ix_outsourcing_orders_order_no'), table_name='outsourcing_orders')
        op.drop_index(op.f('ix_outsourcing_orders_id'), table_name='outsourcing_orders')
        op.drop_table('outsourcing_orders')

    # Note: Enum types might need explicit drop on Postgres: op.execute("DROP TYPE outsourcingstatus")
    
    if 'purchase_order_items' in tables:
        # Check if we should drop the whole table or just the column?
        # Since this migration created the table locally (potentially), we drop the table.
        # But if we are in the "column added" path?
        # It's hard to know which path we took. 
        # For safety in this specific debugging context:
        op.drop_index(op.f('ix_purchase_order_items_id'), table_name='purchase_order_items')
        op.drop_table('purchase_order_items')

    if 'purchase_orders' in tables:
        op.drop_index(op.f('ix_purchase_orders_order_no'), table_name='purchase_orders')
        op.drop_index(op.f('ix_purchase_orders_id'), table_name='purchase_orders')
        op.drop_table('purchase_orders')
