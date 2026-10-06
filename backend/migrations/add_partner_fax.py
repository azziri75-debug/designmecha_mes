"""
Migration: partners 테이블에 fax 컬럼 추가
실행: python backend/migrations/add_partner_fax.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:password@localhost:5433/mes_erp"
)

async def migrate():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE partners
            ADD COLUMN IF NOT EXISTS fax VARCHAR;
        """))
        print("✅ partners.fax 컬럼 추가 완료")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
