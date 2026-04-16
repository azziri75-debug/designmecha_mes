
import asyncio
from app.api.deps import AsyncSessionLocal
from sqlalchemy import text

async def list_staff():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT id, login_id, name, user_type FROM staff"))
        rows = res.fetchall()
        print(f"Total staff: {len(rows)}")
        for row in rows:
            # Safely print row to avoid encoding issues
            print(f"ID: {row[0]}, Login: {row[1]}, Name: {row[2].encode('utf-8') if row[2] else 'None'}, Type: {row[3]}")

if __name__ == "__main__":
    asyncio.run(list_staff())
