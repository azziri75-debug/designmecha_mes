import asyncio
import sys
import os
import uuid
from datetime import date

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.basics import Partner
from app.models.production import ProductionPlan, ProductionPlanItem
from app.models.product import Product, Process, ProductProcess
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Setting up Data with Purchase Items ---")
        try:
            # 1. Create/Find Product
            result = await db.execute(select(Product).limit(1))
            product = result.scalar_one_or_none()
            if not product:
                print("No product found.")
                return

            # 2. Create Order
            order = SalesOrder(
                order_no=f"SO-REPRO-{uuid.uuid4().hex[:8]}",
                order_date=date.today(),
                partner_id=1
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
            await db.flush()

            # 1b. Create Second Product (Unloaded)
            product2 = Product(
                name="Unloaded Product",
                unit="EA",
                partner_id=1
            )
            db.add(product2)
            await db.flush()

            # 4. Create Plan Item (Linked to Product 1)
            plan_item = ProductionPlanItem(
                plan_id=plan.id,
                product_id=product.id,
                process_name="Test Process",
                sequence=1,
                course_type="PURCHASE",
                status="PLANNED",
                quantity=10
            )
            db.add(plan_item)
            await db.flush()

            # 5. Create Purchase Order linked to Plan Item
            po = PurchaseOrder(
                order_no=f"PO-REPRO-{uuid.uuid4().hex[:8]}",
                order_date=date.today(),
                status=PurchaseStatus.PENDING
            )
            db.add(po)
            await db.flush()

            # PO Item linked to PRODUCT 2 (Not loaded by Plan Query)
            po_item = PurchaseOrderItem(
                purchase_order_id=po.id,
                product_id=product2.id, 
                quantity=10,
                production_plan_item_id=plan_item.id 
            )
            db.add(po_item)
            
            # 6. Create Outsourcing Order linked to Plan Item (to be sure)
            oo = OutsourcingOrder(
                order_no=f"OO-REPRO-{uuid.uuid4().hex[:8]}",
                order_date=date.today(),
                status=OutsourcingStatus.PENDING
            )
            db.add(oo)
            await db.flush()

            oo_item = OutsourcingOrderItem(
                outsourcing_order_id=oo.id,
                product_id=product.id,
                quantity=10,
                production_plan_item_id=plan_item.id # LINK HERE
            )
            db.add(oo_item)
            
            await db.commit()
            print("--- Data Setup Complete ---")

            # 7. Simulate GET /plans query
            print("--- Simulating GET /plans Query ---")
            # Copy options directly from endpoints/production.py (current state)
            from sqlalchemy.orm import selectinload
            
            query = select(ProductionPlan).options(
                selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
                selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
                selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
                selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
            ).where(ProductionPlan.id == plan.id)
            
            result = await db.execute(query)
            fetched_plan = result.scalar_one()
            
            print("SQL Query Successful.")
            
            # 8. Pydantic Validation
            from app.schemas.production import ProductionPlan as ProductionPlanSchema
            print("--- Attempting Pydantic Validation (ProductionPlan FULL) ---")
            pydantic_plan = ProductionPlanSchema.model_validate(fetched_plan)
            print("--- Validation Success ---")

        except Exception as e:
            print(f"--- FAILED: {e} ---")
            import traceback
            traceback.print_exc()
            await db.rollback()
        finally:
            # Cleanup
            pass

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
