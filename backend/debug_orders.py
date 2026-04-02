import asyncio
from sqlalchemy import select, desc
from app.models.purchasing import PurchaseOrder, PurchaseStatus, OutsourcingOrder, OutsourcingStatus
from app.api import deps
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

async def check_data():
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        print("Checking COMPLETED Purchase Orders...")
        stmt = select(PurchaseOrder).where(PurchaseOrder.status == PurchaseStatus.COMPLETED).order_by(desc(PurchaseOrder.id)).limit(5)
        res = await db.execute(stmt)
        for po in res.scalars().all():
            print(f"PO ID: {po.id}, No: {po.order_no}, Status: {po.status}, OrderDate: {po.order_date}, ActualDate: {po.actual_delivery_date}")
            
        print("\nChecking COMPLETED Outsourcing Orders...")
        stmt2 = select(OutsourcingOrder).where(OutsourcingOrder.status == OutsourcingStatus.COMPLETED).order_by(desc(OutsourcingOrder.id)).limit(5)
        res2 = await db.execute(stmt2)
        for oo in res2.scalars().all():
            print(f"OO ID: {oo.id}, No: {oo.order_no}, Status: {oo.status}, OrderDate: {oo.order_date}, ActualDate: {oo.actual_delivery_date}")

if __name__ == "__main__":
    asyncio.run(check_data())
