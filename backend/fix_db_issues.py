import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def main():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        print(f"Database dialect: {dialect}")
        
        # 1. Add purchase_type column to purchase_orders table
        try:
            if dialect == 'sqlite':
                res = await conn.execute(text("PRAGMA table_info(purchase_orders)"))
                columns = [row[1] for row in res.fetchall()]
                if 'purchase_type' not in columns:
                    await conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN purchase_type VARCHAR;"))
                    print("Added 'purchase_type' column to 'purchase_orders'.")
                else:
                    print("'purchase_type' column already exists in 'purchase_orders'.")
            elif dialect == 'postgresql':
                await conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_type VARCHAR;"))
                print("Added 'purchase_type' column to 'purchase_orders'.")
                
            # Update existing data
            res = await conn.execute(text("UPDATE purchase_orders SET purchase_type = 'PART';"))
            print(f"Updated purchase_type to 'PART' for existing {res.rowcount} rows.")
        except Exception as e:
            print(f"Failed to update purchase_orders: {e}")
            
        # 2. Update products item_type
        try:
            query = text("""
                UPDATE products 
                SET item_type = 'PRODUCED' 
                WHERE item_type IS NULL OR item_type NOT IN ('PART', 'CONSUMABLE');
            """)
            res = await conn.execute(query)
            print(f"Updated item_type to 'PRODUCED' for {res.rowcount} products.")
        except Exception as e:
            print(f"Failed to update products: {e}")

if __name__ == "__main__":
    asyncio.run(main())
