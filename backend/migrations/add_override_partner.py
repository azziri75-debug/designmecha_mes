"""
Migration: delivery_histories 테이블에 override_partner_id 컬럼 추가
실행: python backend/migrations/add_override_partner.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://mes_user:mes_password@localhost:5433/mes_db"
)

async def migrate():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        # override_partner_id 컬럼 추가 (이미 있으면 무시)
        await conn.execute(text("""
            ALTER TABLE delivery_histories
            ADD COLUMN IF NOT EXISTS override_partner_id INTEGER
            REFERENCES partners(id) ON DELETE SET NULL;
        """))
        print("✅ delivery_histories.override_partner_id 컬럼 추가 완료")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
