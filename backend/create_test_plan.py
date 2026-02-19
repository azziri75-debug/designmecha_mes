import asyncio
import sys
import os
from datetime import date

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.product import Product, ProductProcess, Process
from app.models.basics import Partner

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Creating Test Data ---")
        try:
            # 1. Partner
            partner = Partner(name="Test Partner")
            db.add(partner)
            await db.flush()
            
            # 2. Products and Processes
            proc1 = Process(name="Test Process 1", course_type="INTERNAL")
            proc2 = Process(name="Test Process 2", course_type="PURCHASE")
            db.add_all([proc1, proc2])
            await db.flush()
            
            prod = Product(name="Test Product", partner_id=partner.id)
            db.add(prod)
            await db.flush()
            
            pp1 = ProductProcess(product_id=prod.id, process_id=proc1.id, sequence=1)
            pp2 = ProductProcess(product_id=prod.id, process_id=proc2.id, sequence=2)
            db.add_all([pp1, pp2])
            
            # 3. Order
            order = SalesOrder(partner_id=partner.id, order_date=date.today(), delivery_date=date.today(), status=OrderStatus.CONFIRMED)
            db.add(order)
            await db.flush()
            
            order_item = SalesOrderItem(order_id=order.id, product_id=prod.id, quantity=10, unit_price=1000)
            db.add(order_item)
            
            # 4. Plan
            plan = ProductionPlan(order_id=order.id, plan_date=date.today(), status=ProductionStatus.PLANNED)
            db.add(plan)
            await db.flush()
            
            plan_item1 = ProductionPlanItem(plan_id=plan.id, product_id=prod.id, process_name="Test Process 1", sequence=1, course_type="INTERNAL", quantity=10)
            plan_item2 = ProductionPlanItem(plan_id=plan.id, product_id=prod.id, process_name="Test Process 2", sequence=2, course_type="PURCHASE", quantity=10)
            db.add_all([plan_item1, plan_item2])
            
            await db.commit()
            print("--- Test Data Created Successfully ---")
            
        except Exception as e:
            print(f"--- FAILED: {e} ---")
            import traceback
            traceback.print_exc()
            await db.rollback()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
