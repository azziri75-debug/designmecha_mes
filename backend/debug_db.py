import asyncio
from sqlalchemy import select, text
from app.db.session import async_session
from app.models.purchasing import PurchaseOrder, PurchaseStatus

async def debug_completed_pos():
    async with async_session() as db:
        print("Checking completed POs in database...")
        
        # 1. Check all completed POs
        stmt = select(PurchaseOrder).where(PurchaseOrder.status == PurchaseStatus.COMPLETED)
        res = await db.execute(stmt)
        pos = res.scalars().all()
        print(f"Total COMPLETED POs: {len(pos)}")
        
        for po in pos:
            print(f"ID: {po.id}, No: {po.order_no}, Type: {po.purchase_type}, ActualDate: {po.actual_delivery_date}")
            
        # 2. Check POs where status is COMPLETED and type is PART
        stmt2 = select(PurchaseOrder).where(PurchaseOrder.status == PurchaseStatus.COMPLETED).where(PurchaseOrder.purchase_type == 'PART')
        res2 = await db.execute(stmt2)
        pos2 = res2.scalars().all()
        print(f"Total COMPLETED PART POs: {len(pos2)}")

if __name__ == "__main__":
    asyncio.run(debug_completed_pos())
