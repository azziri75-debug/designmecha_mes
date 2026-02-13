
import asyncio
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'app'))
sys.path.append(os.getcwd())

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.production import ProductionPlan, ProductionPlanItem
from app.models.sales import SalesOrder
from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem

async def debug_deep():
    print(f"Connecting to DB: {settings.SQLALCHEMY_DATABASE_URI}")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("\n--- Listing ALL Orders to find target ---")
        stmt = select(SalesOrder.id, SalesOrder.order_no)
        result = await db.execute(stmt)
        rows = result.all()
        
        target_order_id = None
        for r in rows:
            print(f"  ID: {r.id}, No: '{r.order_no}'")
            if "20260213" in r.order_no:
                target_order_id = r.id
                print(f"  -> MATCH FOUND! Target ID = {target_order_id}")

        if not target_order_id:
            # If no match, just take the latest one that has a plan
            print("No order matching '20260213' found. Checking latest plan...")
            stmt = select(ProductionPlan).order_by(ProductionPlan.id.desc()).limit(1)
            result = await db.execute(stmt)
            plan = result.scalars().first()
        else:
            stmt = select(ProductionPlan).where(ProductionPlan.order_id == target_order_id)
            result = await db.execute(stmt)
            plan = result.scalars().first()

        if not plan:
            print("!!! No Production Plan found.")
            return

        print(f"\nFound Plan: ID={plan.id}, Status='{plan.status}', OrderID={plan.order_id}")

        print(f"\n--- 3. Inspecting Plan Items for Plan ID {plan.id} ---")
        stmt = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan.id)
        result = await db.execute(stmt)
        items = result.scalars().all()

        for item in items:
            print(f"\n[Item ID: {item.id}]")
            print(f"  Process: '{item.process_name}'")
            print(f"  CourseType Raw: '{item.course_type}' (Repr: {repr(item.course_type)})")
            
            # Check if linked to Purchase Order
            stmt_po = select(PurchaseOrderItem).where(PurchaseOrderItem.production_plan_item_id == item.id)
            result_po = await db.execute(stmt_po)
            po_link = result_po.scalars().first()
            if po_link:
                print(f"  !!! LINKED to PurchaseOrderItem ID: {po_link.id}")
            else:
                 print(f"  Not linked to PurchaseOrderItem")

            # Check if linked to Outsourcing Order
            stmt_oo = select(OutsourcingOrderItem).where(OutsourcingOrderItem.production_plan_item_id == item.id)
            result_oo = await db.execute(stmt_oo)
            oo_link = result_oo.scalars().first()
            if oo_link:
                print(f"  !!! LINKED to OutsourcingOrderItem ID: {oo_link.id}")
            else:
                 print(f"  Not linked to OutsourcingOrderItem")

            # Check matching logic
            is_purchase = item.course_type in ['PURCHASE', '구매', 'Purchase']
            is_outsourcing = item.course_type in ['OUTSOURCING', '외주', 'Outsourcing']
            print(f"  Matches PURCHASE logic? {is_purchase}")
            print(f"  Matches OUTSOURCING logic? {is_outsourcing}")

    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(debug_deep())
