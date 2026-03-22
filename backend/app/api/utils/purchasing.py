import traceback
from sqlalchemy import select, update, or_
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem
from app.models.product import Product

async def fix_purchase_type(db):
    """
    Consolidated logic to fix missing purchase_type for consumable orders.
    Can be called from startup event or emergency API endpoint.
    """
    try:
        # 1. Strategy A: Orders linked to consumable_purchase_waits
        stmt_a = select(PurchaseOrderItem.order_id).where(
            PurchaseOrderItem.consumable_purchase_wait_id.is_not(None)
        ).distinct()
        
        # 2. Strategy B: Orders containing items with Product.item_type == 'CONSUMABLE'
        stmt_b = select(PurchaseOrderItem.order_id).join(Product, PurchaseOrderItem.product_id == Product.id).where(
            Product.item_type == 'CONSUMABLE'
        ).distinct()
        
        # Combine IDs
        res_a = await db.execute(stmt_a)
        res_b = await db.execute(stmt_b)
        
        ids_a = {r[0] for r in res_a.fetchall()}
        ids_b = {r[0] for r in res_b.fetchall()}
        order_ids = list(ids_a | ids_b)
        
        if not order_ids:
            return 0

        # 3. Update those orders
        update_stmt = update(PurchaseOrder).where(
            PurchaseOrder.id.in_(order_ids),
            or_(PurchaseOrder.purchase_type != 'CONSUMABLE', PurchaseOrder.purchase_type.is_(None))
        ).values(purchase_type='CONSUMABLE')
        
        res = await db.execute(update_stmt)
        updated_count = res.rowcount
        
        await db.commit()
        return updated_count
    except Exception as e:
        print(f"Error in fix_purchase_type: {traceback.format_exc()}")
        raise e
