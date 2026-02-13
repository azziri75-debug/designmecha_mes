
import asyncio
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'app'))
sys.path.append(os.getcwd())

from sqlalchemy import select, text, or_, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.sales import SalesOrder
from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem

async def analyze_failure():
    print(f"Connecting to DB: {settings.SQLALCHEMY_DATABASE_URI}")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("\n=== AUTO-REGISTRATION FAILURE ANALYSIS ===")
        
        # 1. Broad Search for the Order
        print("\n1. Searching for Order matching '20260213'...")
        stmt = select(SalesOrder).where(SalesOrder.order_no.like('%20260213%'))
        result = await db.execute(stmt)
        orders = result.scalars().all()
        
        target_plan = None
        
        if not orders:
            print("  -> No order found matching '20260213'.")
            print("  -> Checking ALL plans to find one with potential relevant items...")
            # Fallback: Find any plan with items having '구매' or '외주'
            stmt = select(ProductionPlan).join(ProductionPlanItem).where(
                or_(
                    ProductionPlanItem.course_type.like('%구매%'),
                    ProductionPlanItem.course_type.like('%외주%'),
                    ProductionPlanItem.course_type.ilike('%purchase%'),
                    ProductionPlanItem.course_type.ilike('%outsourcing%')
                )
            ).limit(1)
            result = await db.execute(stmt)
            target_plan = result.scalars().first()
        else:
            print(f"  -> Found {len(orders)} Orders.")
            for o in orders:
                print(f"    Order ID: {o.id}, No: {o.order_no}")
                # Check for plan
                stmt_p = select(ProductionPlan).where(ProductionPlan.order_id == o.id)
                res_p = await db.execute(stmt_p)
                p = res_p.scalars().first()
                if p:
                    print(f"      -> Linked Plan ID: {p.id}, Status: {p.status}")
                    target_plan = p
                    break
                else:
                    print("      -> No Plan linked.")

        if not target_plan:
            print("\n!!! COULD NOT IDENTIFY TARGET PLAN. Aborting Analysis.")
            return

        print(f"\n2. Analyzing Plan ID {target_plan.id} (Order: {target_plan.order_id if target_plan else '?'})")
        print(f"   Plan Status: {target_plan.status}")
        
        # Check Plan Status Filter
        if target_plan.status == ProductionStatus.CANCELED:
            print("   [FAIL] Plan is CANCELED. Items will be ignored.")
        else:
             print("   [PASS] Plan status is valid (not CANCELED).")

        # 3. Analyze Items
        stmt = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == target_plan.id)
        result = await db.execute(stmt)
        items = result.scalars().all()
        
        print(f"\n3. Item Analysis ({len(items)} items)")
        
        for item in items:
            print(f"\n  [Item ID: {item.id}] '{item.process_name}'")
            print(f"    - Course Type: '{item.course_type}' (Raw bytes: {item.course_type.encode('utf-8')})")
            
            # Test Filter Logic
            is_purchase_candidate = False
            is_outsourcing_candidate = False
            
            # Python-side simulation of SQL ilike/like logic
            ct_lower = item.course_type.lower()
            if 'purchase' in ct_lower or '구매' in item.course_type:
                is_purchase_candidate = True
            if 'outsourcing' in ct_lower or '외주' in item.course_type:
                is_outsourcing_candidate = True
                
            print(f"    - Candidates: Purchase? {is_purchase_candidate}, Outsourcing? {is_outsourcing_candidate}")
            
            # Check for Existing Links (Phantom Links)
            stmt_po = select(PurchaseOrderItem).where(PurchaseOrderItem.production_plan_item_id == item.id)
            po = (await db.execute(stmt_po)).scalars().first()
            
            stmt_oo = select(OutsourcingOrderItem).where(OutsourcingOrderItem.production_plan_item_id == item.id)
            oo = (await db.execute(stmt_oo)).scalars().first()
            
            if po:
                print(f"    - [FAIL] Linked to PurchaseOrderItem ID {po.id} (Order ID: {po.purchase_order_id})")
            else:
                print("    - [PASS] Not linked to PurchaseOrder")
                
            if oo:
                 print(f"    - [FAIL] Linked to OutsourcingOrderItem ID {oo.id} (Order ID: {oo.outsourcing_order_id})")
            else:
                 print("    - [PASS] Not linked to OutsourcingOrder")
                 
            # Final Verdict
            if is_purchase_candidate and not po:
                print("    => SHOULD BE VISIBLE in Purchase Pending List")
            elif is_outsourcing_candidate and not oo:
                print("    => SHOULD BE VISIBLE in Outsourcing Pending List")
            else:
                print("    => Correctly Excluded")

    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(analyze_failure())
