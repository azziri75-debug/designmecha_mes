import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def migrate():
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(quality_defects)"))
        columns = [row[1] for row in result.fetchall()]
        print(f"Existing columns in quality_defects: {columns}")
        
        if 'attachment_file' not in columns:
            print("Adding attachment_file column...")
            await conn.execute(text("ALTER TABLE quality_defects ADD COLUMN attachment_file TEXT"))
            print("Column added successfully.")
        else:
            print("attachment_file column already exists.")

if __name__ == "__main__":
    asyncio.run(migrate())
