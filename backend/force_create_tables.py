import asyncio
from app.db.base import Base
from app.api.deps import engine
# Models get imported properly since __init__.py now contains them
import app.models

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("All missing tables created successfully.")

if __name__ == "__main__":
    asyncio.run(create_tables())
