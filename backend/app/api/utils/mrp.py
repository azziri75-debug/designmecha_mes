from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.product import BOM, Product, Inventory
from app.models.purchasing import MaterialRequirement, PurchaseOrder, PurchaseOrderItem, PurchaseStatus
from app.models.sales import SalesOrder, SalesOrderItem
from typing import Dict, List

async def explode_bom_recursive(db: AsyncSession, product_id: int, quantity: float, requirements: Dict[int, float]):
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
        await explode_bom_recursive(db, bi.child_product_id, child_needed, requirements)

async def calculate_and_record_mrp(db: AsyncSession, order_id: int):
    """
    Explodes all items in a Sales Order and records shortage requirements.
    """
    # 1. Fetch Sales Order Items
    query = select(SalesOrderItem).where(SalesOrderItem.order_id == order_id).options(selectinload(SalesOrderItem.product))
    result = await db.execute(query)
    order_items = result.scalars().all()
    
    total_requirements = {} # product_id -> total_needed
    
    for item in order_items:
        # Explode each item
        await explode_bom_recursive(db, item.product_id, item.quantity, total_requirements)
        
    # 2. For each required item, check stock and open POs
    for pid, needed in total_requirements.items():
        # Skip the top-level produced items if they are not meant to be purchased
        # Usually we only care about PART, CONSUMABLE, RAW_MATERIAL for purchasing
        product = await db.get(Product, pid)
        if not product or product.item_type == "PRODUCED":
            continue
            
        # Current Stock
        stock_query = select(Inventory).where(Inventory.product_id == pid)
        s_res = await db.execute(stock_query)
        stock = s_res.scalar_one_or_none()
        current_stock = stock.quantity if stock else 0
        
        # Open PO Quantity
        po_query = select(func.sum(PurchaseOrderItem.quantity - PurchaseOrderItem.received_quantity))\
            .join(PurchaseOrder)\
            .where(PurchaseOrderItem.product_id == pid)\
            .where(PurchaseOrder.status.in_([PurchaseStatus.PENDING, PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL]))
        po_res = await db.execute(po_query)
        open_purchase_qty = po_res.scalar() or 0
        
        # Calculate Shortage
        shortage = needed - current_stock - open_purchase_qty
        
        if shortage > 0:
            # 3. Record in MaterialRequirement
            req = MaterialRequirement(
                product_id=pid,
                order_id=order_id,
                required_quantity=int(needed),
                current_stock=int(current_stock),
                open_purchase_qty=int(open_purchase_qty),
                shortage_quantity=int(shortage),
                status="PENDING"
            )
            db.add(req)
    
    await db.flush()
