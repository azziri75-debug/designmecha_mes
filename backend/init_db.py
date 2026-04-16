import asyncio
from app.db.base import Base
from app.api.deps import engine
# Import ALL models to ensure they are registered with Base metadata
from app.models import basics, product, sales, quality, purchasing, approval, hr, production
from sqlalchemy import text, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext
import json
import traceback

async def init_models():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        # 1. Raw SQL Migration
        if dialect == 'postgresql':
            await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_sysadmin BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS can_access_external BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS can_view_others BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS login_id VARCHAR UNIQUE;"))
        else: # SQLite or others
            # Helper to add columns if they don't exist in SQLite
            res = await conn.execute(text("PRAGMA table_info(staff)"))
            columns = [row[1] for row in res.fetchall()]
            if 'is_sysadmin' not in columns:
                await conn.execute(text("ALTER TABLE staff ADD COLUMN is_sysadmin BOOLEAN DEFAULT FALSE;"))
            if 'can_access_external' not in columns:
                await conn.execute(text("ALTER TABLE staff ADD COLUMN can_access_external BOOLEAN DEFAULT FALSE;"))
            if 'can_view_others' not in columns:
                await conn.execute(text("ALTER TABLE staff ADD COLUMN can_view_others BOOLEAN DEFAULT FALSE;"))
            if 'login_id' not in columns:
                await conn.execute(text("ALTER TABLE staff ADD COLUMN login_id VARCHAR;"))
                await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_login_id ON staff(login_id);"))
        
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
    
    async with async_session() as db:
        try:
            # 3. Initialize Admin User
            result = await db.execute(select(Staff).where(Staff.login_id == "admin"))
            admin = result.scalar_one_or_none()
            
            hashed_pw = pwd_context.hash('5446220')
            
            MENU_KEYS = ["dashboard", "basics", "products", "sales", "production", "quality", "materials", "outsourcing", "attendance", "approval", "hr", "ADMIN"]
            FULL_PERMISSIONS = {k: {"view": True, "edit": True, "price": True} for k in MENU_KEYS}
            import json
            perms_json = json.dumps(FULL_PERMISSIONS)

            if not admin:
                print("Creating new admin user...")
                new_admin = Staff(
                    login_id="admin",
                    name="관리자",
                    password=hashed_pw,
                    role="MANAGER",
                    department="시스템관리부",
                    main_duty="시스템 총괄",
                    user_type="ADMIN",
                    phone="010-0000-0000",
                    is_active=True,
                    is_sysadmin=True,
                    can_access_external=True,
                    can_view_others=True,
                    menu_permissions=FULL_PERMISSIONS
                )
                db.add(new_admin)
                await db.commit()
                print("[SUCCESS] Admin created successfully!")
            else:
                print("Admin user already exists. Updating...")
                admin.password = hashed_pw
                admin.is_sysadmin = True
                admin.can_access_external = True
                admin.can_view_others = True
                admin.menu_permissions = FULL_PERMISSIONS
                admin.is_active = True
                await db.commit()
                print("[SUCCESS] Admin updated successfully!")
                
        except Exception as e:
            await db.rollback()
            print(f"[ERROR] Failed to init admin: {e}")
            import traceback
            print(traceback.format_exc())

if __name__ == "__main__":
    asyncio.run(init_models())
