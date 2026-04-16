import asyncio
from app.db.base import Base
from app.api.deps import engine
from sqlalchemy.future import select
from app.models.basics import Staff
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

async def check():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as db:
        res = await db.execute(select(Staff).where(Staff.login_id == 'admin'))
        staff = res.scalars().all()
        print(f"Found {len(staff)} admin accounts:")
        for s in staff:
            print(f"  ID={s.id} Name={s.name} Active={s.is_active} LoginID={s.login_id}")
            
        # Also check for name '이준호'
        res2 = await db.execute(select(Staff).where(Staff.name == '이준호'))
        lee = res2.scalars().all()
        print(f"\nFound {len(lee)} '이준호' accounts:")
        for s in lee:
            print(f"  ID={s.id} Name={s.name} Active={s.is_active} LoginID={s.login_id}")

        # Check for ANY duplicates
        from sqlalchemy import func
        res3 = await db.execute(
            select(Staff.login_id, func.count(Staff.id))
            .where(Staff.login_id != None)
            .group_by(Staff.login_id)
            .having(func.count(Staff.id) > 1)
        )
        dupes = res3.all()
        if dupes:
            print(f"\nFound duplicate login_ids:")
            for login_id, count in dupes:
                print(f"  LoginID={login_id} Count={count}")
        else:
            print("\nNo duplicate login_ids found.")

if __name__ == "__main__":
    asyncio.run(check())
