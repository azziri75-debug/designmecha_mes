import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.product import Product, ProductProcess
from app.schemas.sales import SalesOrder as SalesOrderSchema

async def main():
    async with AsyncSessionLocal() as db:
        print("--- Checking Sales Order Schema (Frontend Requirement) ---")
        try:
            # Simulate GET /orders query
            query = select(SalesOrder).options(
                selectinload(SalesOrder.items).selectinload(SalesOrderItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                selectinload(SalesOrder.partner)
            ).limit(1)
            
            result = await db.execute(query)
            order = result.scalar_one_or_none()
            
            if not order:
                print("No orders found. Please ensure test data exists.")
                return

            print(f"Retrieved Order ID: {order.id}")
            
            # Pydantic Validation
            print("--- Validating against SalesOrder Schema (Heavy) ---")
            pydantic_order = SalesOrderSchema.model_validate(order)
            
            # Check for Standard Processes
            if pydantic_order.items and pydantic_order.items[0].product:
                product = pydantic_order.items[0].product
                print(f"Product: {product.name}")
                if hasattr(product, 'standard_processes'):
                    print(f"Standard Processes Count: {len(product.standard_processes)}")
                    if len(product.standard_processes) > 0:
                        print("SUCCESS: Standard Processes present.")
                    else:
                        print("WARNING: Standard Processes list is empty (might be data issue).")
                else:
                    print("FAILURE: 'standard_processes' field missing from Product schema.")
            else:
                print("Order has no items or product.")

        except Exception as e:
            print(f"--- FAILED: {e} ---")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
