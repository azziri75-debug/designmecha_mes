import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def add_column():
    async with engine.begin() as conn:
        try:
            # PostgreSQL syntax
            sql = "ALTER TABLE work_logs ADD COLUMN attachment_file JSON"
            await conn.execute(text(sql))
            print("Successfully added attachment_file column to work_logs")
        except Exception as e:
            print("Failed to add column:")
            print(e)
            
if __name__ == "__main__":
    asyncio.run(add_column())
