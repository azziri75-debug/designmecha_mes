
import asyncio
import sys
import os
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.join(os.getcwd(), 'app'))
sys.path.append(os.getcwd())

from app.core.config import settings
from app.models.production import ProductionPlan, ProductionPlanItem
from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem

async def inspect():
    print(f"Connecting to DB: {settings.SQLALCHEMY_DATABASE_URI}")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("\n--- Inspecting Last 5 Production Plans ---")
        stmt = select(ProductionPlan).order_by(desc(ProductionPlan.id)).limit(5)
        plans = (await db.execute(stmt)).scalars().all()
        
        for plan in plans:
            print(f"\n[Plan ID: {plan.id}] Date: {plan.plan_date}, Status: {plan.status}")
            
            stmt_items = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan.id).order_by(ProductionPlanItem.sequence)
            items = (await db.execute(stmt_items)).scalars().all()
            
            for item in items:
                print(f"  - Item {item.sequence}: {item.process_name} | Type: '{item.course_type}' | Status: {item.status}")
                
                # Check Links
                stmt_po = select(PurchaseOrderItem).where(PurchaseOrderItem.production_plan_item_id == item.id)
                po = (await db.execute(stmt_po)).scalars().first()
                if po:
                    print(f"    -> Linked to PurchaseOrder {po.id}")
                    
                stmt_oo = select(OutsourcingOrderItem).where(OutsourcingOrderItem.production_plan_item_id == item.id)
                oo = (await db.execute(stmt_oo)).scalars().first()
                if oo:
                    print(f"    -> Linked to OutsourcingOrder {oo.id}")
                    
                # Check specific conditions for auto-reg
                is_purchase = 'purchase' in str(item.course_type).lower() or '구매' in str(item.course_type)
                is_outsourcing = 'outsourcing' in str(item.course_type).lower() or '외주' in str(item.course_type)
                
                if is_purchase and not po:
                    print("    => [CANDIDATE] Should show in Purchase Pending")
                if is_outsourcing and not oo:
                    print("    => [CANDIDATE] Should show in Outsourcing Pending")

    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(inspect())
