
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def check_staff():
    # Use the known remote DB credentials
    DATABASE_URL = "postgresql+asyncpg://postgres:password@192.168.0.23:5433/mes_erp"
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT id, name, login_id, user_type, is_sysadmin, role FROM staff"))
        rows = result.fetchall()
        print(f"{'ID':<5} | {'Name':<10} | {'LoginID':<15} | {'Type':<10} | {'Admin':<7} | {'Role'}")
        print("-" * 70)
        for r in rows:
            print(f"{r[0]:<5} | {r[1]:<10} | {r[2]:<15} | {r[3]:<10} | {str(r[4]):<7} | {r[5]}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_staff())
