
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def repair_rbac():
    # Use the known remote DB credentials
    DATABASE_URL = "postgresql+asyncpg://postgres:password@192.168.0.23:5433/mes_erp"
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        print("Starting RBAC repair...")
        
        # 1. Update users with user_type='ADMIN' or role containing '대표' to be is_sysadmin=True
        sql = """
        UPDATE staff 
        SET is_sysadmin = True 
        WHERE user_type = 'ADMIN' 
           OR role LIKE '%대표%'
           OR login_id = 'admin';
        """
        result = await conn.execute(text(sql))
        await conn.commit()
        print(f"Update complete. Rows affected: {result.rowcount}")
        
        # 2. Verify results
        result = await conn.execute(text("SELECT id, name, login_id, user_type, is_sysadmin FROM staff WHERE is_sysadmin = True"))
        rows = result.fetchall()
        print("\nVerified System Administrators:")
        for r in rows:
            print(f"- {r[1]} ({r[2]}): {r[3]} (Admin: {r[4]})")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(repair_rbac())
