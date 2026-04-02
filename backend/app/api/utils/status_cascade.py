from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
import logging

logger = logging.getLogger(__name__)

async def complete_production_for_order(db: AsyncSession, order_id: int, reference: str = "Delivery"):
    """
    수주가 납품 완료(DELIVERY_COMPLETED)되었을 때, 연관된 모든 생산 계획을 완료 처리합니다.
    """
    plans_query = select(ProductionPlan).where(
        ProductionPlan.order_id == order_id,
        ProductionPlan.status != ProductionStatus.COMPLETED
    )
    result = await db.execute(plans_query)
    plans = result.scalars().all()
    
    for plan in plans:
        plan.status = ProductionStatus.COMPLETED
        db.add(plan)
        
        # 하위 모든 공정 완료 처리
        ppi_query = select(ProductionPlanItem).where(
            ProductionPlanItem.plan_id == plan.id,
            ProductionPlanItem.status != ProductionStatus.COMPLETED
        )
        ppi_res = await db.execute(ppi_query)
        items = ppi_res.scalars().all()
        
        for item in items:
            await on_production_item_completed(db, item, reference=f"{reference} (SO#{order_id})", auto_delivery=True)

    await db.flush()

async def on_production_item_completed(db: AsyncSession, item: ProductionPlanItem, reference: str = None, auto_delivery: bool = False):
    """
    생산 상세 공정(ProductionPlanItem)이 완료되었을 때 실행되는 로직.
    1. 상태를 COMPLETED로 변경.
    2. 연관된 발주/외주가 있다면 자동 완료 처리 및 재고 변동 기록 (입고+소요 상쇄).
    3. 마지막 공정이고 사내 생산인 경우 완제품 입고 및 BOM 차감.
    4. 납품에 의한 완료(auto_delivery)인 경우 완제품 재고는 입고-출고 상쇄 처리.
    """
    from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus
    from app.models.inventory import TransactionType
    from app.api.utils.inventory import handle_stock_movement, handle_backflush

    if item.status != ProductionStatus.COMPLETED:
        item.status = ProductionStatus.COMPLETED
        db.add(item)

    # --- 1. 연관 발주/외주일 경우 자동 완료 처리 ---
    # 자재 발주 처리 (ProductionPlanItem -> PurchaseOrderItem)
    po_items_stmt = select(PurchaseOrderItem).where(PurchaseOrderItem.production_plan_item_id == item.id)
    po_items_res = await db.execute(po_items_stmt)
    for po_item in po_items_res.scalars().all():
        po_stmt = select(PurchaseOrder).where(PurchaseOrder.id == po_item.purchase_order_id)
        po_res = await db.execute(po_stmt)
        po = po_res.scalars().first()
        if po and po.status != PurchaseStatus.COMPLETED:
            # 입고(+) 및 투입(-) 기록 (수량 변동 0)
            await handle_stock_movement(db, po_item.product_id, po_item.quantity, TransactionType.IN, f"Auto-Receipt ({reference or 'Production'})")
            await handle_stock_movement(db, po_item.product_id, -po_item.quantity, TransactionType.OUT, f"Auto-Consumption ({reference or 'Production'})")
            
            po.status = PurchaseStatus.COMPLETED
            db.add(po)

    # 외주 발주 처리 (ProductionPlanItem -> OutsourcingOrderItem)
    os_items_stmt = select(OutsourcingOrderItem).where(OutsourcingOrderItem.production_plan_item_id == item.id)
    os_items_res = await db.execute(os_items_stmt)
    for os_item in os_items_res.scalars().all():
        os_stmt = select(OutsourcingOrder).where(OutsourcingOrder.id == os_item.outsourcing_order_id)
        os_res = await db.execute(os_stmt)
        os_order = os_res.scalars().first()
        if os_order and os_order.status != OutsourcingStatus.COMPLETED:
            # 외주의 경우 가공된 품목 입고(+) 및 투입(-) 상쇄
            await handle_stock_movement(db, os_item.product_id, os_item.quantity, TransactionType.IN, f"Auto-OS-Receipt ({reference or 'Production'})")
            await handle_stock_movement(db, os_item.product_id, -os_item.quantity, TransactionType.OUT, f"Auto-OS-Consumption ({reference or 'Production'})")
            
            os_order.status = OutsourcingStatus.COMPLETED
            db.add(os_order)

    # --- 2. 사내 생산(INTERNAL)이고 마지막 공정일 경우 완제품 입고 및 BOM 차감 ---
    max_seq_stmt = select(func.max(ProductionPlanItem.sequence)).where(ProductionPlanItem.plan_id == item.plan_id)
    max_seq_res = await db.execute(max_seq_stmt)
    max_seq = max_seq_res.scalar()
    is_last = (item.sequence == max_seq)

    if item.course_type == "INTERNAL" and is_last:
        # A. 완제품 입고 (+)
        if auto_delivery:
            # 입고 후 즉시 출고 (FG Net 0)
            await handle_stock_movement(db, item.product_id, item.quantity, TransactionType.IN, f"Auto-Production ({reference})")
            await handle_stock_movement(db, item.product_id, -item.quantity, TransactionType.OUT, f"Auto-Delivery ({reference})")
        else:
            await handle_stock_movement(db, item.product_id, item.quantity, TransactionType.IN, f"Production Done ({reference or item.id})")
        
        # B. BOM 하위 부품 자동 차감 (-)
        await handle_backflush(db, item.product_id, item.quantity, reference=f"Production #{item.plan_id}")

    await db.flush()
