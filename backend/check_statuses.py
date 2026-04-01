import asyncio
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal
from app.models.sales import SalesOrder

async def check_statuses():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(SalesOrder.status, func.count(SalesOrder.id)).group_by(SalesOrder.status))
        rows = result.all()
        for status, count in rows:
            print(f"Status: {status}, Count: {count}")

if __name__ == "__main__":
    asyncio.run(check_statuses())
