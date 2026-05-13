"""
Migration: Add is_export and invoice_no columns to delivery_histories table.
Safe to run multiple times (IF NOT EXISTS / checks before ALTER).
"""
import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.api import deps


async def add_export_columns():
    print("[Migration] Checking delivery_histories for is_export / invoice_no columns...")

    async for db in deps.get_db():
        try:
            # Check / add is_export
            res = await db.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'delivery_histories' AND column_name = 'is_export'
            """))
            if not res.fetchone():
                await db.execute(text(
                    "ALTER TABLE delivery_histories ADD COLUMN is_export BOOLEAN DEFAULT FALSE"
                ))
                print("[Migration] Added column: delivery_histories.is_export")
            else:
                print("[Migration] Column already exists: delivery_histories.is_export")

            # Check / add invoice_no
            res = await db.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'delivery_histories' AND column_name = 'invoice_no'
            """))
            if not res.fetchone():
                await db.execute(text(
                    "ALTER TABLE delivery_histories ADD COLUMN invoice_no VARCHAR"
                ))
                print("[Migration] Added column: delivery_histories.invoice_no")
            else:
                print("[Migration] Column already exists: delivery_histories.invoice_no")

            await db.commit()
            print("[Migration] Done.")
        except Exception as e:
            print(f"[Migration] Error (non-fatal): {e}")
        break  # only need one session


if __name__ == "__main__":
    asyncio.run(add_export_columns())
