
import asyncio
from app.db.session import SessionLocal
from app.api.endpoints import production
from app.schemas import production as schemas
from datetime import date
from app.models.sales import SalesOrder
from sqlalchemy import select

async def reproduce():
    async with SessionLocal() as db:
        # Find a confirmed order to plan for
        result = await db.execute(select(SalesOrder))
        orders = result.scalars().all()
        if not orders:
            print("No orders found")
            return
        
        target_order = orders[0]
        print(f"Testing with Order ID: {target_order.id}")

        # Construct payload
        plan_in = schemas.ProductionPlanCreate(
            order_id=target_order.id,
            plan_date=date.today(),
            items=[
                schemas.ProductionPlanItemCreate(
                    product_id=1, # Assumption
                    process_name="Test Process",
                    sequence=1,
                    course_type="INTERNAL",
                    quantity=10
                )
            ]
        )

        try:
            # Simulate endpoint call
            # We need to mock dependency/context or just call logic if possible, 
            # but usually it's better to hit the endpoint logic directly or via TestClient.
            # For quick check, let's try to instantiate the Schema to see if Pydantic errors.
            print("Schema validation passed:", plan_in)
            
            # Now let's try to simulate what create_production_plan does
            from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
            
            # Check if plan exists (logic from endpoint)
            # ...
            
            print("Simulation finished (Schema OK). Context: The error might be in the Endpoint logic.")
            
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(reproduce())
