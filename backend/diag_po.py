import asyncio
from sqlalchemy import select, desc
from app.db.session import SessionLocal
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem

async def diag():
    async with SessionLocal() as db:
        print('--- Recently Created Purchase Orders ---')
        stmt = select(PurchaseOrder).order_by(desc(PurchaseOrder.id)).limit(10)
        res = await db.execute(stmt)
        pos = res.scalars().all()
        for po in pos:
            print(f'ID: {po.id}, No: {po.order_no}, Status: {po.status}, Type: {po.purchase_type}, Date: {po.actual_delivery_date}, OrderID: {po.order_id}')
            # Check items
            items_stmt = select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
            items_res = await db.execute(items_stmt)
            items = items_res.scalars().all()
            for item in items:
                print(f'  - Item ProductID: {item.product_id}, Qty: {item.quantity}')
        
        print('\n--- Completed Orders Status ---')
        completed_stmt = select(PurchaseOrder).where(PurchaseOrder.status == 'COMPLETED')
        count = (await db.execute(select(desc(PurchaseOrder.id)).where(PurchaseOrder.status == 'COMPLETED'))).all()
        print(f'Total COMPLETED: {len(count)}')

if __name__ == "__main__":
    asyncio.run(diag())
