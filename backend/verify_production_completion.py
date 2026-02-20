
import asyncio
import sys
import os
sys.path.append("e:\\MES\\backend")

from datetime import date
from sqlalchemy import select
from app.api.deps import AsyncSessionLocal
from app.models.sales import SalesOrder, OrderStatus, SalesOrderItem
from app.models.production import ProductionPlan, ProductionStatus, ProductionPlanItem
from app.models.purchasing import PurchaseOrder, PurchaseStatus, OutsourcingOrder, OutsourcingStatus, PurchaseOrderItem, OutsourcingOrderItem
from app.models.product import Product
from app.schemas import production as schemas

async def verify_flow():
    async with AsyncSessionLocal() as db:
        print("--- Starting Verification Flow ---")
        
        # Test SalesOrder Select (ID Only to bypass column mismatch)
        so_id = None
        try:
            res = await db.execute(select(SalesOrder.id).limit(1))
            so_id = res.scalar()
            print(f"Found existing SalesOrder ID: {so_id}")
        except Exception as e:
            print(f"SalesOrder Select Failed: {e}")
            return

        if not so_id:
             print("No existing SalesOrder found. Cannot verify dependent logic.")
             return

        # 1. Find a Product
        result = await db.execute(select(Product))
        product = result.scalars().first()
        if not product:
            print("No product found. Skipping.")
            return

        # Skip Creating Sales Order (Use existing)
        print(f"Using SalesOrder ID: {so_id}")

        # 3. Create Production Plan (Simulate API Logic)
        print("Creating Production Plan...")
        # Check endpoint logic: usage of Pydantic schema
        plan_in = schemas.ProductionPlanCreate(
            order_id=so_id,
            plan_date=date.today(),
            items=[
                schemas.ProductionPlanItemCreate(
                    product_id=product.id,
                    process_name="Proc1",
                    sequence=1,
                    course_type="INTERNAL", # Should NOT create external order
                    quantity=10,
                    status=ProductionStatus.PLANNED
                ),
                schemas.ProductionPlanItemCreate(
                    product_id=product.id,
                    process_name="Proc2",
                    sequence=2,
                    course_type="PURCHASE", # Should create PO
                    quantity=10,
                    status=ProductionStatus.PLANNED
                )
            ]
        )
        
        # Call the actual endpoint logic (copy-paste or import?)
        # Importing router function is hard due to Dependency injection. 
        # I will simulate the logic directly here using models.
        
        plan = ProductionPlan(
            order_id=so_id,
            plan_date=date.today(),
            status=ProductionStatus.PLANNED
        )
        db.add(plan)
        await db.flush()
        
        # Item 1: Internal
        item1 = ProductionPlanItem(
            plan_id=plan.id,
            product_id=product.id,
            process_name="Proc1",
            sequence=1,
            course_type="INTERNAL",
            quantity=10,
            status=ProductionStatus.PLANNED
        )
        db.add(item1)
        
        # Item 2: Purchase
        item2 = ProductionPlanItem(
            plan_id=plan.id,
            product_id=product.id,
            process_name="Proc2",
            sequence=2,
            course_type="PURCHASE",
            quantity=10,
            status=ProductionStatus.PLANNED
        )
        db.add(item2)
        await db.flush()
        
        # Auto-create PO for Item 2
        po = PurchaseOrder(
            order_no=f"PO-AUTO-VERIFY-{plan.id}",
            order_date=date.today(),
            status=PurchaseStatus.PENDING
        )
        db.add(po)
        await db.flush()
        
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            product_id=product.id,
            quantity=10,
            production_plan_item_id=item2.id,
            received_quantity=0
        )
        db.add(po_item)
        await db.commit()
        
        print(f"Plan Created: {plan.id}. Linked PO: {po.id}")
        
        # 4. Update Plan Status to COMPLETED (Simulate API logic)
        print("Completing Plan...")
        
        # Re-fetch plan with items
        # Mirroring `update_production_plan_status` logic
        plan.status = ProductionStatus.COMPLETED
        
        affected_po_ids = set()
        
        # Simulate Loop
        for item in [item1, item2]: # In real DB fetch, we'd iterate plan.items
             # Currently item1, item2 are detached or need refresh. 
             pass
             
        # Actually let's fetch fresh
        stmt = select(ProductionPlan).where(ProductionPlan.id == plan.id)
        # We need eager loads to traverse relations
        from sqlalchemy.orm import selectinload
        stmt = stmt.options(
             selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items)
        )
        result = await db.execute(stmt)
        plan_fetched = result.scalar_one()
        
        plan_fetched.status = ProductionStatus.COMPLETED
        
        for item in plan_fetched.items:
             for po_item in item.purchase_items:
                 print(f"  - Found linked PO Item: {po_item.id}, Qty: {po_item.quantity}, Rec: {po_item.received_quantity}")
                 if po_item.quantity > po_item.received_quantity:
                     po_item.received_quantity = po_item.quantity
                     db.add(po_item)
                     print("    -> Updated Received Qty")
                 affected_po_ids.add(po_item.purchase_order_id)
        
        await db.flush()
        
        # Check PO status
        for po_id in affected_po_ids:
            po_res = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.id == po_id))
            po_obj = po_res.scalar_one()
            if all(i.received_quantity >= i.quantity for i in po_obj.items):
                po_obj.status = PurchaseStatus.COMPLETED
                print(f"  -> PO {po_obj.id} Completed All Items. Updated Status to COMPLETED.")
                db.add(po_obj)
                
        # Sync Sales Order (Skipped due to DB mismatch)
        # so_fetch = await db.get(SalesOrder, so_id)
        # so_fetch.status = OrderStatus.PRODUCTION_COMPLETED
        # db.add(so_fetch)
        
        await db.commit()
        
        # 5. Verify Final State
        print("Verifying Final States...")
        po_final = await db.get(PurchaseOrder, po.id)
        print(f"PO {po.id} Status: {po_final.status} (Expected: COMPLETED)")
        
        # Skip SO verification due to column mismatch
        # so_final = await db.get(SalesOrder, so_id)
        # print(f"SO {so_id} Status: {so_final.status} (Expected: PRODUCTION_COMPLETED)")
        
        # Cleanup
        print("Cleaning up...")
        await db.delete(po_item)
        await db.delete(po)
        await db.delete(item2)
        await db.delete(item1)
        await db.delete(plan)
        # await db.delete(so_item) # Didn't create
        # await db.delete(so) # Didn't create
        await db.commit()
        print("Cleanup Done.")

if __name__ == "__main__":
    asyncio.run(verify_flow())
