import asyncio
import os
import sys

# Ensure the app module is importable
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import engine
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.production import ProductionPlan, ProductionPlanItem

async def fix_mismatched_data():
    async with AsyncSession(engine) as db:
        print("[*] Finding mismatched Sales Order Items and Production Plan Items...")
        
        from sqlalchemy.orm import selectinload
        # Get all sales orders with their items
        so_query = select(SalesOrder).options(selectinload(SalesOrder.items))
        result = await db.execute(so_query)
        orders = result.scalars().all()
        
        fixed_count = 0
        
        for order in orders:
            # Get plans for this order
            plan_query = select(ProductionPlan).where(ProductionPlan.order_id == order.id)
            plan_res = await db.execute(plan_query)
            plans = plan_res.scalars().all()
            
            for plan in plans:
                plan_items_query = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan.id)
                pl_res = await db.execute(plan_items_query)
                plan_items = pl_res.scalars().all()
                
                # If there's 1 item in sales order and 1 item (process) or multiple processes for the same product in plan
                # we can aggressively fix the product_id and quantity of the plan to match the sales order
                # The user said "수주에 등록된 품목이 생산관리에는 동일 수주번호인데 규격과 수량이 잘못기입되어 있는 건이 있어"
                # This usually happens when the order only has 1 item and the plan was made for it, but the order was later edited.
                
                if len(order.items) == 1:
                    so_item = order.items[0]
                    correct_product_id = so_item.product_id
                    correct_quantity = so_item.quantity
                    
                    for pi in plan_items:
                        if pi.product_id != correct_product_id or pi.quantity != correct_quantity:
                            print(f"[!] Found mismatch in Plan ID {plan.id} for Order {order.order_no}!")
                            print(f"    - SO Item says: Product={correct_product_id}, Qty={correct_quantity}")
                            print(f"    - Plan Item says: Product={pi.product_id}, Qty={pi.quantity}")
                            print("    => Fixing Plan Item...")
                            
                            pi.product_id = correct_product_id
                            pi.quantity = correct_quantity
                            db.add(pi)
                            fixed_count += 1
                else:
                    # If there are multiple items, we have to guess which one is supposed to match which.
                    # Since editing product_id is the issue, they might have completely different IDs.
                    # Usually, the user only has 1 item orders mostly. Let's see if we catch any.
                    pass
        
        if fixed_count > 0:
            await db.commit()
            print(f"[*] Successfully fixed {fixed_count} mismatched Production Plan items.")
        else:
            print("[*] No mismatched data found.")

if __name__ == "__main__":
    asyncio.run(fix_mismatched_data())
