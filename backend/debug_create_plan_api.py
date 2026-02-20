import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.sales import SalesOrder
from app.api.endpoints.production import create_production_plan
from app.schemas import production as schemas
from datetime import date

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Finding Sales Order ---")
        # Find a confirmed sales order to use
        stmt = select(SalesOrder).limit(1)
        result = await db.execute(stmt)
        so = result.scalar_one_or_none()
        
        if not so:
            print("No SalesOrder found. Creating one...")
            from app.models.sales import OrderStatus
            so = SalesOrder(order_no="TEST-SO-API-001", order_date=date.today(), status=OrderStatus.CONFIRMED)
            db.add(so)
            await db.commit()
            await db.refresh(so)
            
        print(f"Using SalesOrder: {so.id} ({so.order_no})")

        # Cleanup existing plan
        from app.models.production import ProductionPlan
        existing_plan_res = await db.execute(select(ProductionPlan).where(ProductionPlan.order_id == so.id))
        existing_plan = existing_plan_res.scalar_one_or_none()
        if existing_plan:
            print(f"Deleting existing plan: {existing_plan.id}")
            await db.delete(existing_plan)
            await db.commit()

        # Find a product
        from app.models.product import Product
        product_res = await db.execute(select(Product).limit(1))
        product = product_res.scalar_one_or_none()
        if not product:
            print("No Product found. Cannot test.")
            return
        print(f"Using Product: {product.id} ({product.name})")

        print("--- constructing Payload ---")
        plan_in = schemas.ProductionPlanCreate(
            order_id=so.id,
            plan_date=date.today(),
            items=[
                schemas.ProductionPlanItemCreate(
                    product_id=product.id,
                    process_name="Test Process",
                    sequence=1,
                    course_type="PURCHASE", # Trigger Auto-Creation
                    quantity=10
                )
            ]
        )

        print("--- Calling create_production_plan ---")
        try:
            plan = await create_production_plan(plan_in, db)
            print(f"*** SUCCESS ***")
            print(f"Plan Created: {plan.id}")
            print(f"Items: {len(plan.items)}")
            if plan.items:
                 print(f"Item 1 Purchases: {len(plan.items[0].purchase_items)}")
        except Exception as e:
            print(f"*** FAILURE ***")
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
