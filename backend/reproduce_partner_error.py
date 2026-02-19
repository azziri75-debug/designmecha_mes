import asyncio
import sys
import os
from datetime import date

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.sales import SalesOrder
from app.models.production import ProductionPlan
from app.models.basics import Partner, Contact

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Setting up Data with Partner Contacts ---")
        try:
            # 1. Create Partner with Contact
            partner = Partner(
                name="Test Partner with Contact",
                partner_type=["CUSTOMER"]
            )
            db.add(partner)
            await db.flush()

            contact = Contact(
                partner_id=partner.id,
                name="Mr. Test",
                email="test@example.com"
            )
            db.add(contact)
            
            # 2. Create Order
            order = SalesOrder(
                order_no="SO-REPRO-CONTACT-001",
                order_date=date.today(),
                partner_id=partner.id,
                status="CONFIRMED"
            )
            db.add(order)
            await db.flush()

            # 3. Create Plan
            plan = ProductionPlan(
                order_id=order.id,
                plan_date=date.today(),
                status="PLANNED"
            )
            db.add(plan)
            await db.commit()
            print(f"Data Setup Complete. Plan ID: {plan.id}")

            # 4. Simulate GET /plans query (Current Production Code)
            print("--- Simulating GET /plans Query ---")
            from sqlalchemy.orm import selectinload
            from app.models.production import ProductionPlanItem
            from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem

            # EXACT options from app/api/endpoints/production.py (as of last edit)
            query = select(ProductionPlan).options(
                selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
                selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
                selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
                selectinload(ProductionPlan.order).selectinload(SalesOrder.partner) # NOTE: No contacts loaded
            ).where(ProductionPlan.id == plan.id)
            
            result = await db.execute(query)
            fetched_plan = result.scalar_one()
            
            print("SQL Query Successful.")
            
            # 5. Pydantic Validation
            from app.schemas.production import ProductionPlan as ProductionPlanSchema
            print("--- Attempting Pydantic Validation (ProductionPlan FULL) ---")
            pydantic_plan = ProductionPlanSchema.model_validate(fetched_plan)
            print("--- Validation Success ---")

        except Exception as e:
            print(f"--- FAILED: {e} ---")
            import traceback
            traceback.print_exc()
            await db.rollback()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
