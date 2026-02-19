import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.sales import SalesOrder
from app.models.production import ProductionPlan

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Listing Recent Orders ---")
        try:
            # List top 5 orders
            query = select(SalesOrder).order_by(SalesOrder.id.desc()).limit(5)
            result = await db.execute(query)
            orders = result.scalars().all()
            
            for o in orders:
                print(f"ID: {o.id}, OrderNo: '{o.order_no}', Status: {o.status}")
                
                # Check plan for each
                plan_query = select(ProductionPlan).where(ProductionPlan.order_id == o.id)
                plan_result = await db.execute(plan_query)
                plan = plan_result.scalar_one_or_none()
                if plan:
                    print(f"  -> Has Plan: ID={plan.id}, Status={plan.status}")
                else:
                    print(f"  -> No Plan")

        except Exception as e:
            print(f"--- FAILED: {e} ---")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
