"""add_attachment_file_to_purchasing_models

Revision ID: 4bd8cb559139
Revises: 4b46ce8e5ae1
Create Date: 2026-02-24 08:53:09.333051

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4bd8cb559139'
down_revision: Union[str, Sequence[str], None] = '4b46ce8e5ae1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('purchase_orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('attachment_file', sa.Text(), nullable=True))

    with op.batch_alter_table('outsourcing_orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('attachment_file', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('purchase_orders', schema=None) as batch_op:
        batch_op.drop_column('attachment_file')

    with op.batch_alter_table('outsourcing_orders', schema=None) as batch_op:
        batch_op.drop_column('attachment_file')
