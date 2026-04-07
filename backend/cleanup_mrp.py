import asyncio
import sys
import os

# Add the current directory to sys.path
sys.path.append(os.getcwd())

from sqlalchemy import select, or_
from app.api.deps import AsyncSessionLocal
from app.models.purchasing import MaterialRequirement
from app.models.production import ProductionPlan, ProductionStatus
from app.models.sales import SalesOrder, OrderStatus

async def cleanup_mrp():
    print("Starting MRP cleanup script...")
    async with AsyncSessionLocal() as db:
        # 1. Direct Plan link check
        stmt1 = (
            select(MaterialRequirement)
            .join(ProductionPlan, MaterialRequirement.plan_id == ProductionPlan.id)
            .where(
                MaterialRequirement.status == "PENDING",
                ProductionPlan.status == ProductionStatus.COMPLETED
            )
        )
        
        # 2. Direct Order link check (if plan was deleted but order is delivered)
        stmt2 = (
            select(MaterialRequirement)
            .join(SalesOrder, MaterialRequirement.order_id == SalesOrder.id)
            .where(
                MaterialRequirement.status == "PENDING",
                or_(
                    SalesOrder.status == OrderStatus.DELIVERY_COMPLETED,
                    SalesOrder.status == OrderStatus.PRODUCTION_COMPLETED
                )
            )
        )
        
        result1 = await db.execute(stmt1)
        mrs1 = result1.scalars().all()
        
        result2 = await db.execute(stmt2)
        mrs2 = result2.scalars().all()
        
        all_to_fix = {mr.id: mr for mr in mrs1 + mrs2}.values()
        
        print(f"Found {len(all_to_fix)} orphaned MaterialRequirement items to resolve.")
        
        for mr in all_to_fix:
            print(f"✅ Resolving MR ID {mr.id} (Status: PENDING -> COMPLETED)")
            mr.status = "COMPLETED"
            db.add(mr)
            
        if all_to_fix:
            await db.commit()
            print("\nDatabase update complete.")
        else:
            print("\nNo orphaned items found.")

if __name__ == "__main__":
    asyncio.run(cleanup_mrp())
