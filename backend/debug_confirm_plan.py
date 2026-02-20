import asyncio
import sys
import os
from datetime import date

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.production import ProductionPlan, ProductionStatus
from app.api.endpoints.production import update_production_plan_status
from app.schemas import production as schemas

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Finding Production Plan ---")
        # Find the latest plan
        stmt = select(ProductionPlan).order_by(ProductionPlan.id.desc()).limit(1)
        result = await db.execute(stmt)
        plan = result.scalar_one_or_none()
        
        if not plan:
            print("No PLANNED ProductionPlan found. Finding ANY plan.")
            stmt = select(ProductionPlan).limit(1)
            result = await db.execute(stmt)
            plan = result.scalar_one_or_none()
            
        if not plan:
            print("No Plan found. Cannot test.")
            return

        print(f"Using Plan: {plan.id} (Status: {plan.status})")

        print("--- Calling update_production_plan_status (CONFIRMED) ---")
        try:
            # Test 1: Complete (Move to COMPLETED)
            new_status = ProductionStatus.COMPLETED
            print(f"Updating to {new_status}")
            
            # Function signature: plan_id, status, db
            updated_plan = await update_production_plan_status(
                plan_id=plan.id,
                status=new_status,
                db=db
            )
            print(f"*** SUCCESS ***")
            print(f"Plan Status Updated to: {updated_plan.status}")
            
        except Exception as e:
            print(f"*** FAILURE ***")
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
