import asyncio
import sys
from sqlalchemy import text
from app.api.deps import engine

async def check_table_exists(conn, table_name):
    dialect = conn.dialect.name
    try:
        if dialect == 'sqlite':
            res = await conn.execute(text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"))
            return res.fetchone() is not None
        elif dialect == 'postgresql':
            res = await conn.execute(text(f"SELECT tablename FROM pg_catalog.pg_tables WHERE tablename = '{table_name}'"))
            return res.fetchone() is not None
    except Exception as e:
        print(f"Error checking table exists ({table_name}): {e}")
    return False

async def add_column_if_not_exists(conn, table_name, column_name, column_def):
    dialect = conn.dialect.name
    
    # Check if table exists first
    exists = await check_table_exists(conn, table_name)
    if not exists:
        return False

    try:
        if dialect == 'sqlite':
            res = await conn.execute(text(f"PRAGMA table_info({table_name})"))
            columns = [row[1] for row in res.fetchall()]
            if column_name not in columns:
                print(f"Adding column '{column_name}' to '{table_name}'...")
                await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))
                await conn.commit()
                print(f"Column '{column_name}' added to '{table_name}' and committed.")
            else:
                print(f"Column '{column_name}' already exists in '{table_name}'.")
                
        elif dialect == 'postgresql':
            check_sql = text("SELECT column_name FROM information_schema.columns WHERE table_name=:t AND column_name=:c")
            res = await conn.execute(check_sql, {"t": table_name, "c": column_name})
            if not res.fetchone():
                print(f"Adding column '{column_name}' to '{table_name}'...")
                await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))
                await conn.commit()
                print(f"Column '{column_name}' added to '{table_name}' and committed.")
            else:
                print(f"Column '{column_name}' already exists in '{table_name}'.")
        return True
    except Exception as e:
        print(f"Error processing column '{column_name}' for table '{table_name}': {e}")
        return False

async def main():
    print("Starting Force HR Migration Script V2...")
    async with engine.connect() as conn:
        dialect = conn.dialect.name
        print(f"Database dialect detected: {dialect}")

        # 1. Staff Table
        for t in ["staff", "staffs"]:
            if await add_column_if_not_exists(conn, t, "mac_address", "VARCHAR"):
                await add_column_if_not_exists(conn, t, "ip_address", "VARCHAR")
                break
        else:
            print("WARNING: Neither 'staff' nor 'staffs' table found.")

        # 2. Companies Table
        for t in ["companies", "company"]:
            if await add_column_if_not_exists(conn, t, "grace_period_start_mins", "INTEGER DEFAULT 0"):
                await add_column_if_not_exists(conn, t, "grace_period_end_mins", "INTEGER DEFAULT 0")
                break
        else:
            print("WARNING: Neither 'companies' nor 'company' table found.")

        # 3. Employee Time Records Table
        ts_type = "TIMESTAMP" if dialect == 'postgresql' else "DATETIME"
        for t in ["employee_time_records", "employee_time_record"]:
            if await add_column_if_not_exists(conn, t, "clock_in_time", ts_type):
                await add_column_if_not_exists(conn, t, "clock_out_time", ts_type)
                await add_column_if_not_exists(conn, t, "record_source", "VARCHAR")
                await add_column_if_not_exists(conn, t, "attendance_status", "VARCHAR DEFAULT 'NORMAL'")
                break
        else:
            print("WARNING: Neither 'employee_time_records' nor 'employee_time_record' table found.")

        # 4. Attendance Logs Table (Create if not exists)
        try:
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
            await conn.commit()
            print("'attendance_logs' table checked/created and committed.")
        except Exception as e:
            print(f"Error creating attendance_logs table: {e}")
        
        print("\nForce migration V2 completed.")

if __name__ == "__main__":
    asyncio.run(main())
