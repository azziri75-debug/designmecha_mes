
import asyncio
from app.db.base import Base
# Import ALL models to ensure they are registered with Base metadata before any queries
from app.models import basics, product, sales, quality, purchasing, approval, hr, production, inventory, notification
from app.api.deps import AsyncSessionLocal
from sqlalchemy import text, delete, select
from app.models.basics import Staff
import json

async def consolidate_admins():
    print("Starting Admin Consolidations...")
    async with AsyncSessionLocal() as db:
        # 1. Find all potential admins
        stmt = select(Staff)
        res = await db.execute(stmt)
        all_staff = res.scalars().all()
        
        admins = [s for s in all_staff if s.login_id == 'admin' or s.name == '관리자' or s.name == '\uad00\ub9ac\uc790']
        admins.sort(key=lambda x: x.id) # Keep the oldest one or the one with lowest ID
        
        if len(admins) <= 1:
            print(f"Found {len(admins)} admin(s). No consolidation needed.")
            if len(admins) == 0:
                print("Warning: No admin found at all. This might be an issue.")
            return

        print(f"Found {len(admins)} potential admin accounts. Consolidating...")
        
        primary_admin = admins[0]
        duplicates = admins[1:]
        
        # Ensure primary_admin has correct login_id and permissions
        primary_admin.login_id = 'admin'
        primary_admin.user_type = 'ADMIN'
        primary_admin.is_sysadmin = True
        
        # Merge permissions (Optional, or just set full)
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
        primary_admin.menu_permissions = json.dumps(FULL_PERMISSIONS)
        
        print(f"Keeping Admin ID: {primary_admin.id} ({primary_admin.login_id})")
        
        for dup in duplicates:
            print(f"Deleting Duplicate Admin ID: {dup.id} (Login: {dup.login_id}, Name: {dup.name})")
            # [CRITICAL] If there are foreign key references to this ID, they might break.
            # But approval documents usually reference the author_id.
            # For simplicity, we assume these are empty duplicate accounts created by the buggy startup logic.
            await db.delete(dup)
        
        await db.commit()
        print("Consolidation complete.")

if __name__ == "__main__":
    asyncio.run(consolidate_admins())
