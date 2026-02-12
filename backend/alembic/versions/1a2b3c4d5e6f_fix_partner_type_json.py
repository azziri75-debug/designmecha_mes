"""fix_partner_type_json

Revision ID: 1a2b3c4d5e6f
Revises: ef3c2319e79b
Create Date: 2026-02-12 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '1a2b3c4d5e6f'
down_revision: Union[str, Sequence[str], None] = 'ef3c2319e79b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Detect if we are on Postgres to use specific syntax for converting ENUM to JSON
    # If SQLite, batch_alter_table handles simple type changes but casting is harder.
    bind = op.get_bind()
    
    if bind.engine.name == 'postgresql':
        # PostgreSQL specific path
        op.alter_column('partners', 'partner_type',
            existing_type=postgresql.ENUM(name='partnertype', create_type=False),
            type_=sa.JSON(),
            postgresql_using='partner_type::text::json',
            nullable=True)
        # Drop the enum type
        op.execute("DROP TYPE IF EXISTS partnertype")
    else:
        # SQLite or others (Development)
        with op.batch_alter_table('partners', schema=None) as batch_op:
            batch_op.alter_column('partner_type',
               existing_type=sa.Enum('CUSTOMER', 'SUPPLIER', 'SUBCONTRACTOR', 'BOTH', name='partnertype'),
               type_=sa.JSON(),
               existing_nullable=True)


def downgrade() -> None:
    # Reverse the operation
    bind = op.get_bind()
    
    if bind.engine.name == 'postgresql':
        # Create schema for Enum first
        partnertype = postgresql.ENUM('CUSTOMER', 'SUPPLIER', 'SUBCONTRACTOR', 'BOTH', name='partnertype')
        partnertype.create(bind)
        
        op.alter_column('partners', 'partner_type',
            existing_type=sa.JSON(),
            type_=partnertype,
            postgresql_using="partner_type->>0::partnertype", # Attempt to take first element if array
            nullable=True)
    else:
        with op.batch_alter_table('partners', schema=None) as batch_op:
            batch_op.alter_column('partner_type',
               existing_type=sa.JSON(),
               type_=sa.Enum('CUSTOMER', 'SUPPLIER', 'SUBCONTRACTOR', 'BOTH', name='partnertype'),
               existing_nullable=True)
