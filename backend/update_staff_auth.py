"""
Script to update existing staff data with default auth fields.
Run this after migration: python update_staff_auth.py
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

DATABASE_URL = "sqlite+aiosqlite:///./mes.db"

ALL_MENUS = ["basics", "products", "sales", "production", "purchase", "outsourcing", "quality", "inventory"]

async def main():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        from app.models.basics import Staff
        result = await db.execute(select(Staff))
        staff_list = result.scalars().all()
        
        for s in staff_list:
            s.password = "6220"
            if s.name == "이준호":
                s.user_type = "ADMIN"
                s.menu_permissions = ALL_MENUS
            else:
                s.user_type = "USER"
                s.menu_permissions = ALL_MENUS  # Default: all menus accessible
            db.add(s)
            print(f"Updated: {s.name} -> {s.user_type}, password=6220")
        
        await db.commit()
        print(f"Done. Updated {len(staff_list)} staff records.")

if __name__ == "__main__":
    asyncio.run(main())
