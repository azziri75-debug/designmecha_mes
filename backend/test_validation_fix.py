import asyncio
from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from app.models.production import ProductionPlan
from app.schemas.production import ProductionPlan as ProductionPlanSchema
from fastapi.encoders import jsonable_encoder

async def test():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ProductionPlan).limit(1))
        plan = res.scalar_one_or_none()
        if plan:
            try:
                # 1. First fetch manually from DB with all loads
                from sqlalchemy.orm import selectinload
                from app.models.production import ProductionPlanItem
                from app.models.product import Product, ProductProcess
                from app.models.sales import SalesOrder
                from app.models.inventory import StockProduction
                from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem

                res2 = await db.execute(
                    select(ProductionPlan)
                    .options(
                        selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).joinedload(ProductProcess.process),
                        selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.equipment).selectinload('history'),
                        selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.worker),
                        selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
                        selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
                        selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                        selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                        selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
                        selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner)
                    )
                    .where(ProductionPlan.id == plan.id)
                )
                plan_loaded = res2.scalar_one()

                # Validate with Pydantic
                schema = ProductionPlanSchema.model_validate(plan_loaded)
                
                # Encode to JSON to trigger deep validation
                jsonable_encoder(schema)
                
                print("SUCCESS")
            except Exception as e:
                import traceback
                traceback.print_exc()

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(test())
