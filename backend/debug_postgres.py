import asyncio
import os
import sys

# Fake environment for imports
sys.path.append(os.getcwd())

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

POSTGRES_URL = "postgresql+asyncpg://postgres:password@localhost:5432/mes_erp"

async def check_postgres():
    print(f"Checking Postgres: {POSTGRES_URL}")
    try:
        engine = create_async_engine(POSTGRES_URL)
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT count(*) FROM sales_orders"))
            count = result.scalar()
            print(f"Sales Orders in Postgres: {count}")
            
            result = await conn.execute(text("SELECT count(*) FROM production_plans"))
            count = result.scalar()
            print(f"Production Plans in Postgres: {count}")
    except Exception as e:
        print(f"Postgres Connection Failed: {e}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(check_postgres())
