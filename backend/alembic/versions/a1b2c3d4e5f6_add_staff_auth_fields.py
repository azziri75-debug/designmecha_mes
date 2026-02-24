"""add_staff_auth_fields

Revision ID: a1b2c3d4e5f6
Revises: 0a0de421ff66
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '4bd8cb559139'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('staff', sa.Column('user_type', sa.String(), server_default='USER'))
    op.add_column('staff', sa.Column('password', sa.String(), nullable=True))
    op.add_column('staff', sa.Column('menu_permissions', sa.JSON(), server_default='[]'))


def downgrade():
    op.drop_column('staff', 'menu_permissions')
    op.drop_column('staff', 'password')
    op.drop_column('staff', 'user_type')
