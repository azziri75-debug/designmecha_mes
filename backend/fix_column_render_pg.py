import sqlalchemy as sa
from sqlalchemy.engine import create_engine
import sys

# Remote Render URL found in run_quality_pg_migration.py
REMOTE_DB_URL = "postgresql+psycopg2://mes_erp_user:B0HnU9XJ5d6M7wPzN2zL4T0vD@dpg-cuid6l8gph6c738kpfug-a.singapore-postgres.render.com/mes_erp?sslmode=require"

def migrate_pg():
    print(f"Connecting to {REMOTE_DB_URL} ...")
    engine = create_engine(REMOTE_DB_URL, echo=True)
    with engine.begin() as conn:
        # 1. Check unit_price in work_log_items
        print('Checking columns in work_log_items...')
        try:
            result = conn.execute(sa.text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'work_log_items'
            """))
            columns = [row[0] for row in result.fetchall()]
            
            if 'unit_price' not in columns:
                print('Column unit_price not found in PostgreSQL. Adding it...')
                conn.execute(sa.text('ALTER TABLE work_log_items ADD COLUMN unit_price FLOAT DEFAULT 0.0'))
                print('Successfully added unit_price.')
            else:
                print('Column unit_price already exists.')
        except Exception as e:
            print(f'PostgreSQL query failed for work_log_items: {e}')

        # 2. Check attachment_file in work_logs
        print('Checking columns in work_logs...')
        try:
            result = conn.execute(sa.text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'work_logs'
            """))
            columns = [row[0] for row in result.fetchall()]
            
            if 'attachment_file' not in columns:
                print('Column attachment_file not found in PostgreSQL. Adding it...')
                # JSONB is better for PostgreSQL
                conn.execute(sa.text('ALTER TABLE work_logs ADD COLUMN attachment_file JSONB'))
                print('Successfully added attachment_file.')
            else:
                print('Column attachment_file already exists.')
        except Exception as e:
            print(f'PostgreSQL query failed for work_logs: {e}')

if __name__ == '__main__':
    migrate_pg()
