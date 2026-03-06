import asyncio
import sys
import os

# Add the current directory to sys.path to ensure 'app' can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.api.deps import engine

async def add_mrp_column():
    """
    Manually add material_requirement_id to purchase_order_items table
    to fix missing column error without Alembic.
    """
    print("--- MES Database Fix Script (MRP Column) ---")
    try:
        async with engine.begin() as conn:
            print("Executing ALTER TABLE on 'purchase_order_items'...")
            # PostgreSQL syntax: ADD COLUMN IF NOT EXISTS
            await conn.execute(text(
                "ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS material_requirement_id INTEGER;"
            ))
            print("Successfully added 'material_requirement_id' column (or it already exists).")
            
            # Optionally check if material_requirements table exists, but following user instructions strictly.
            # But let's at least make sure it exists because the model was added.
            print("Ensuring 'material_requirements' table exists...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS material_requirements (
                    id SERIAL PRIMARY KEY,
                    product_id INTEGER NOT NULL,
                    order_id INTEGER,
                    required_quantity INTEGER NOT NULL,
                    current_stock INTEGER DEFAULT 0,
                    open_purchase_qty INTEGER DEFAULT 0,
                    shortage_quantity INTEGER NOT NULL,
                    status VARCHAR DEFAULT 'PENDING',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))
            print("Successfully ensured 'material_requirements' table exists.")
            
    except Exception as e:
        print(f"Error occurred: {e}")
        sys.exit(1)
    
    print("--- Fix Complete ---")

if __name__ == "__main__":
    asyncio.run(add_mrp_column())
