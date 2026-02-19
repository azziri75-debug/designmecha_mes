"""Add PRODUCTION_COMPLETED to OrderStatus

Revision ID: 3c9f797689fa
Revises: 1957ae59e6f1
Create Date: 2026-02-19 16:14:40.865714

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c9f797689fa'
down_revision: Union[str, Sequence[str], None] = '1957ae59e6f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres specific command to add enum value
    # Check dialect to be safe, though users likely use Postgres given the error.
    bind = op.get_bind()
    if bind.engine.name == 'postgresql':
        op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'PRODUCTION_COMPLETED'")

def downgrade() -> None:
    # Cannot remove enum value easily in Postgres
    pass
