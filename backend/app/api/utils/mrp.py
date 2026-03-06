from sqlalchemy import select, func, or_, cast, String
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.product import BOM, Product
from app.models.purchasing import MaterialRequirement, PurchaseOrder, PurchaseOrderItem, PurchaseStatus
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.inventory import Stock
from app.models.production import ProductionPlan, ProductionPlanItem
from typing import Dict, List, Optional

async def explode_bom(db: AsyncSession, product_id: int, quantity: float, requirements: Dict[int, float]):
    """
    Recursively explodes BOM for a product.
    requirements: Dict[product_id, total_needed_quantity]
    """
    query = select(BOM).where(BOM.parent_product_id == product_id).options(selectinload(BOM.child_product))
    result = await db.execute(query)
    bom_items = result.scalars().all()
    
    if not bom_items:
        # leaf node or product without BOM
        requirements[product_id] = requirements.get(product_id, 0) + quantity
        return

    for bi in bom_items:
        child_needed = bi.required_quantity * quantity
        await explode_bom(db, bi.child_product_id, child_needed, requirements)

async def calculate_and_record_mrp(
    db: AsyncSession, 
    order_id: Optional[int] = None, 
    plan_id: Optional[int] = None
):
    """
    BOM 전개 및 재고 확인을 통한 부족분 산출 및 MaterialRequirement 기록
    """
    # 1. 대상 선택 (SalesOrder 또는 ProductionPlan)
    items = []
    ref_order_id = order_id
    
    if plan_id:
        print(f"[MRP] Starting MRP calculation for Plan ID: {plan_id}")
        result = await db.execute(
            select(ProductionPlan).where(ProductionPlan.id == plan_id)
            .options(selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product))
        )
        plan = result.scalar_one_or_none()
        if not plan:
            print(f"[MRP] Plan {plan_id} not found.")
            return
        
        # 중복 제거 대신 '강제'를 위해 기존 해당 plan_id의 MRP 데이터 삭제
        from app.models.purchasing import MaterialRequirement
        from sqlalchemy import delete
        await db.execute(delete(MaterialRequirement).where(MaterialRequirement.plan_id == plan_id))
        print(f"[MRP] Deleted existing records for Plan {plan_id} to force refresh.")

        # 생산 계획 항목들로부터 품목 및 수량 추출 (고유 품목별 최대 수량 추출)
        product_qtys = {}
        for pi in plan.items:
            product_qtys[pi.product_id] = max(product_qtys.get(pi.product_id, 0), pi.quantity)
        
        for pid, qty in product_qtys.items:
            items.append({"product_id": pid, "quantity": qty})
            print(f"[MRP] Target Plan Item: ProductID={pid}, Qty={qty}")
        
        if plan.order_id:
            ref_order_id = plan.order_id

    elif order_id:
        result = await db.execute(
            select(SalesOrder).where(SalesOrder.id == order_id)
            .options(selectinload(SalesOrder.items).selectinload(SalesOrderItem.product))
        )
        order = result.scalar_one_or_none()
        if not order:
            return
            
        # 중복 체크 (SalesOrder용)
        dup_stmt = select(MaterialRequirement).where(MaterialRequirement.order_id == order_id).limit(1)
        dup_res = await db.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            print(f"MRP already recorded for SalesOrder {order_id}. Skipping.")
            return

        for oi in order.items:
            items.append({"product_id": oi.product_id, "quantity": oi.quantity})

    if not items:
        return

    # 2. BOM 전개 및 하위 부품 필요량 합산
    requirements = {} # {product_id: total_quantity}

    for item in items:
        await explode_bom(db, item["product_id"], item["quantity"], requirements)

    # 3. 각 부품별 재고 및 발주 잔량 확인 후 부족분 기록
    for product_id, total_required in requirements.items():
        # 생산되는 품목(PRODUCED)은 발주 대상이 아니므로 제외
        product = await db.get(Product, product_id)
        if not product or product.item_type == "PRODUCED":
            continue

        # 현재고 조회
        stock_stmt = select(Stock).where(Stock.product_id == product_id)
        stock_res = await db.execute(stock_stmt)
        stock = stock_res.scalar_one_or_none()
        current_stock = stock.current_quantity if stock else 0

        # 발주 잔량(입고 대기 수량) 조회
        po_stmt = (
            select(func.sum(PurchaseOrderItem.quantity - PurchaseOrderItem.received_quantity))
            .join(PurchaseOrder)
            .where(
                PurchaseOrderItem.product_id == product_id,
                PurchaseOrder.status.in_([PurchaseStatus.PENDING, PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL])
            )
        )
        po_res = await db.execute(po_stmt)
        open_purchase_qty = po_res.scalar() or 0

        # 부족분 계산: 필요량 - (현재고 + 발주잔량)
        shortage = total_required - (current_stock + open_purchase_qty)

        if shortage > 0:
            # MaterialRequirement 기록
            req_record = MaterialRequirement(
                product_id=product_id,
                order_id=ref_order_id,
                plan_id=plan_id,
                required_quantity=int(total_required),
                current_stock=int(current_stock),
                open_purchase_qty=int(open_purchase_qty),
                shortage_quantity=int(shortage),
                status="PENDING"
            )
            db.add(req_record)
            print(f"[MRP] Created Requirement for ProductID={product_id}, Shortage={shortage}")
    
    await db.flush()
    await db.commit()
