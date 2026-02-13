
import asyncio
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'app'))
sys.path.append(os.getcwd())

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.production import ProductionPlanItem
from app.models.product import Process

async def debug_pending_items():
    print(f"Connecting to DB: {settings.SQLALCHEMY_DATABASE_URI}")
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("--- Checking for Korean Values in DB ---")
        
        # 1. Check Processes table
        print("Checking 'processes' table for '구매' or '외주'...")
        stmt = select(Process).where(Process.course_type.in_(['구매', '외주']))
        result = await db.execute(stmt)
        processes = result.scalars().all()
        if processes:
            print(f"!! FOUND {len(processes)} Processes with Korean course_type:")
            for p in processes:
                print(f"  ID={p.id}, Name={p.name}, Type={p.course_type}")
        else:
            print("  No Korean values found in 'processes' table.")

        # 2. Check Plan Items table
        print("\nChecking 'production_plan_items' table for '구매' or '외주'...")
        stmt = select(ProductionPlanItem).where(ProductionPlanItem.course_type.in_(['구매', '외주']))
        result = await db.execute(stmt)
        items = result.scalars().all()
        if items:
            print(f"!! FOUND {len(items)} Plan Items with Korean course_type:")
            for item in items:
                print(f"  ID={item.id}, PlanID={item.plan_id}, Process={item.process_name}, Type={item.course_type}")
        else:
            print("  No Korean values found in 'production_plan_items' table.")

        # 3. Check Plan 2 Items
        print("\n--- Inspecting Plan 2 Items ---")
        stmt = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == 2)
        result = await db.execute(stmt)
        items = result.scalars().all()
        if not items:
            print("Plan 2 has no items.")
        else:
            for item in items:
                print(f"  Item ID={item.id}, Process={item.process_name}, CourseType='{item.course_type}'")

    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(debug_pending_items())
