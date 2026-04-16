import asyncio
from app.db.base import AsyncSessionLocal
from app.models.notification import PushSubscription
from sqlalchemy import select

async def check_subs():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(PushSubscription))
        subs = result.scalars().all()
        print(f"Total subscriptions: {len(subs)}")
        for s in subs:
            print(f"Staff ID: {s.staff_id}, Endpoint: {s.endpoint[:50]}...")

if __name__ == "__main__":
    asyncio.run(check_subs())
