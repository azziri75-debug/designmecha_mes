import asyncio
import os
import sys
sys.path.insert(0, r'd:\MES\backend')

async def migrate():
    try:
        import asyncpg
        conn = await asyncpg.connect(
            host='localhost', port=5433,
            user='postgres', password='password', database='mes_erp'
        )
        await conn.execute('ALTER TABLE stock_productions ADD COLUMN IF NOT EXISTS batch_no VARCHAR')
        await conn.execute('CREATE INDEX IF NOT EXISTS ix_stock_productions_batch_no ON stock_productions (batch_no)')
        await conn.execute("UPDATE stock_productions SET batch_no = production_no WHERE batch_no IS NULL")
        count = await conn.fetchval("SELECT COUNT(*) FROM stock_productions")
        print(f'Migration complete. Rows updated: {count}')
        await conn.close()
    except Exception as e:
        print(f'asyncpg error: {e}')
        # Fallback: try sqlalchemy sync
        try:
            import psycopg2
            conn = psycopg2.connect(host='localhost', port=5433, user='postgres', password='password', dbname='mes_erp')
            cur = conn.cursor()
            cur.execute('ALTER TABLE stock_productions ADD COLUMN IF NOT EXISTS batch_no VARCHAR')
            cur.execute('CREATE INDEX IF NOT EXISTS ix_stock_productions_batch_no ON stock_productions (batch_no)')
            cur.execute("UPDATE stock_productions SET batch_no = production_no WHERE batch_no IS NULL")
            conn.commit()
            print('Migration complete via psycopg2')
            conn.close()
        except Exception as e2:
            print(f'psycopg2 error: {e2}')

asyncio.run(migrate())
