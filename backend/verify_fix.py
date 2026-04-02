import asyncio
from sqlalchemy import select, text
from app.models.sales import SalesOrder, OrderStatus
from app.models.production import ProductionPlan
from app.api import deps
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def find_orphans():
    async with async_session() as db:
        # Check current orphans
        stmt = select(SalesOrder.id, SalesOrder.order_no, SalesOrder.status)\
            .outerjoin(ProductionPlan)\
            .where(SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.PRODUCTION_COMPLETED]))\
            .where(ProductionPlan.id == None)
        
        res = await db.execute(stmt)
        orphans = res.all()
        
        if not orphans:
            print("No orphaned orders found.")
        else:
            for row in orphans:
                print(f"Orphan found: {row}")
            
            print(f"Applying fix to {len(orphans)} orphans...")
            patch_stmt = text("""
                UPDATE sales_orders 
                SET status = 'CONFIRMED' 
                WHERE status IN ('PRODUCTION_COMPLETED', 'DELIVERY_COMPLETED')
                AND id NOT IN (SELECT order_id FROM production_plans WHERE order_id IS NOT NULL)
            """)
            await db.execute(patch_stmt)
            await db.commit()
            print("Status reset successfully.")

if __name__ == "__main__":
    asyncio.run(find_orphans())
