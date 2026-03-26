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
        
    try:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        hashed_pw = pwd_context.hash('5446220')
        
        FULL_PERMISSIONS = {
            "dashboard": {"view": True, "edit": True, "price": True},
            "basics": {"view": True, "edit": True, "price": True},
            "products": {"view": True, "edit": True, "price": True},
            "sales": {"view": True, "edit": True, "price": True},
            "production": {"view": True, "edit": True, "price": True},
            "quality": {"view": True, "edit": True, "price": True},
            "materials": {"view": True, "edit": True, "price": True},
            "outsourcing": {"view": True, "edit": True, "price": True},
            "attendance": {"view": True, "edit": True, "price": True},
            "approval": {"view": True, "edit": True, "price": True}
        }
        import json
        perms_json = json.dumps(FULL_PERMISSIONS)

        # Try Raw SQL Insert first
        try:
            await db.execute(text("""
                INSERT INTO staff (login_id, name, password, role, department, main_duty, user_type, phone, is_active, is_sysadmin, can_access_external, can_view_others, menu_permissions)
                VALUES ('admin', '관리자', :pw, 'MANAGER', '시스템관리부', '시스템 총괄', 'ADMIN', '010-0000-0000', true, true, true, true, :perms)
            """), {"pw": hashed_pw, "perms": perms_json})
            await db.commit()
            print("✅ [RAW SQL SUCCESS] Admin created successfully!")
        except Exception as e:
            await db.rollback()
            # If exists, force update password and permissions
            await db.execute(text("""
                UPDATE staff SET 
                    password=:pw, 
                    is_sysadmin=true, 
                    can_access_external=true, 
                    can_view_others=true,
                    menu_permissions=:perms,
                    is_active=true
                WHERE login_id='admin'
            """), {"pw": hashed_pw, "perms": perms_json})
            await db.commit()
            print(f"⚠️ [RAW SQL UPDATE] Admin updated/forced: {e}")
    except Exception as e:
        await db.rollback()
        print(f"❌ [CRITICAL RAW SQL FAILURE] Failed to init admin: {e}")
        import traceback
        print(traceback.format_exc())

if __name__ == "__main__":
    asyncio.run(init_models())
