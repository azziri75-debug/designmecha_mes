import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    # Try to get from env first (how uvicorn probably sees it)
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        # Fallback to default PG settings from config.py
        db_url = "postgresql+asyncpg://postgres:password@localhost:5432/mes_erp"
    
    print(f"Connecting to: {db_url}")
    engine = create_async_engine(db_url)
    
    async with engine.begin() as conn:
        print("Checking/Adding unit_price column to work_log_items...")
        try:
            # PostgreSQL syntax
            await conn.execute(text("ALTER TABLE work_log_items ADD COLUMN IF NOT EXISTS unit_price FLOAT DEFAULT 0.0;"))
            print("Successfully ensured unit_price column exists.")
        except Exception as e:
            print(f"Error: {e}")
            
        print("Checking/Adding attachment_file column to work_logs...")
        try:
            await conn.execute(text("ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS attachment_file JSONB;"))
            print("Successfully ensured attachment_file column exists in work_logs.")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
