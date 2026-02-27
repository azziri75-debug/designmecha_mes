"""add measurement_histories table

Revision ID: b2614d1d0f7d
Revises: d2235759113c
Create Date: 2026-02-27 15:37:47.518856

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2614d1d0f7d'
down_revision: Union[str, Sequence[str], None] = 'd2235759113c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'measurement_histories' not in tables:
        op.create_table('measurement_histories',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('instrument_id', sa.Integer(), nullable=False),
            sa.Column('history_date', sa.Date(), nullable=True),
            sa.Column('history_type', sa.String(), nullable=False),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('cost', sa.Float(), nullable=True),
            sa.Column('worker_name', sa.String(), nullable=True),
            sa.Column('attachment_file', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.ForeignKeyConstraint(['instrument_id'], ['measuring_instruments.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_measurement_histories_id'), 'measurement_histories', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'measurement_histories' in tables:
        op.drop_index(op.f('ix_measurement_histories_id'), table_name='measurement_histories')
        op.drop_table('measurement_histories')
