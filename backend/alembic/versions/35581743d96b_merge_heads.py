"""merge heads

Revision ID: 35581743d96b
Revises: a1b2c3d4e5f6, f3a2b1c0d9e8
Create Date: 2026-02-24 17:13:37.706816

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '35581743d96b'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4e5f6', 'f3a2b1c0d9e8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
