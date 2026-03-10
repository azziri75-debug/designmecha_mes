import asyncio
import sys
import os

# Add backend directory to sys.path to import app
# This script is expected to be in backend/scripts/
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

from sqlalchemy import delete, select
from app.api.deps import AsyncSessionLocal
from app.models.inventory import Stock
from app.models.product import Product

async def cleanup_consumable_stocks():
    async with AsyncSessionLocal() as db:
        print("[CLEANUP] Starting consumable stock cleanup...")
        
        # Subquery to identify CONSUMABLE product IDs
        consumable_ids_stmt = select(Product.id).where(Product.item_type == 'CONSUMABLE')
        
        # Delete stocks for those product IDs
        stmt = delete(Stock).where(
            Stock.product_id.in_(consumable_ids_stmt)
        )
        
        result = await db.execute(stmt)
        await db.commit()
        
        deleted_count = result.rowcount
        print(f"[CLEANUP] Successfully deleted {deleted_count} skewed consumable stock records.")

if __name__ == "__main__":
    # Handle the event loop properly for Windows if needed, 
    # but for a simple script asyncio.run is usually fine.
    try:
        asyncio.run(cleanup_consumable_stocks())
    except Exception as e:
        print(f"[CLEANUP] Error during cleanup: {e}")
        sys.exit(1)
