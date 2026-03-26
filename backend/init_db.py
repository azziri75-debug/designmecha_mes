import asyncio
from app.db.base import Base
from app.api.deps import engine
# Import all models to ensure they are registered with Base
from app.models import basics, product, sales, quality, purchasing

async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully.")

    # Initialize Admin User
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
            print("Admin account created (ID: admin)")
        else:
            admin.password = hashed_password
            admin.is_sysadmin = True
            admin.can_access_external = True
            admin.can_view_others = True
            admin.menu_permissions = FULL_PERMISSIONS
            db.add(admin)
            print("Admin account updated (ID: admin)")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(init_models())
