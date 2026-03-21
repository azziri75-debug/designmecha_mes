
import asyncio
from sqlalchemy import select, func, or_
from app.db_manager import SessionLocal
from app.api.deps import AsyncSessionLocal
from app.models.product import Product
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.inventory import Stock, StockProduction, StockProductionStatus

async def deep_debug():
    async with AsyncSessionLocal() as db:
        finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
        finished_plan_statuses = ['COMPLETED', 'CANCELED', "CANCELLED"]
        finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]

        # 1. Get all active Products from Production Management (Orders & Plans)
        so_products_stmt = select(SalesOrderItem.product_id, SalesOrder.order_no, SalesOrder.status, SalesOrderItem.quantity).join(SalesOrder).where(
            SalesOrder.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED])
        )
        so_products = (await db.execute(so_products_stmt)).all()
        print(f"Active SO Items: {so_products}")
        
        sp_products_stmt = select(StockProduction.product_id, StockProduction.production_no, StockProduction.status, StockProduction.quantity).where(
            StockProduction.status.not_in(finished_sp_statuses)
        )
        sp_products = (await db.execute(sp_products_stmt)).all()
        print(f"Active SP Items: {sp_products}")

        plan_products_stmt = select(ProductionPlanItem.product_id, ProductionPlanItem.sequence, ProductionPlan.id, ProductionPlanItem.status, ProductionPlanItem.quantity).join(ProductionPlan).where(
            ProductionPlanItem.status.not_in(finished_plan_statuses)
        )
        plan_products = (await db.execute(plan_products_stmt)).all()
        print(f"Active Plan Items: {plan_products}")

        active_product_ids = set([p[0] for p in so_products]) | set([p[0] for p in sp_products]) | set([p[0] for p in plan_products])
        print(f"\nUnique Active Product IDs in SO/SP/Plans: {active_product_ids}")

        # 2. Emulate the backend subqueries for these specific product IDs
        for pid in active_product_ids:
            # 1. SO Wait
            so_wait = (await db.execute(select(func.coalesce(func.sum(SalesOrderItem.quantity), 0)).join(SalesOrder).outerjoin(ProductionPlan, ProductionPlan.order_id == SalesOrder.id).where(SalesOrderItem.product_id == pid).where(SalesOrder.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED])).where(ProductionPlan.id.is_(None)))).scalar()
            
            # 2. SO Active
            so_active = (await db.execute(select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0)).join(ProductionPlan).where(ProductionPlanItem.product_id == pid).where(ProductionPlanItem.status.not_in(finished_plan_statuses)).where(ProductionPlanItem.sequence == 1).where(ProductionPlan.order_id.is_not(None)))).scalar()
            
            # 3. SP Wait
            sp_wait = (await db.execute(select(func.coalesce(func.sum(StockProduction.quantity), 0)).outerjoin(ProductionPlan, ProductionPlan.stock_production_id == StockProduction.id).where(StockProduction.product_id == pid).where(StockProduction.status.not_in(finished_sp_statuses)).where(ProductionPlan.id.is_(None)))).scalar()
            
            # 4. SP Active
            sp_active = (await db.execute(select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0)).join(ProductionPlan).where(ProductionPlanItem.product_id == pid).where(ProductionPlanItem.status.not_in(finished_plan_statuses)).where(ProductionPlanItem.sequence == 1).where(ProductionPlan.stock_production_id.is_not(None)))).scalar()
            
            total_wip = so_wait + so_active + sp_wait + sp_active
            print(f"Product ID {pid}: WIP={total_wip} (so_wait={so_wait}, so_active={so_active}, sp_wait={sp_wait}, sp_active={sp_active})")


if __name__ == "__main__":
    asyncio.run(deep_debug())
