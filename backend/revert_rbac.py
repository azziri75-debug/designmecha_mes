
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def revert_rbac():
    DATABASE_URL = "postgresql+asyncpg://postgres:password@192.168.0.23:5433/mes_erp"
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        print("Reverting RBAC - resetting is_sysadmin for all ADMIN users...")
        
        # Reset ALL users to is_sysadmin=False first
        result = await conn.execute(text("UPDATE staff SET is_sysadmin = False"))
        await conn.commit()
        print(f"Reset all users: {result.rowcount} rows affected")
        
        # Verify final state
        result = await conn.execute(text(
            "SELECT id, name, login_id, user_type, is_sysadmin FROM staff ORDER BY id"
        ))
        rows = result.fetchall()
        print("\nFinal staff state:")
        for r in rows:
            print(f"  ID={r[0]} {r[1]} ({r[2]}) type={r[3]} sysadmin={r[4]}")
        
        print("\nDone! Now set is_sysadmin=True for specific users via the staff edit modal.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(revert_rbac())
