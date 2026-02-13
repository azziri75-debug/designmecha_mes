import asyncio
from app.db.base import Base
from app.api.deps import engine
# Import all models to ensure they are registered with Base
from app.models import basics, product, sales, quality, purchasing

async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully.")

if __name__ == "__main__":
    asyncio.run(init_models())
