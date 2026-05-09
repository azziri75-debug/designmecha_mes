"""
마이그레이션: consumable_purchase_waits 테이블에 규격/제조사/거래처 컬럼 추가
실행: python scripts/migrate_consumable_wait.py
"""
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:password@localhost:5433/mes_erp"
)

async def migrate():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE consumable_purchase_waits
            ADD COLUMN IF NOT EXISTS requested_spec VARCHAR,
            ADD COLUMN IF NOT EXISTS requested_manufacturer VARCHAR,
            ADD COLUMN IF NOT EXISTS requested_partner_name VARCHAR
        """))
        print("Migration complete: added requested_spec, requested_manufacturer, requested_partner_name")

asyncio.run(migrate())
