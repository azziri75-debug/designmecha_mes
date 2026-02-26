import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def add_column():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE production_plans ADD COLUMN stock_production_id INTEGER REFERENCES stock_productions(id) ON DELETE CASCADE"))
            print("Successfully added stock_production_id column.")
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                print("Column stock_production_id already exists.")
            else:
                print(f"Error adding column: {e}")

if __name__ == "__main__":
    asyncio.run(add_column())
