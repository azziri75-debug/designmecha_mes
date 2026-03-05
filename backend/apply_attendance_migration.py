import sys
import os
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings

async def apply_migration():
    print(f"Connecting to database at {settings.SQLALCHEMY_DATABASE_URI}")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI, echo=True)
    
    async with engine.begin() as conn:
        print("--- Updating 'companies' table ---")
        result = await conn.execute(text("PRAGMA table_info(companies)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "grace_period_start_mins" not in columns:
            print("Adding 'grace_period_start_mins' to 'companies'...")
            await conn.execute(text("ALTER TABLE companies ADD COLUMN grace_period_start_mins INTEGER DEFAULT 0"))
        
        if "grace_period_end_mins" not in columns:
            print("Adding 'grace_period_end_mins' to 'companies'...")
            await conn.execute(text("ALTER TABLE companies ADD COLUMN grace_period_end_mins INTEGER DEFAULT 0"))

        print("\n--- Updating 'staff' table ---")
        result = await conn.execute(text("PRAGMA table_info(staff)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "mac_address" not in columns:
            print("Adding 'mac_address' to 'staff'...")
            await conn.execute(text("ALTER TABLE staff ADD COLUMN mac_address VARCHAR"))
        
        if "ip_address" not in columns:
            print("Adding 'ip_address' to 'staff'...")
            await conn.execute(text("ALTER TABLE staff ADD COLUMN ip_address VARCHAR"))

        print("\n--- Creating 'attendance_logs' table ---")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS attendance_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                staff_id INTEGER NOT NULL,
                log_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                log_type VARCHAR NOT NULL,
                FOREIGN KEY(staff_id) REFERENCES staff(id) ON DELETE CASCADE
            )
        """))

        print("\n--- Updating 'employee_time_records' table ---")
        result = await conn.execute(text("PRAGMA table_info(employee_time_records)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "clock_in_time" not in columns:
            print("Adding 'clock_in_time' to 'employee_time_records'...")
            await conn.execute(text("ALTER TABLE employee_time_records ADD COLUMN clock_in_time DATETIME"))
        
        if "clock_out_time" not in columns:
            print("Adding 'clock_out_time' to 'employee_time_records'...")
            await conn.execute(text("ALTER TABLE employee_time_records ADD COLUMN clock_out_time DATETIME"))
            
        if "record_source" not in columns:
            print("Adding 'record_source' to 'employee_time_records'...")
            await conn.execute(text("ALTER TABLE employee_time_records ADD COLUMN record_source VARCHAR"))
            
        if "attendance_status" not in columns:
            print("Adding 'attendance_status' to 'employee_time_records'...")
            # Using 'NORMAL' as default
            await conn.execute(text("ALTER TABLE employee_time_records ADD COLUMN attendance_status VARCHAR DEFAULT 'NORMAL'"))

        print("\nDatabase schema update completed successfully.")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_migration())
