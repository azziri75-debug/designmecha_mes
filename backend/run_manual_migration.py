import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def migrate():
    async with engine.begin() as conn:
        # Check existing columns
        result = await conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'production_plan_items'
        """))
        existing_columns = [row[0] for row in result.fetchall()]
        print(f"Existing columns: {existing_columns}")

        # Add start_date if missing
        if 'start_date' not in existing_columns:
            print("Adding start_date column...")
            await conn.execute(text("ALTER TABLE production_plan_items ADD COLUMN start_date DATE"))
        
        # Add end_date if missing
        if 'end_date' not in existing_columns:
            print("Adding end_date column...")
            await conn.execute(text("ALTER TABLE production_plan_items ADD COLUMN end_date DATE"))

        # Add cost if missing
        if 'cost' not in existing_columns:
            print("Adding cost column...")
            await conn.execute(text("ALTER TABLE production_plan_items ADD COLUMN cost FLOAT DEFAULT 0.0"))

        print("Migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(migrate())
