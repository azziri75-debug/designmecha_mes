import asyncio
import sqlite3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from app.api.deps import engine
from app.models.basics import Staff, EmployeeTimeRecord
from app.models.approval import ApprovalDocument, ApprovalStep
from app.models.hr import AttendanceLog

async def sync_schema():
    # Manual migration for SQLite since ALTER TABLE ADD COLUMN IF NOT EXISTS is not always supported
    # and we have multiple missing columns.
    columns_to_add = [
        ("login_id", "TEXT"),
        ("is_sysadmin", "BOOLEAN DEFAULT 0"),
        ("staff_no", "TEXT"),
        ("department", "TEXT"),
        ("department_id", "INTEGER"),
        ("email", "TEXT"),
        ("join_date", "DATE"),
        ("mac_address", "TEXT"),
        ("ip_address", "TEXT"),
        ("can_access_external", "BOOLEAN DEFAULT 0"),
        ("can_view_others", "BOOLEAN DEFAULT 0"),
        ("is_accounting", "BOOLEAN DEFAULT 0"),
        ("extension", "TEXT")
    ]
    
    async with engine.begin() as conn:
        for col_name, col_type in columns_to_add:
            try:
                await conn.execute(text(f"ALTER TABLE staff ADD COLUMN {col_name} {col_type}"))
                print(f"Added column {col_name} to staff table.")
            except Exception as e:
                # Column likely already exists
                pass

async def cleanup_duplicates():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as db:
        # Find duplicate 'admin' accounts
        result = await db.execute(select(Staff).where(Staff.login_id == "admin").order_by(Staff.id.asc()))
        admins = result.scalars().all()
        
        if len(admins) <= 1:
            print("No duplicate admin accounts found.")
            return

        primary_admin = admins[0]
        duplicate_admins = admins[1:]
        
        print(f"Found {len(duplicate_admins)} duplicate admin accounts. Primary ID: {primary_admin.id}")
        
        for dup in duplicate_admins:
            print(f"Merging duplicate admin ID: {dup.id}")
            
            # Reassign ApprovalDocuments (drafter_id)
            await db.execute(
                text("UPDATE approval_documents SET drafter_id = :primary_id WHERE drafter_id = :dup_id"),
                {"primary_id": primary_admin.id, "dup_id": dup.id}
            )
            
            # Reassign ApprovalSteps (approver_id)
            await db.execute(
                text("UPDATE approval_steps SET approver_id = :primary_id WHERE approver_id = :dup_id"),
                {"primary_id": primary_admin.id, "dup_id": dup.id}
            )
            
            # Reassign EmployeeTimeRecords (staff_id)
            await db.execute(
                text("UPDATE employee_time_records SET staff_id = :primary_id WHERE staff_id = :dup_id"),
                {"primary_id": primary_admin.id, "dup_id": dup.id}
            )
            
            # Reassign AttendanceLogs (staff_id)
            await db.execute(
                text("UPDATE attendance_logs SET staff_id = :primary_id WHERE staff_id = :dup_id"),
                {"primary_id": primary_admin.id, "dup_id": dup.id}
            )
            
            # Delete the duplicate staff entry
            await db.delete(dup)
        
        await db.commit()
        print("Duplicate admin accounts merged successfully.")

async def enforce_unique_constraint():
    # SQLite workaround for adding UNIQUE constraint to existing table:
    # 1. Create a unique index
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_login_id_unique ON staff(login_id)"))
            print("Unique index on staff(login_id) created.")
        except Exception as e:
            print(f"Failed to create unique index: {e}")

async def main():
    print("Starting DB maintenance...")
    await sync_schema()
    await cleanup_duplicates()
    await enforce_unique_constraint()
    print("DB maintenance complete.")

if __name__ == "__main__":
    asyncio.run(main())
