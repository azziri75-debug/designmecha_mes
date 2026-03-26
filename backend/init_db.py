import asyncio
from app.db.base import Base
from app.api.deps import engine
# Import all models to ensure they are registered with Base
from app.models import basics, product, sales, quality, purchasing

async def init_models():
    from sqlalchemy import text
    async with engine.begin() as conn:
        # 1. Raw SQL Migration (PostgreSQL)
        await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_sysadmin BOOLEAN DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS can_access_external BOOLEAN DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS can_view_others BOOLEAN DEFAULT FALSE;"))
        
        # 2. Base Metadata Creation (Ensure other tables exist)
        await conn.run_sync(Base.metadata.create_all)
    print("DB Schema updated and tables checked successfully.")

    # 3. Initialize Admin User
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.future import select
    from app.models.basics import Staff
    from passlib.context import CryptContext
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    
    MENU_KEYS = ["basics", "products", "sales", "production", "purchasing", "outsourcing", "worklogs", "delivery", "inventory", "quality", "approval", "hr", "ADMIN"]
    FULL_PERMISSIONS = {k: {"view": True, "edit": True, "price": True} for k in MENU_KEYS}
    
    async with async_session() as db:
        result = await db.execute(select(Staff).where(Staff.login_id == "admin"))
        admin = result.scalar_one_or_none()
        
        hashed_password = pwd_context.hash("5446220")
        if not admin:
            admin = Staff(
                name="관리자",
                login_id="admin",
                role="시스템 관리자",
                main_duty="시스템 총괄",
                user_type="ADMIN",
                password=hashed_password,
                menu_permissions=FULL_PERMISSIONS,
                is_sysadmin=True,
                can_access_external=True,
                can_view_others=True,
                is_active=True
            )
            db.add(admin)
            print("Admin account created (ID: admin, Name: 관리자)")
        else:
            # Always force reset password and permissions (UPSERT)
            admin.name = "관리자"
            admin.login_id = "admin"
            admin.password = hashed_password
            admin.user_type = "ADMIN"
            admin.is_sysadmin = True
            admin.can_access_external = True
            admin.can_view_others = True
            admin.menu_permissions = FULL_PERMISSIONS
            admin.is_active = True
            db.add(admin)
            print("Admin account force-reset (ID: admin, Name: 관리자)")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(init_models())
