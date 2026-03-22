import asyncio
import traceback
from sqlalchemy import select, update, or_
from app.db.session import AsyncSessionLocal
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem

async def fix_purchase_type():
    async with AsyncSessionLocal() as db:
        try:
            # 1. Find all PurchaseOrder IDs that have at least one item linked to consumable_purchase_waits
            # These were definitely created through the consumable order pipeline.
            stmt = select(PurchaseOrderItem.order_id).where(
                PurchaseOrderItem.consumable_purchase_wait_id.is_not(None)
            ).distinct()
            
            result = await db.execute(stmt)
            order_ids = [r[0] for r in result.fetchall()]
            
            if not order_ids:
                print("No consumable-linked purchase orders found to fix.")
                return

            print(f"Found {len(order_ids)} purchase orders that should be marked as 'CONSUMABLE'. IDs: {order_ids}")

            # 2. Update these orders
            update_stmt = update(PurchaseOrder).where(
                PurchaseOrder.id.in_(order_ids)
            ).values(purchase_type='CONSUMABLE')
            
            res = await db.execute(update_stmt)
            print(f"Updated {res.rowcount} purchase orders to 'CONSUMABLE' type.")
            
            await db.commit()
            print("Successfully fixed missing purchase_type for consumable orders.")
            
        except Exception as e:
            await db.rollback()
            print(f"Error during purchase_type fix: {traceback.format_exc() if 'traceback' in globals() else e}")

if __name__ == "__main__":
    asyncio.run(fix_purchase_type())
