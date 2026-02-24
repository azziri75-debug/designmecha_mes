"""
Robust script to initialize or update auth data.
Works on local SQLite and production Postgres.
Run: python init_auth.py
"""
import asyncio
import json
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

# Use settings to get the DB URL
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.config import settings

ALL_MENUS = ["basics", "products", "sales", "production", "purchase", "outsourcing", "quality", "inventory"]

async def main():
    db_url = settings.SQLALCHEMY_DATABASE_URI
    print(f"Connecting to DB: {db_url}")
    
    engine = create_async_engine(db_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        from app.models.basics import Staff
        
        # 1. Ensure 이준호 exists as ADMIN
        result = await db.execute(select(Staff).where(Staff.name == "이준호"))
        admin = result.scalar_one_or_none()
        
        if not admin:
            print("Admin '이준호' not found. Creating...")
            admin = Staff(
                name="이준호",
                role="대표",
                main_duty="총괄관리",
                user_type="ADMIN",
                password="6220",
                menu_permissions=ALL_MENUS,
                is_active=True
            )
            db.add(admin)
        else:
            print("Admin '이준호' found. Updating...")
            admin.user_type = "ADMIN"
            admin.password = "6220"
            admin.menu_permissions = ALL_MENUS
            admin.is_active = True
            db.add(admin)
            
        # 2. Update other staff to have default password if missing
        result = await db.execute(select(Staff).where(Staff.name != "이준호"))
        others = result.scalars().all()
        for s in others:
            if not s.password:
                s.password = "6220"
            if not s.user_type:
                s.user_type = "USER"
            if not s.menu_permissions:
                s.menu_permissions = ALL_MENUS
            db.add(s)
            
        await db.commit()
    print("Optimization/Initialization of auth data complete.")

if __name__ == "__main__":
    asyncio.run(main())
