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
            select(ProductionPlan)
            .where(ProductionPlan.id == plan_id)
            .where(ProductionPlan.status != ProductionStatus.CANCELED)
            .options(selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product))
        )
        plan = result.scalar_one_or_none()
        if not plan:
            print(f"[MRP] Plan {plan_id} not found or is CANCELED.")
            # Clear existing requirements if plan was canceled
            existing_stmt = select(MaterialRequirement).where(MaterialRequirement.plan_id == plan_id)
            existing_res = await db.execute(existing_stmt)
            for mr in existing_res.scalars().all():
                await db.delete(mr)
            await db.commit()
            return
        
        # 1.1 Clear existing records strictly for idempotency
        # Fetch them first to delete via session to avoid any sync issues
        existing_stmt = select(MaterialRequirement).where(MaterialRequirement.plan_id == plan_id)
        existing_res = await db.execute(existing_stmt)
        for mr in existing_res.scalars().all():
            await db.delete(mr)
        
        await db.flush() # Ensure deletions are processed
        print(f"[MRP] Cleared existing records for Plan {plan_id} for refresh.")

        # 2. Collect targets from plan items
        # Aggregate quantities by product_id to handle potential duplicates in the plan itself
        product_qtys = {}
        for pi in plan.items:
            product_qtys[pi.product_id] = product_qtys.get(pi.product_id, 0) + pi.quantity
        
        for pid, qty in product_qtys.items():
            items.append({"product_id": pid, "quantity": qty})
        
        if plan.order_id:
            ref_order_id = plan.order_id

    elif order_id:
        result = await db.execute(
            select(SalesOrder)
            .where(SalesOrder.id == order_id)
            .where(SalesOrder.status != OrderStatus.CANCELLED)
            .options(selectinload(SalesOrder.items).selectinload(SalesOrderItem.product))
        )
        order = result.scalar_one_or_none()
        if not order:
            # Clear existing requirements if order was canceled
            existing_stmt = select(MaterialRequirement).where(MaterialRequirement.order_id == order_id, MaterialRequirement.plan_id == None)
            existing_res = await db.execute(existing_stmt)
            for mr in existing_res.scalars().all():
                await db.delete(mr)
            await db.commit()
            return
            
        # Clear existing records for idempotency (SalesOrder context)
        existing_stmt = select(MaterialRequirement).where(MaterialRequirement.order_id == order_id, MaterialRequirement.plan_id == None)
        existing_res = await db.execute(existing_stmt)
        for mr in existing_res.scalars().all():
            await db.delete(mr)
        await db.flush()

        for oi in order.items:
            items.append({"product_id": oi.product_id, "quantity": oi.quantity})

    if not items:
        return

    # 3. BOM Explosion & Aggregation
    # Shared requirements dict across all top-level items
    requirements = {} # {product_id: total_quantity}

    for item in items:
        await explode_bom(db, item["product_id"], item["quantity"], requirements)

    # 4. Record Requirements
    for product_id, total_required in requirements.items():
        # Exclude produced items (only parts/consumables are purchasing targets)
        product = await db.get(Product, product_id)
        if not product or product.item_type == "PRODUCED":
            continue

        # Check stock
        stock_stmt = select(Stock).where(Stock.product_id == product_id)
        stock_res = await db.execute(stock_stmt)
        stock = stock_res.scalar_one_or_none()
        current_stock = stock.current_quantity if stock else 0

        # Check open POs
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

        shortage = max(0, total_required - current_stock)

        # Only record if there's a requirement (total_required > 0)
        # Even if shortage is 0, we might want to see the requirement in the list for transparency
        if total_required > 0:
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
    
    await db.commit()
    print(f"[MRP] Completed MRP calculation.")
