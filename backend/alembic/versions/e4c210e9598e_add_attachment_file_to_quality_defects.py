"""add_attachment_file_to_quality_defects

Revision ID: e4c210e9598e
Revises: 54966a383936
Create Date: 2026-02-26 17:39:54.643885

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'e4c210e9598e'
down_revision: Union[str, Sequence[str], None] = '54966a383936'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add attachment_file to quality_defects
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    columns = [c['name'] for c in inspector.get_columns('quality_defects')]
    if 'attachment_file' not in columns:
        op.add_column('quality_defects', sa.Column('attachment_file', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('quality_defects', 'attachment_file')
