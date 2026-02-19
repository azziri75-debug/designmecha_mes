import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload
from app.models.production import ProductionPlan, ProductionPlanItem
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.product import Product, ProductProcess
from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Attempting GET /plans query ---")
        try:
            result = await db.execute(
                select(ProductionPlan)
                .options(
                    selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
                    selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
                    selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
                    selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                    selectinload(ProductionPlan.order).selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
                )
                .limit(10)
            )
            plans = result.scalars().all()
            print(f"SQL Success! Retrieved {len(plans)} plans.")
            
            from app.schemas.production import ProductionPlanSimple
            print("--- Attempting Pydantic Validation (ProductionPlanSimple) ---")
            for plan in plans:
                try:
                    pydantic_plan = ProductionPlanSimple.model_validate(plan)
                    # print(f"Validated Plan ID: {pydantic_plan.id}")
                except Exception as pe:
                    print(f"Pydantic Validation Failed for Plan ID {plan.id}: {pe}")
                    raise pe
            print("--- Pydantic Validation Success ---")
        except Exception as e:
            print("--- Query Failed ---")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
