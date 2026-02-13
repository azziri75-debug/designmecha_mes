"""cleanup_zombies

Revision ID: 7890abcdef12
Revises: 6f7a8b9c0d1e
Create Date: 2026-02-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7890abcdef12'
down_revision: Union[str, Sequence[str], None] = '6f7a8b9c0d1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    
    # 1. products.partner_id Cleanup
    # Find ALL FKs on products that reference partners
    fks = inspector.get_foreign_keys("products")
    target_fks = []
    for fk in fks:
        if "partner_id" in fk["constrained_columns"] and fk["referred_table"] == "partners":
            target_fks.append(fk["name"])
            
    # Drop all found FKs
    if target_fks:
        with op.batch_alter_table("products", schema=None) as batch_op:
            for fk_name in target_fks:
                batch_op.drop_constraint(fk_name, type_="foreignkey")
                
            # Create ONE correct FK
            batch_op.create_foreign_key(
                "fk_products_partner_id_partners_final",
                "partners",
                ["partner_id"],
                ["id"],
                ondelete="SET NULL"
            )

def downgrade() -> None:
    pass
