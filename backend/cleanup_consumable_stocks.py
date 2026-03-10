import asyncio
from sqlalchemy import select, delete
from app.db.session import AsyncSessionLocal
from app.models.product import Product
from app.models.inventory import Stock

async def cleanup_consumable_stocks():
    async with AsyncSessionLocal() as db:
        try:
            # 1. Find all products that are CONSUMABLES
            query = select(Product).where(Product.item_type == 'CONSUMABLE')
            result = await db.execute(query)
            consumables = result.scalars().all()
            consumable_ids = [c.id for c in consumables]
            
            if not consumable_ids:
                print("No consumable products found. Nothing to clean up.")
                return

            print(f"Found {len(consumable_ids)} consumable products. IDs: {consumable_ids}")

            # 2. Delete from stocks table (inventory.py)
            stmt1 = delete(Stock).where(Stock.product_id.in_(consumable_ids))
            res1 = await db.execute(stmt1)
            print(f"Deleted {res1.rowcount} records from 'stocks' table.")

            # 3. Delete from inventory table (product.py - if it exists separately)
            # The model Inventory in product.py maps to table 'inventory'
            from app.models.product import Inventory
            stmt2 = delete(Inventory).where(Inventory.product_id.in_(consumable_ids))
            res2 = await db.execute(stmt2)
            print(f"Deleted {res2.rowcount} records from 'inventory' table.")

            await db.commit()
            print("Successfully cleaned up consumable stock data.")
            
        except Exception as e:
            await db.rollback()
            print(f"Error during cleanup: {e}")

if __name__ == "__main__":
    asyncio.run(cleanup_consumable_stocks())
