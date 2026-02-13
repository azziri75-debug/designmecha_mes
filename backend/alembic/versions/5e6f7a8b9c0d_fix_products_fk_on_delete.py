"""fix_products_fk_on_delete

Revision ID: 5e6f7a8b9c0d
Revises: 4d5e6f7a8b9c
Create Date: 2026-02-13 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e6f7a8b9c0d'
down_revision: Union[str, Sequence[str], None] = '4d5e6f7a8b9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    fks = inspector.get_foreign_keys("products")
    
    fk_name = None
    for fk in fks:
        # Check if FK is on partner_id column and refers to partners table
        if "partner_id" in fk["constrained_columns"] and fk["referred_table"] == "partners":
            fk_name = fk["name"]
            break
            
    if fk_name:
        with op.batch_alter_table("products", schema=None) as batch_op:
            batch_op.drop_constraint(fk_name, type_="foreignkey")
            batch_op.create_foreign_key(
                "fk_products_partner_id_partners", # Explicit name for future
                "partners",
                ["partner_id"],
                ["id"],
                ondelete="SET NULL"
            )

def downgrade() -> None:
    # Revert to RESTRICT (default) or whatever it was. 
    # We use our explicit tag if we can, or just drop and recreate default.
    with op.batch_alter_table("products", schema=None) as batch_op:
        # We named it explicitly in upgrade, so we know the name now
        batch_op.drop_constraint("fk_products_partner_id_partners", type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_products_partner_id_partners_original", # Just a name
            "partners",
            ["partner_id"],
            ["id"]
        )
