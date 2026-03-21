
import asyncio
from sqlalchemy import select, func, or_
from app.db_manager import SessionLocal
from app.models.product import Product
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus

async def debug_inventory_count():
    async with SessionLocal() as db:
        # 1. Total Products
        res = await db.execute(select(func.count(Product.id)))
        total_products = res.scalar()
        print(f"Total Products in DB: {total_products}")

        # 2. Products by type
        res = await db.execute(select(Product.item_type, func.count(Product.id)).group_by(Product.item_type))
        types = res.all()
        print(f"Products by type: {types}")

        # 3. Products in Orders (Pending)
        # Pending Orders: SalesOrder.status in ('PENDING', 'CONFIRMED')
        # AND NOT IN ProductionPlan
        plan_order_ids_stmt = select(ProductionPlan.order_id).where(ProductionPlan.order_id.is_not(None))
        plan_order_ids = (await db.execute(plan_order_ids_stmt)).scalars().all()
        
        pending_orders_stmt = select(SalesOrderItem.product_id).join(SalesOrder).where(
            SalesOrder.status.in_(['PENDING', 'CONFIRMED']),
            SalesOrder.id.not_in(plan_order_ids) if plan_order_ids else True
        ).distinct()
        pending_order_products = (await db.execute(pending_orders_stmt)).scalars().all()
        print(f"Unique products in Pending Orders: {len(pending_order_products)}")

        # 4. Products in Production (In-Progress)
        active_plans_stmt = select(ProductionPlanItem.product_id).where(
            ProductionPlanItem.status.not_in([
                ProductionStatus.COMPLETED,
                ProductionStatus.CANCELED,
                "CANCELLED"
            ])
        ).distinct()
        active_plan_products = (await db.execute(active_plans_stmt)).scalars().all()
        print(f"Unique products in Active Plans: {len(active_plan_products)}")

        # 5. Union of 3 and 4
        all_active_products = set(pending_order_products) | set(active_plan_products)
        print(f"Total Unique Active Products: {len(all_active_products)}")
        
        # 6. Check item_type for these active products
        if all_active_products:
            res = await db.execute(select(Product.id, Product.name, Product.item_type).where(Product.id.in_(all_active_products)))
            active_info = res.all()
            print("\nActive Products Details:")
            for p in active_info:
                print(f"  ID: {p.id}, Name: {p.name}, Type: {p.item_type}")

        # 7. Run the actual filter logic from read_stocks
        stocks_count_stmt = select(func.count(Product.id)).where(or_(Product.item_type != 'CONSUMABLE', Product.item_type.is_(None)))
        stocks_count = (await db.execute(stocks_count_stmt)).scalar()
        print(f"\nread_stocks() would return {stocks_count} items with current filter.")

if __name__ == "__main__":
    asyncio.run(debug_inventory_count())
