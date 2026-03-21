
import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def test_db():
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT 1"))
        print(f"DB Connectivity: {res.scalar()}")

if __name__ == "__main__":
    asyncio.run(test_db())
