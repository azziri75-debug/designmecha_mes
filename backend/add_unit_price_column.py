import asyncio
from app.api.deps import engine, AsyncSessionLocal as async_session
from sqlalchemy import text

async def main():
    async with engine.begin() as conn:
        print("Adding unit_price column to work_log_items...")
        try:
            await conn.execute(text("ALTER TABLE work_log_items ADD COLUMN unit_price FLOAT DEFAULT 0.0;"))
            print("Successfully added unit_price column.")
        except Exception as e:
            print(f"Error or already exists: {e}")

if __name__ == "__main__":
    asyncio.run(main())
