"""fix_purchase_type_column_robust

Revision ID: bc1076f7ea2f
Revises: 4089ebe321fe
Create Date: 2026-03-05 00:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision: str = 'bc1076f7ea2f'
down_revision: Union[str, Sequence[str], None] = '4089ebe321fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. purchase_orders 테이블에 purchase_type 컬럼이 없는 경우 추가
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    columns = [c['name'] for c in inspector.get_columns('purchase_orders')]
    
    if 'purchase_type' not in columns:
        op.add_column('purchase_orders', sa.Column('purchase_type', sa.String(), nullable=True, server_default='PART'))
        # 기존 데이터 초기화 (PART)
        op.execute("UPDATE purchase_orders SET purchase_type = 'PART' WHERE purchase_type IS NULL")
    else:
        # 이미 있는 경우 데이터 초기화만 보장
        op.execute("UPDATE purchase_orders SET purchase_type = 'PART' WHERE purchase_type IS NULL")


def downgrade() -> None:
    # purchase_type 컬럼 삭제 (복구 시)
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    columns = [c['name'] for c in inspector.get_columns('purchase_orders')]
    
    if 'purchase_type' in columns:
        op.drop_column('purchase_orders', 'purchase_type')
