"""add_quotation_statuses_to_outsourcing

Revision ID: d1a66ca34639
Revises: a5c9b7d8e2f1
Create Date: 2026-07-16 10:46:54.221249

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1a66ca34639'
down_revision: Union[str, Sequence[str], None] = 'a5c9b7d8e2f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    connection = op.get_bind()
    if connection.dialect.name == 'postgresql':
        with op.get_context().autocommit_block():
            for val in ['QUOTATION', 'QUOTATION_COMPLETE']:
                try:
                    op.execute(f"ALTER TYPE outsourcingstatus ADD VALUE '{val}'")
                except Exception as e:
                    print(f"Skipping value {val} in outsourcingstatus enum: {e}")
    else:
        pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
