"""refactor_product_classification_and_purchase_type

Revision ID: 4089ebe321fe
Revises: a0e47652820e
Create Date: 2026-03-04 22:06:55.338120

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4089ebe321fe'
down_revision: Union[str, Sequence[str], None] = 'a0e47652820e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. purchase_orders 테이블에 purchase_type 컬럼 추가
    op.add_column('purchase_orders', sa.Column('purchase_type', sa.String(), nullable=True))
    
    # 2. 기존 purchase_orders의 purchase_type을 'PART'로 초기화
    op.execute("UPDATE purchase_orders SET purchase_type = 'PART'")
    
    # 3. products 테이블의 item_type 데이터 변환
    # FINISHED, SEMI_FINISHED -> PRODUCED
    op.execute("UPDATE products SET item_type = 'PRODUCED' WHERE item_type IN ('FINISHED', 'SEMI_FINISHED')")
    # RAW_MATERIAL -> PART (기존 PART는 유지)
    op.execute("UPDATE products SET item_type = 'PART' WHERE item_type = 'RAW_MATERIAL'")
    # 기본값 설정이 FINISHED였으면 PRODUCED로 변경 (이미 Column 정의에서 바꿨으나 DB Level에서도 보장)
    op.execute("UPDATE products SET item_type = 'PRODUCED' WHERE item_type IS NULL")


def downgrade() -> None:
    # purchase_type 컬럼 삭제
    op.drop_column('purchase_orders', 'purchase_type')
    
    # item_type 복구는 정밀하게 불가능하므로 생략 (또는 필요시 명시적 정의)
    pass
