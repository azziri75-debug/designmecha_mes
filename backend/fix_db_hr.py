import sys
import os
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings

async def fix_db():
    print("Connecting to database...")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI, echo=True)
    
    async with engine.begin() as conn:
        print("Checking/Updating 'companies' table...")
        # Check if columns exist
        result = await conn.execute(text("PRAGMA table_info(companies)"))
        columns = [row[1] for row in result.fetchall()]
        
        if "work_start_time" not in columns:
            print("Adding 'work_start_time' to 'companies'...")
            await conn.execute(text("ALTER TABLE companies ADD COLUMN work_start_time VARCHAR DEFAULT '08:30'"))
        
        if "work_end_time" not in columns:
            print("Adding 'work_end_time' to 'companies'...")
            await conn.execute(text("ALTER TABLE companies ADD COLUMN work_end_time VARCHAR DEFAULT '17:30'"))
            
        print("Checking/Creating 'employee_time_records' table...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS employee_time_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                staff_id INTEGER NOT NULL,
                record_date DATE NOT NULL,
                category VARCHAR NOT NULL,
                content TEXT,
                status VARCHAR DEFAULT 'APPROVED',
                author_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(staff_id) REFERENCES staff(id) ON DELETE CASCADE,
                FOREIGN KEY(author_id) REFERENCES staff(id) ON DELETE SET NULL
            )
        """))
        
        # Add index if needed
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_employee_time_records_record_date ON employee_time_records (record_date)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_employee_time_records_category ON employee_time_records (category)"))
        
        print("Database schema update completed successfully.")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(fix_db())
