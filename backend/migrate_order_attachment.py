"""
Migration script to add attachment_file to sales_orders table.
Works on SQLite and Postgres.
"""
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text

# Use settings to get the DB URL
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.config import settings

async def migrate():
    db_url = settings.SQLALCHEMY_DATABASE_URI
    print(f"Migrating DB at: {db_url}")
    
    engine = create_async_engine(db_url)
    
    async with engine.begin() as conn:
        # Check if column exists (SQLite)
        if "sqlite" in db_url:
            table_info = await conn.execute(text("PRAGMA table_info(sales_orders)"))
            columns = [row[1] for row in table_info.fetchall()]
            if "attachment_file" not in columns:
                print("Adding attachment_file to sales_orders (SQLite)...")
                await conn.execute(text("ALTER TABLE sales_orders ADD COLUMN attachment_file JSON"))
            else:
                print("Column attachment_file already exists in sales_orders.")
        else:
            # Postgres check
            check_sql = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='sales_orders' AND column_name='attachment_file';
            """)
            result = await conn.execute(check_sql)
            if not result.fetchone():
                print("Adding attachment_file to sales_orders (Postgres)...")
                await conn.execute(text("ALTER TABLE sales_orders ADD COLUMN attachment_file JSONB"))
            else:
                print("Column attachment_file already exists in sales_orders.")

    print("Migration complete.")

if __name__ == "__main__":
    asyncio.run(migrate())
