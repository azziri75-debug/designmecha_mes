import asyncio
import os
import sys

# Windows Python Path Fix
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, or_, func
from app.db.base import AsyncSessionLocal
from app.models.product import Product
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.inventory import StockProduction, StockProductionStatus

async def main():
    async with AsyncSessionLocal() as session:
        # Get all products that would fit into our WIP logic
        finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
        finished_plan_statuses = ['COMPLETED', 'CANCELED']
        finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]

        # 1. Get SO Wait Items
        print("--- SO WAIT ITEMS ---")
        subq_plan_items = select(ProductionPlanItem.product_id)\
            .join(ProductionPlan)\
            .where(ProductionPlan.order_id == SalesOrder.id)\
            .where(ProductionPlanItem.status.not_in(finished_plan_statuses))
            
        so_wait_items = await session.execute(
            select(Product.name, SalesOrder.order_no, SalesOrderItem.quantity, SalesOrder.status)
            .join(SalesOrderItem, SalesOrderItem.product_id == Product.id)
            .join(SalesOrder, SalesOrder.id == SalesOrderItem.order_id)
            .where(SalesOrder.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED]))
            .where(~SalesOrderItem.product_id.in_(subq_plan_items))
        )
        for row in so_wait_items.all():
            print(f"Product: {row[0]}, Order: {row[1]}, Qty: {row[2]}, Status: {row[3]}")

        # 2. Get SO Active Items
        print("\n--- SO ACTIVE ITEMS ---")
        active_plan_product_qty = select(
            Product.name,
            ProductionPlan.order_id,
            func.max(ProductionPlanItem.quantity).label('qty')
        ).select_from(ProductionPlanItem)\
        .join(ProductionPlan)\
        .join(Product, Product.id == ProductionPlanItem.product_id)\
        .where(ProductionPlanItem.status.not_in(finished_plan_statuses))\
        .where(ProductionPlan.order_id.is_not(None))\
        .group_by(Product.name, ProductionPlan.order_id)
        
        so_active_items = await session.execute(active_plan_product_qty)
        for row in so_active_items.all():
            print(f"Product: {row[0]}, OrderID: {row[1]}, MaxQty: {row[2]}")

if __name__ == "__main__":
    asyncio.run(main())
