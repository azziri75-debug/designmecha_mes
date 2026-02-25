import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def check_db_state():
    async with engine.connect() as conn:
        # Check alembic_version
        try:
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            version = result.scalar()
            print(f"Current Alembic Version: {version}")
        except Exception as e:
            print(f"Error checking alembic_version: {e}")

        # Check columns of production_plan_items
        try:
            # information_schema works in Postgres
            result = await conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'production_plan_items'
            """))
            columns = [row[0] for row in result.fetchall()]
            print(f"Columns in production_plan_items: {columns}")
        except Exception as e:
            print(f"Error checking columns: {e}")

if __name__ == "__main__":
    asyncio.run(check_db_state())
