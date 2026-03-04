from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.inventory import Stock, StockTransaction, TransactionType
from app.models.product import BOM, Product
import logging

logger = logging.getLogger(__name__)

async def handle_stock_movement(
    db: AsyncSession,
    product_id: int,
    quantity: int,
    transaction_type: TransactionType,
    reference: str = None
):
    """
    특정 품목의 재고를 증감시키고 이력을 남깁니다.
    quantity: 증감할 수량 (입고시는 양수, 출고시는 음수여야 함)
    """
    if quantity == 0:
        return None

    # 1. Stock 레코드 조회 또는 생성
    query = select(Stock).where(Stock.product_id == product_id)
    result = await db.execute(query)
    stock = result.scalar_one_or_none()

    if not stock:
        # 재고 레코드가 없으면 생성 (0에서 시작)
        stock = Stock(product_id=product_id, current_quantity=0)
        db.add(stock)
        await db.flush() # ID 생성을 위해 flush

    # 2. 재고 수량 업데이트 (마이너스 재고 허용)
    stock.current_quantity += quantity

    # 3. 트랜잭션 이력 기록
    transaction = StockTransaction(
        stock_id=stock.id,
        quantity=quantity,
        transaction_type=transaction_type,
        reference=reference
    )
    db.add(transaction)
    
    logger.info(f"Stock movement: Product {product_id}, Qty {quantity}, Type {transaction_type}, Ref {reference}")
    return stock

async def handle_backflush(
    db: AsyncSession,
    parent_product_id: int,
    produced_quantity: int,
    reference: str = None
):
    """
    완제품 생산 시 BOM을 조회하여 하위 부품의 재고를 자동으로 차감(Backflush)합니다.
    produced_quantity: 생산된 완제품 수량
    """
    if produced_quantity <= 0:
        return

    # 1. BOM 조회
    query = select(BOM).where(BOM.parent_product_id == parent_product_id)
    result = await db.execute(query)
    bom_items = result.scalars().all()

    if not bom_items:
        logger.info(f"Backflush: No BOM found for product {parent_product_id}. Skipping component deduction.")
        return

    # 2. 하위 부품별 재고 차감
    for item in bom_items:
        required_qty = item.required_quantity * produced_quantity
        # 출고이므로 음수로 처리
        await handle_stock_movement(
            db=db,
            product_id=item.child_product_id,
            quantity=-int(required_qty), # 소요량은 보통 정수이나 Float 대응 필요시 정적 캐스팅
            transaction_type=TransactionType.OUT,
            reference=f"Backflush ({reference})" if reference else "Backflush"
        )
        logger.info(f"Backflush: Component {item.child_product_id} deducted by {required_qty}")
