import asyncio
import sys
import os
from datetime import date

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.production import ProductionPlanItem
from app.api.endpoints.purchasing import create_purchase_order
from app.schemas import purchasing as schemas

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Finding Production Plan Item ---")
        # Find any item. Ideally from Plan 7 created earlier.
        stmt = select(ProductionPlanItem).limit(1).order_by(ProductionPlanItem.id.desc())
        result = await db.execute(stmt)
        plan_item = result.scalar_one_or_none()
        
        if not plan_item:
            print("No ProductionPlanItem found. Cannot test.")
            return
        print(f"Using ProductionPlanItem: {plan_item.id} (Product: {plan_item.product_id})")

        print("--- Constructing Payload ---")
        # Need a partner ID. Get first partner.
        from app.models.basics import Partner
        p_res = await db.execute(select(Partner).limit(1))
        partner = p_res.scalar_one_or_none()
        partner_id = partner.id if partner else None
        print(f"Using Partner: {partner_id}")

        order_in = schemas.PurchaseOrderCreate(
            partner_id=partner_id,
            order_date=date.today(),
            status="PENDING",
            items=[
                schemas.PurchaseOrderItemCreate(
                    product_id=plan_item.product_id,
                    quantity=plan_item.quantity,
                    unit_price=100.0,
                    note="Debug Order",
                    production_plan_item_id=plan_item.id
                )
            ]
        )

        print("--- Calling create_purchase_order ---")
        try:
            po = await create_purchase_order(order_in, db)
            print(f"*** SUCCESS ***")
            print(f"PO Created: {po.id} ({po.order_no})")
            print(f"Items: {len(po.items)}")
        except Exception as e:
            print(f"*** FAILURE ***")
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
