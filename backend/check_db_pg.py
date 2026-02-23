import asyncio
from app.db.session import async_session_maker
from sqlalchemy.future import select
from app.models.sales import Estimate
from app.models.production import ProductionPlan

async def main():
    async with async_session_maker() as session:
        # Check Estimates
        result = await session.execute(
            select(Estimate.id, Estimate.attachment_file).order_by(Estimate.id.desc()).limit(5)
        )
        print("ESTIMATES:", result.fetchall())

        # Check Production Plans
        result2 = await session.execute(
            select(ProductionPlan.id, ProductionPlan.attachment_file).order_by(ProductionPlan.id.desc()).limit(5)
        )
        print("PRODUCTION PLANS:", result2.fetchall())

if __name__ == "__main__":
    asyncio.run(main())
