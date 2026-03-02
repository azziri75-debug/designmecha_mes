import asyncio
import os
import sys
import logging
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

# Handle app import
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import engine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def fix_db():
    logger.info("Initializing database sync script...")
    url = str(engine.url)
    is_sqlite = "sqlite" in url.lower()
    logger.info(f"Target Database Type: {'SQLite' if is_sqlite else 'PostgreSQL'}")
    
    # Columns to add: (table_name, column_name, postgres_type, sqlite_type)
    columns_to_add = [
        # Purchasing
        ("purchase_orders", "order_id", "INTEGER REFERENCES sales_orders(id)", "INTEGER"),
        ("outsourcing_orders", "order_id", "INTEGER REFERENCES sales_orders(id)", "INTEGER"),
        
        # Production Plan Header
        ("production_plans", "order_id", "INTEGER REFERENCES sales_orders(id)", "INTEGER"),
        ("production_plans", "stock_production_id", "INTEGER REFERENCES stock_productions(id) ON DELETE CASCADE", "INTEGER"),
        ("production_plans", "plan_date", "DATE", "DATE"),
        ("production_plans", "status", "VARCHAR", "VARCHAR"),
        ("production_plans", "attachment_file", "JSONB", "JSON"),
        ("production_plans", "sheet_metadata", "JSONB", "JSON"),
        ("production_plans", "created_at", "TIMESTAMP WITH TIME ZONE DEFAULT now()", "TIMESTAMP"),
        ("production_plans", "updated_at", "TIMESTAMP WITH TIME ZONE", "TIMESTAMP"),
        
        # Production Plan Detail
        ("production_plan_items", "worker_id", "INTEGER REFERENCES staff(id)", "INTEGER"),
        ("production_plan_items", "equipment_id", "INTEGER REFERENCES equipments(id)", "INTEGER"),
        ("production_plan_items", "status", "VARCHAR", "VARCHAR"),
        ("production_plan_items", "cost", "DOUBLE PRECISION DEFAULT 0.0", "FLOAT DEFAULT 0.0"),
        ("production_plan_items", "attachment_file", "JSONB", "JSON"),
        ("production_plan_items", "note", "TEXT", "TEXT"),

        # Product Routing Template
        ("product_processes", "partner_name", "VARCHAR", "VARCHAR"),
        ("product_processes", "equipment_name", "VARCHAR", "VARCHAR"),
        ("product_processes", "attachment_file", "VARCHAR", "VARCHAR"),
        ("product_processes", "course_type", "VARCHAR", "VARCHAR"),
        ("product_processes", "cost", "DOUBLE PRECISION DEFAULT 0.0", "FLOAT DEFAULT 0.0"),

        # Quality Defects
        ("quality_defects", "order_id", "INTEGER REFERENCES sales_orders(id)", "INTEGER"),
        ("quality_defects", "plan_id", "INTEGER REFERENCES production_plans(id) ON DELETE CASCADE", "INTEGER"),
        ("quality_defects", "plan_item_id", "INTEGER REFERENCES production_plan_items(id) ON DELETE CASCADE", "INTEGER"),
        ("quality_defects", "defect_date", "TIMESTAMP WITH TIME ZONE DEFAULT now()", "TIMESTAMP"),
        ("quality_defects", "defect_reason", "VARCHAR", "VARCHAR"),
        ("quality_defects", "quantity", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
        ("quality_defects", "amount", "DOUBLE PRECISION DEFAULT 0.0", "FLOAT DEFAULT 0.0"),
        ("quality_defects", "attachment_file", "TEXT", "TEXT"),
        ("quality_defects", "status", "VARCHAR DEFAULT 'OCCURRED'", "VARCHAR DEFAULT 'OCCURRED'"),
        ("quality_defects", "resolution_date", "TIMESTAMP WITH TIME ZONE", "TIMESTAMP"),
        ("quality_defects", "resolution_note", "TEXT", "TEXT"),
        ("quality_defects", "created_at", "TIMESTAMP WITH TIME ZONE DEFAULT now()", "TIMESTAMP"),
    ]

    async with engine.begin() as conn:
        # Pre-check: Create newer tables if missing
        if is_sqlite:
            logger.info("Ensuring tables exist for SQLite...")
            await conn.execute(text("CREATE TABLE IF NOT EXISTS production_plans (id INTEGER PRIMARY KEY AUTOINCREMENT);"))
            await conn.execute(text("CREATE TABLE IF NOT EXISTS production_plan_items (id INTEGER PRIMARY KEY AUTOINCREMENT);"))
            await conn.execute(text("CREATE TABLE IF NOT EXISTS quality_defects (id INTEGER PRIMARY KEY AUTOINCREMENT);"))
        else:
            logger.info("Ensuring tables exist for PostgreSQL...")
            await conn.execute(text("CREATE TABLE IF NOT EXISTS production_plans (id SERIAL PRIMARY KEY);"))
            await conn.execute(text("CREATE TABLE IF NOT EXISTS production_plan_items (id SERIAL PRIMARY KEY);"))
            await conn.execute(text("CREATE TABLE IF NOT EXISTS quality_defects (id SERIAL PRIMARY KEY);"))

        for table, col, pg_type, sq_type in columns_to_add:
            col_type = sq_type if is_sqlite else pg_type
            
            if is_sqlite:
                try:
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type};"))
                    logger.info(f"Added column {col} to {table}")
                except Exception as e:
                    if "duplicate column name" in str(e).lower():
                        pass # Column already exists
                    else:
                        logger.warning(f"Failed to add {col} to {table}: {e}")
            else:
                try:
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type};"))
                    logger.info(f"Synced column {col} in {table}")
                except Exception as e:
                    logger.error(f"Error syncing {col} in {table}: {e}")

    logger.info("Database schema synchronization completed successfully.")

if __name__ == "__main__":
    asyncio.run(fix_db())
