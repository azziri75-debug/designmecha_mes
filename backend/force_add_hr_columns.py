import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def add_column_if_not_exists(conn, table_name, column_name, column_def):
    dialect = conn.dialect.name
    
    if dialect == 'sqlite':
        # Check if column exists in SQLite
        res = await conn.execute(text(f"PRAGMA table_info({table_name})"))
        columns = [row[1] for row in res.fetchall()]
        if column_name not in columns:
            print(f"Adding column '{column_name}' to '{table_name}'...")
            await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))
        else:
            print(f"Column '{column_name}' already exists in '{table_name}'.")
            
    elif dialect == 'postgresql':
        # Check if column exists in PostgreSQL
        check_sql = text(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='{table_name}' AND column_name='{column_name}'
        """)
        res = await conn.execute(check_sql)
        if not res.fetchone():
            print(f"Adding column '{column_name}' to '{table_name}'...")
            await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))
        else:
            print(f"Column '{column_name}' already exists in '{table_name}'.")

async def main():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        print(f"Database dialect detected: {dialect}")

        # 1. Companies Table
        await add_column_if_not_exists(conn, "companies", "grace_period_start_mins", "INTEGER DEFAULT 0")
        await add_column_if_not_exists(conn, "companies", "grace_period_end_mins", "INTEGER DEFAULT 0")

        # 2. Staff Table
        await add_column_if_not_exists(conn, "staff", "mac_address", "VARCHAR")
        await add_column_if_not_exists(conn, "staff", "ip_address", "VARCHAR")

        # 3. Employee Time Records Table
        ts_type = "TIMESTAMP" if dialect == 'postgresql' else "DATETIME"
        await add_column_if_not_exists(conn, "employee_time_records", "clock_in_time", ts_type)
        await add_column_if_not_exists(conn, "employee_time_records", "clock_out_time", ts_type)
        await add_column_if_not_exists(conn, "employee_time_records", "record_source", "VARCHAR")
        await add_column_if_not_exists(conn, "employee_time_records", "attendance_status", "VARCHAR DEFAULT 'NORMAL'")

        # 4. Attendance Logs Table (Create if not exists)
        if dialect == 'sqlite':
            create_logs_sql = """
                CREATE TABLE IF NOT EXISTS attendance_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                    log_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    log_type VARCHAR NOT NULL
                )
            """
        else:
            create_logs_sql = """
                CREATE TABLE IF NOT EXISTS attendance_logs (
                    id SERIAL PRIMARY KEY,
                    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    log_type VARCHAR NOT NULL
                )
            """
        
        print("Ensuring 'attendance_logs' table exists...")
        await conn.execute(text(create_logs_sql))
        
        print("\nForce migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
