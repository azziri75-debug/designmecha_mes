import asyncio
import sys
import os

# Create a fake environment to make imports work if run directly
sys.path.append(os.getcwd())

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.api.deps import AsyncSessionLocal
from app.models.production import ProductionPlan, ProductionPlanItem
from app.models.sales import SalesOrder, SalesOrderItem

async def check_data():
    from app.core.config import settings
    print(f"Using Database URL: {settings.SQLALCHEMY_DATABASE_URI}")
    async with AsyncSessionLocal() as db:
        print("="*50)
        print("checking SALES ORDERS (Unplanned)")
        print("="*50)
        # Fetch Sales Orders that might be pending
        query = select(SalesOrder).options(selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)).order_by(SalesOrder.id.desc()).limit(5)
        result = await db.execute(query)
        orders = result.scalars().all()
        
        for order in orders:
            print(f"[Order #{order.id}] No: {order.order_no}, Partner: {order.partner_id}, Date: {order.order_date}, Status: {order.status}")
            for item in order.items:
                p_name = item.product.name if item.product else "N/A"
                print(f"  - Item ID: {item.id}, Product: {item.product_id} ({p_name}), Qty: {item.quantity}")

        print("\n" + "="*50)
        print("Checking PRODUCTION PLANS")
        print("="*50)
        # Fetch Production Plans
        query = select(ProductionPlan).options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.order)
        ).order_by(ProductionPlan.id.desc()).limit(5)
        result = await db.execute(query)
        plans = result.scalars().all()
        
        for plan in plans:
            order_no = plan.order.order_no if plan.order else "N/A"
            print(f"[Plan #{plan.id}] Date: {plan.plan_date}, OrderID: {plan.order_id} ({order_no}), Status: {plan.status}")
            for item in plan.items:
                p_name = item.product.name if item.product else "N/A"
                print(f"  - Item ID: {item.id}, Product: {item.product_id} ({p_name}), Type: '{item.course_type}', Status: {item.status}, Qty: {item.quantity}")
                
if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(check_data())
