import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

async def test():
    db_url = "sqlite+aiosqlite:///./backend/mes_erp_v2.db"
    print(f"Testing with URL: {db_url}")
    engine = create_async_engine(db_url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            print("Successfully connected and executed SELECT 1")
            
            # Test the actual migration query
            await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_sysadmin BOOLEAN DEFAULT FALSE;"))
            print("Successfully executed ALTER TABLE")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
