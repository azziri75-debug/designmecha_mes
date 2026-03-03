import asyncio
import sys
import os
from sqlalchemy import text

# Add the parent directory to sys.path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal

async def patch_db():
    print("Manual DB Patch: Adding work_start_time and work_end_time to companies table...")
    async with AsyncSessionLocal() as db:
        try:
            # Simple try-except for column addition (SQLite/Postgres fallback)
            try:
                await db.execute(text("ALTER TABLE companies ADD COLUMN work_start_time TIME"))
                print("Added work_start_time column.")
            except Exception as e:
                print(f"Note: work_start_time column addition skipped (might already exist): {e}")

            try:
                await db.execute(text("ALTER TABLE companies ADD COLUMN work_end_time TIME"))
                print("Added work_end_time column.")
            except Exception as e:
                print(f"Note: work_end_time column addition skipped (might already exist): {e}")
            
            # Set default values for existing rows if they are null
            await db.execute(text("UPDATE companies SET work_start_time = '08:30:00' WHERE work_start_time IS NULL"))
            await db.execute(text("UPDATE companies SET work_end_time = '17:30:00' WHERE work_end_time IS NULL"))
            
            await db.commit()
            print("Successfully patched companies table with TIME columns.")
        except Exception as e:
            await db.rollback()
            print(f"Error during DB patch: {e}")

if __name__ == "__main__":
    asyncio.run(patch_db())
