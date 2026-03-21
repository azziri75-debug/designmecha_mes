
import asyncio
from sqlalchemy import select, func, or_
from app.api.deps import AsyncSessionLocal
from app.models.product import Product
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.inventory import Stock, StockProduction

async def deep_debug():
    async with AsyncSessionLocal() as db:
        finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
        finished_plan_statuses = ['COMPLETED', 'CANCELED', "CANCELLED"]

        # 1. Get all unique product IDs from active Sales Orders
        so_products_stmt = select(SalesOrderItem.product_id, SalesOrder.order_no, Product.name, Product.item_type).join(SalesOrder).join(Product).where(
            SalesOrder.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED])
        ).distinct()
        so_products = (await db.execute(so_products_stmt)).all()
        
        # 2. Get all unique product IDs from active Production Plans
        plan_products_stmt = select(ProductionPlanItem.product_id, ProductionPlan.id, Product.name, Product.item_type).join(ProductionPlan).join(Product).where(
            ProductionPlanItem.status.not_in(finished_plan_statuses)
        ).distinct()
        plan_products = (await db.execute(plan_products_stmt)).all()

        active_product_ids = set([p[0] for p in so_products]) | set([p[0] for p in plan_products])
        print(f"Active Product IDs in SO/Plans: {active_product_ids}")

        # 3. Get what read_stocks would return
        read_stocks_stmt = select(Product.id, Product.name, Product.item_type).where(
            or_(Product.item_type != 'CONSUMABLE', Product.item_type.is_(None))
        )
        returned_products = (await db.execute(read_stocks_stmt)).all()
        returned_ids = set([p[0] for p in returned_products])
        print(f"Product IDs returned by read_stocks (after CONSUMABLE filter): {returned_ids}")

        missing_ids = active_product_ids - returned_ids
        print(f"\nMissing IDs from Inventory List: {missing_ids}")
        
        if missing_ids:
            res = await db.execute(select(Product.id, Product.name, Product.item_type).where(Product.id.in_(missing_ids)))
            missing_info = res.all()
            for p in missing_info:
                print(f"  -> ID: {p.id}, Name: {p.name}, Type: {p.item_type}")
        else:
            print("  -> No items are missing after CONSUMABLE filter.")

        # 4. Check for duplicates (same Product appearing multiple times in the result)
        main_query = select(Product.id, func.count(Product.id)).outerjoin(Stock, Stock.product_id == Product.id).where(
             or_(Product.item_type != 'CONSUMABLE', Product.item_type.is_(None))
        ).group_by(Product.id).having(func.count(Product.id) > 1)
        duplicates = (await db.execute(main_query)).all()
        if duplicates:
            print(f"\nDuplicate Products in read_stocks output: {duplicates}")

if __name__ == "__main__":
    asyncio.run(deep_debug())
