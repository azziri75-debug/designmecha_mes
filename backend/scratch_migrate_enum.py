import asyncio
import sys
import os
from sqlalchemy import text

# app 모듈 로딩을 위한 path 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import engine

async def migrate():
    db_url = str(engine.url)
    print(f"Database URL: {db_url}")
    
    if "sqlite" in db_url:
        print("SQLite environment. No need to alter PG enum type.")
        return
        
    async with engine.connect() as conn:
        print("Connected to PostgreSQL. Getting raw connection...")
        conn_raw = await conn.get_raw_connection()
        asyncpg_conn = conn_raw.driver_connection
        
        # 'QUOTATION' 값 추가 시도
        try:
            await asyncpg_conn.execute("ALTER TYPE outsourcingstatus ADD VALUE 'QUOTATION';")
            print("Successfully added 'QUOTATION' to outsourcingstatus ENUM.")
        except Exception as e:
            if "already exists" in str(e) or "duplicate" in str(e).lower():
                print("'QUOTATION' already exists in ENUM.")
            else:
                print(f"Error adding 'QUOTATION': {e}")
                
        # 'QUOTATION_COMPLETE' 값 추가 시도
        try:
            await asyncpg_conn.execute("ALTER TYPE outsourcingstatus ADD VALUE 'QUOTATION_COMPLETE';")
            print("Successfully added 'QUOTATION_COMPLETE' to outsourcingstatus ENUM.")
        except Exception as e:
            if "already exists" in str(e) or "duplicate" in str(e).lower():
                print("'QUOTATION_COMPLETE' already exists in ENUM.")
            else:
                print(f"Error adding 'QUOTATION_COMPLETE': {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
