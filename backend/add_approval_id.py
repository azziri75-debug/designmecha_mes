import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())
from app.core.config import settings

async def migrate():
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
    async with engine.begin() as conn:
        # Check if column exists (SQLite)
        result = await conn.execute(text("PRAGMA table_info(employee_time_records)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "approval_id" not in columns:
            print("Adding approval_id column to employee_time_records...")
            await conn.execute(text("ALTER TABLE employee_time_records ADD COLUMN approval_id INTEGER"))
            await conn.execute(text("CREATE INDEX ix_employee_time_records_approval_id ON employee_time_records (approval_id)"))
            print("Migration successful.")
        else:
            print("approval_id column already exists.")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
