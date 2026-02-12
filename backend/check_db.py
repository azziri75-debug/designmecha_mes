from app.db.base import Base
from app.models.basics import Partner
from app.api.deps import engine
import asyncio
from sqlalchemy.future import select

async def check():
    async with engine.begin() as conn:
        print("Connecting...")
        # Try a simple query
        result = await conn.execute(select(Partner).limit(1))
        print("Query executed.")
        print(f"Partners found: {result.scalars().all()}")

if __name__ == "__main__":
    asyncio.run(check())
