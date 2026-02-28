import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:password@localhost:5432/mes_erp"

async def check_db():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        try:
            # Check if work_logs table exists
            sql = "SELECT column_name FROM information_schema.columns WHERE table_name = 'work_logs';"
            result = await conn.execute(text(sql))
            columns = [row[0] for row in result.fetchall()]
            print("Columns in work_logs:", columns)
            
            if 'attachment_file' not in columns:
                print("Adding attachment_file column...")
                await conn.execute(text("ALTER TABLE work_logs ADD COLUMN attachment_file JSON"))
                print("Successfully added!")
            else:
                print("Column already exists!")
                
        except Exception as e:
            print("Failed to connect or query:")
            print(e)
            
if __name__ == "__main__":
    asyncio.run(check_db())
