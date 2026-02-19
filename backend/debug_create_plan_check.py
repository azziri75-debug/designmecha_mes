
import asyncio
import sys
import os

from datetime import date

sys.path.append(os.path.join(os.getcwd(), 'app'))
sys.path.append(os.getcwd())

from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.production import ProductionPlan, ProductionPlanItem
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.product import Product, Process, ProductProcess
from app.models.basics import Partner

# Mock Data
MOCK_ORDER_NO = "TEST-ORDER-20260214-001"
MOCK_PRODUCT_NAME = "TEST-PRODUCT-AUTO-REG"

async def reproduction_test():
    print(f"Connecting to DB: {settings.SQLALCHEMY_DATABASE_URI}")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("\n--- 1. Setup Mock Data (Product, Order) ---")
        # Ensure clean state
        await db.execute(delete(ProductionPlanItem).where(ProductionPlanItem.process_name.like('%TEST%')))
        await db.execute(delete(ProductionPlan).where(ProductionPlan.id.in_(
            select(ProductionPlan.id).join(SalesOrder).where(SalesOrder.order_no == MOCK_ORDER_NO)
        )))
        await db.execute(delete(SalesOrderItem).where(SalesOrderItem.order_id.in_(
            select(SalesOrder.id).where(SalesOrder.order_no == MOCK_ORDER_NO)
        )))
        await db.execute(delete(SalesOrder).where(SalesOrder.order_no == MOCK_ORDER_NO))
        await db.commit()

        # Get or Create Partner
        partner = (await db.execute(select(Partner).limit(1))).scalar_one_or_none()
        if not partner:
            partner = Partner(name="Test Partner", code="TP01")
            db.add(partner)
            await db.flush()
        
        # Get or Create Product
        product = (await db.execute(select(Product).where(Product.name == MOCK_PRODUCT_NAME))).scalar_one_or_none()
        if not product:
            product = Product(name=MOCK_PRODUCT_NAME, specification="Spec 1", unit="EA")
            db.add(product)
            await db.flush()

        # Create Sales Order
        order = SalesOrder(order_no=MOCK_ORDER_NO, partner_id=partner.id, order_date=date.today(), delivery_date=date.today(), status="PENDING")
        db.add(order)
        await db.flush()
        
        order_item = SalesOrderItem(order_id=order.id, product_id=product.id, quantity=10, unit_price=1000)
        db.add(order_item)
        await db.commit()
        print(f"Created Order: {order.id} ({MOCK_ORDER_NO})")

        # --- 2. Call API to Create Production Plan ---
        print("\n--- 2. calling POST /production/plans ---")
        # We simulate the API payload exactly as the frontend would send
        payload = {
            "order_id": order.id,
            "plan_date": str(date.today()),
            "items": [
                {
                    "product_id": product.id,
                    "process_name": "Test Process Purchase",
                    "sequence": 1,
                    "course_type": "PURCHASE",  # <--- CRITICAL: Sending "PURCHASE"
                    "quantity": 10,
                    "status": "PLANNED",
                    "estimated_time": 0,
                    "partner_name": "Test Vendor",
                    "work_center": ""
                },
                 {
                    "product_id": product.id,
                    "process_name": "Test Process Outsourcing",
                    "sequence": 2,
                    "course_type": "OUTSOURCING", # <--- CRITICAL: Sending "OUTSOURCING"
                    "quantity": 10,
                    "status": "PLANNED",
                    "estimated_time": 0,
                    "partner_name": "Test Outsourcer",
                    "work_center": ""
                },
                {
                    "product_id": product.id,
                    "process_name": "Test Process Korean",
                    "sequence": 3,
                    "course_type": "구매",
                    "quantity": 10,
                    "status": "PLANNED",
                    "estimated_time": 0,
                    "partner_name": "Korean Vendor",
                    "work_center": ""
                }
            ]
        }
        
        # Note: We need a running server for HTTP, or we call the router function directly.
        # Calling function directly is faster and easier for debugging context.
        from app.api.endpoints.production import create_production_plan
        from app.schemas.production import ProductionPlanCreate
        
        # Convert dict to Pydantic model
        plan_in = ProductionPlanCreate(**payload)
        
        try:
            created_plan = await create_production_plan(plan_in=plan_in, db=db)
            print(f"Plan Created ID: {created_plan.id}")
        except Exception as e:
            print(f"!!! Creation Failed: {e}")
            return

        # --- 3. Inspect DB Content ---
        print("\n--- 3. Inspecting Saved DB Content ---")
        stmt = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == created_plan.id).order_by(ProductionPlanItem.sequence)
        items = (await db.execute(stmt)).scalars().all()
        
        for item in items:
            print(f"Item: {item.process_name}")
            print(f"  Saved Course Type: '{item.course_type}'")
            print(f"  Expected: 'PURCHASE' or 'OUTSOURCING'")
            
            if item.course_type not in ['PURCHASE', 'OUTSOURCING']:
                print("  [FAIL] Course Type mismatch!")
            else:
                print("  [PASS] Saved correctly.")

        # --- 4. Step-by-Step Query Analysis ---
        print("\n--- 4. Step-by-Step Query Analysis ---")
        
        # Step A: Find the Item directly
        stmt_a = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == created_plan.id).where(ProductionPlanItem.course_type == 'PURCHASE')
        item_a = (await db.execute(stmt_a)).scalars().first()
        print(f"  Step A (Direct Find): {item_a.id if item_a else 'Not Found'}")
        
        # Step B: Join Plan
        stmt_b = select(ProductionPlanItem).join(ProductionPlanItem.plan).where(ProductionPlanItem.id == item_a.id)
        item_b = (await db.execute(stmt_b)).scalars().first()
        print(f"  Step B (Join Plan): {item_b.id if item_b else 'Failed to Join Plan'}")
        
        # Step C: Check Plan Status
        stmt_c = select(ProductionPlanItem).join(ProductionPlanItem.plan).where(ProductionPlanItem.id == item_a.id).where(ProductionPlan.status.notin_(['CANCELED']))
        item_c = (await db.execute(stmt_c)).scalars().first()
        print(f"  Step C (Filter Plan Status 'CANCELED'): {item_c.id if item_c else 'Filtered by Plan Status'}")

        # Step C-2: Check Plan Status Enum
        from app.models.production import ProductionStatus
        stmt_c2 = select(ProductionPlanItem).join(ProductionPlanItem.plan).where(ProductionPlanItem.id == item_a.id).where(ProductionPlan.status.notin_([ProductionStatus.CANCELED]))
        item_c2 = (await db.execute(stmt_c2)).scalars().first()
        print(f"  Step C-2 (Filter Plan Status Enum): {item_c2.id if item_c2 else 'Filtered by Plan Status Enum'}")
        
        # Step D: Filter Course Type
        stmt_d = select(ProductionPlanItem).where(ProductionPlanItem.id == item_a.id).where(or_(ProductionPlanItem.course_type.ilike('%PURCHASE%'), ProductionPlanItem.course_type.like('%구매%')))
        item_d = (await db.execute(stmt_d)).scalars().first()
        print(f"  Step D (Filter Course Type): {item_d.id if item_d else 'Filtered by Course Type'}")
        
        # Step E: Outer Join PurchaseOrderItem
        from app.models.purchasing import PurchaseOrderItem
        stmt_e = select(ProductionPlanItem).outerjoin(PurchaseOrderItem, PurchaseOrderItem.production_plan_item_id == ProductionPlanItem.id)\
                 .where(ProductionPlanItem.id == item_a.id)\
                 .where(PurchaseOrderItem.id.is_(None))
        item_e = (await db.execute(stmt_e)).scalars().first()
        print(f"  Step E (Outer Join & Is Null): {item_e.id if item_e else 'Filtered by Existing Link'}")
        
        # Step F: Full Query Re-construction
        print("  Step F (Full Query Attempt)...")
        from app.api.endpoints.purchasing import read_pending_purchase_items
        final_items = await read_pending_purchase_items(db=db)
        found = any(i.id == item_a.id for i in final_items)
        print(f"  -> Found in Full Query: {found}")

    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(reproduction_test())
