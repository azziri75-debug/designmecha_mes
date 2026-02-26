import sqlalchemy as sa
from sqlalchemy.engine import create_engine
import sys

# Force remote render URL with SSL & sync psycopg2
REMOTE_DB_URL = "postgresql+psycopg2://mes_erp_user:B0HnU9XJ5d6M7wPzN2zL4T0vD@dpg-cuid6l8gph6c738kpfug-a.singapore-postgres.render.com/mes_erp?sslmode=require"

def migrate_pg():
    print(f"Connecting to {REMOTE_DB_URL} ...")
    engine = create_engine(REMOTE_DB_URL, echo=True)
    with engine.begin() as conn:
        print('Checking columns in quality_defects...')
        try:
            result = conn.execute(sa.text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'quality_defects'
            """))
            columns = [row[0] for row in result.fetchall()]
            
            if 'attachment_file' not in columns:
                print('Column attachment_file not found in PostgreSQL. Adding it...')
                conn.execute(sa.text('ALTER TABLE quality_defects ADD COLUMN attachment_file TEXT'))
                print('Successfully added attachment_file.')
            else:
                print('Column attachment_file already exists.')
        except Exception as e:
            print(f'PostgreSQL query failed: {e}')
            sys.exit(1)

if __name__ == '__main__':
    migrate_pg()
