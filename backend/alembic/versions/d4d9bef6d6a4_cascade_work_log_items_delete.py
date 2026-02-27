"""cascade work log items delete

Revision ID: d4d9bef6d6a4
Revises: b2614d1d0f7d
Create Date: 2026-02-27 15:44:58.921681

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4d9bef6d6a4'
down_revision: Union[str, Sequence[str], None] = 'b2614d1d0f7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if "work_log_items" in tables:
        with op.batch_alter_table("work_log_items", schema=None) as batch_op:
            batch_op.drop_constraint("work_log_items_plan_item_id_fkey", type_="foreignkey")
            batch_op.create_foreign_key(
                "work_log_items_plan_item_id_fkey",
                "production_plan_items",
                local_cols=["plan_item_id"],
                remote_cols=["id"],
                ondelete="CASCADE"
            )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if "work_log_items" in tables:
        with op.batch_alter_table("work_log_items", schema=None) as batch_op:
            batch_op.drop_constraint("work_log_items_plan_item_id_fkey", type_="foreignkey")
            batch_op.create_foreign_key(
                "work_log_items_plan_item_id_fkey",
                "production_plan_items",
                local_cols=["plan_item_id"],
                remote_cols=["id"]
            )
