import asyncio
import sys
import os

# Add parent directory to sys.path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from app.models.product import Product
from app.models.purchasing import PurchaseOrder
from sqlalchemy import select, update

async def repair_data():
    async with AsyncSessionLocal() as session:
        print("Starting data repair...")
        
        # 1. Update Product item_type
        # mapping old/various types to new standard
        type_mapping = {
            "FINISHED": "PRODUCED",
            "PRODUCT": "PRODUCED",
            "RAW": "PART",
            "MATERIAL": "PART",
            "SUB": "PART",
            "CONSUMABLE": "CONSUMABLE" # self keep
        }
        
        for old_type, new_type in type_mapping.items():
            result = await session.execute(
                update(Product)
                .where(Product.item_type == old_type)
                .values(item_type=new_type)
            )
            print(f"Updated product types: {old_type} -> {new_type} ({result.rowcount} rows)")
        
        # Ensure item_type is not null (fallback to PRODUCED for safety)
        result = await session.execute(
            update(Product)
            .where(Product.item_type == None)
            .values(item_type="PRODUCED")
        )
        print(f"Set default item_type to PRODUCED for {result.rowcount} NULL rows")

        # 2. Update PurchaseOrder purchase_type
        result = await session.execute(
            update(PurchaseOrder)
            .where(PurchaseOrder.purchase_type == None)
            .values(purchase_type="PART")
        )
        print(f"Corrected NULL purchase_type for {result.rowcount} rows")

        await session.commit()
        print("Data repair completed successfully.")

if __name__ == "__main__":
    asyncio.run(repair_data())
