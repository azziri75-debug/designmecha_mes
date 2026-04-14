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

    # 1. 품목 타입 확인 (소모품은 재고 관리 제외)
    product = await db.get(Product, product_id)
    if not product or product.item_type == 'CONSUMABLE':
        logger.info(f"Stock movement skipped: Product {product_id} is CONSUMABLE or not found.")
        return None

    # 2. Stock 레코드 조회 또는 생성
    query = select(Stock).where(Stock.product_id == product_id)
    result = await db.execute(query)
    stock = result.scalars().first()

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
    [MOD] 대체재 지원: 기본 부품 재고가 부족할 경우 등록된 대체재를 소진합니다.
    """
    if produced_quantity == 0:
        return

    # 1. BOM 조회 (대체재 정보 포함)
    query = select(BOM).where(BOM.parent_product_id == parent_product_id).options(
        selectinload(BOM.child_product),
        selectinload(BOM.substitute_product)
    )
    result = await db.execute(query)
    bom_items = result.scalars().all()

    if not bom_items:
        logger.info(f"Backflush: No BOM found for product {parent_product_id}. Skipping component deduction.")
        return

    # 2. 하위 부품별 재고 차감
    for item in bom_items:
        required_qty = int(item.required_quantity * produced_quantity)
        
        # 2.1 현재 기본 자재의 재고 확인
        stock_query = select(Stock).where(Stock.product_id == item.child_product_id)
        s_res = await db.execute(stock_query)
        primary_stock = s_res.scalars().first()
        primary_avail = primary_stock.current_quantity if primary_stock else 0

        if primary_avail >= required_qty:
            # 기본 자재로 충분함
            await handle_stock_movement(
                db=db,
                product_id=item.child_product_id,
                quantity=-required_qty,
                transaction_type=TransactionType.OUT,
                reference=f"Backflush ({reference})" if reference else "Backflush"
            )
        else:
            # 기본 자재가 부족함 -> 대체재 확인
            consumed_from_primary = max(0, primary_avail)
            remaining_needed = required_qty - consumed_from_primary

            # 2.2 기본 자재 소량이라도 있으면 먼저 소진
            if consumed_from_primary > 0:
                await handle_stock_movement(
                    db=db,
                    product_id=item.child_product_id,
                    quantity=-consumed_from_primary,
                    transaction_type=TransactionType.OUT,
                    reference=f"Backflush(Primary) ({reference})" if reference else "Backflush"
                )

            # 2.3 대체재 소진
            if remaining_needed > 0 and item.substitute_product_id:
                await handle_stock_movement(
                    db=db,
                    product_id=item.substitute_product_id,
                    quantity=-remaining_needed,
                    transaction_type=TransactionType.OUT,
                    reference=f"Backflush(Sub: {item.child_product.name}) ({reference})" if reference else f"Backflush(Sub: {item.child_product.name})"
                )
                logger.info(f"Backflush: Substituted {remaining_needed} of {item.child_product_id} with {item.substitute_product_id}")
            elif remaining_needed > 0:
                # 대체재가 없으면 그냥 마이너스 재고로 기본 자재 차감
                await handle_stock_movement(
                    db=db,
                    product_id=item.child_product_id,
                    quantity=-remaining_needed,
                    transaction_type=TransactionType.OUT,
                    reference=f"Backflush(Shortage) ({reference})" if reference else "Backflush"
                )

        logger.info(f"Backflush processed for child {item.child_product_id}")
