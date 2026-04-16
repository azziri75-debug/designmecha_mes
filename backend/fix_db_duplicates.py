import asyncio
from sqlalchemy.future import select
from sqlalchemy import text, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from app.api.deps import engine
from app.models.basics import Staff, EmployeeTimeRecord
from app.models.approval import ApprovalDocument, ApprovalStep
from app.models.hr import AttendanceLog

async def cleanup_duplicates():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # 1. Identify duplicates of 'admin'
        res = await db.execute(
            select(Staff).where(Staff.login_id == 'admin').order_by(Staff.id.asc())
        )
        admins = res.scalars().all()
        
        if len(admins) <= 1:
            print("No admin duplicates found.")
            if len(admins) == 0:
                print("⚠️ No admin account found at all! Please run init_db.py after this.")
        else:
            primary_admin = admins[0]
            duplicates = admins[1:]
            duplicate_ids = [d.id for d in duplicates]
            
            print(f"Found {len(duplicates)} duplicate admin accounts. Primary ID: {primary_admin.id}")
            print(f"Duplicate IDs to remove: {duplicate_ids}")
            
            # 2. Reassign relations
            # Approval Documents
            updated_docs = await db.execute(
                update(ApprovalDocument)
                .where(ApprovalDocument.author_id.in_(duplicate_ids))
                .values(author_id=primary_admin.id)
            )
            print(f"Reassigned {updated_docs.rowcount} approval documents.")
            
            # Approval Steps
            updated_steps = await db.execute(
                update(ApprovalStep)
                .where(ApprovalStep.approver_id.in_(duplicate_ids))
                .values(approver_id=primary_admin.id)
            )
            print(f"Reassigned {updated_steps.rowcount} approval steps.")
            
            # Time Records
            updated_records = await db.execute(
                update(EmployeeTimeRecord)
                .where(EmployeeTimeRecord.staff_id.in_(duplicate_ids))
                .values(staff_id=primary_admin.id)
            )
            print(f"Reassigned {updated_records.rowcount} time records.")
            
            # Attendance Logs
            updated_logs = await db.execute(
                update(AttendanceLog)
                .where(AttendanceLog.staff_id.in_(duplicate_ids))
                .values(staff_id=primary_admin.id)
            )
            print(f"Reassigned {updated_logs.rowcount} attendance logs.")

            # 3. Delete duplicates
            await db.execute(
                delete(Staff).where(Staff.id.in_(duplicate_ids))
            )
            print(f"Deleted {len(duplicate_ids)} duplicate staff records.")
            
        # 4. Enforce UNIQUE constraint in DB (for PostgreSQL)
        print("Enforcing UNIQUE constraint on staff(login_id)...")
        try:
            # We use text() for raw SQL. 
            # First, check if index exists (optional but safer)
            await db.execute(text("ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_login_id_key;"))
            await db.execute(text("ALTER TABLE staff ADD CONSTRAINT staff_login_id_key UNIQUE (login_id);"))
            print("✅ UNIQUE constraint 'staff_login_id_key' added successfully.")
        except Exception as e:
            print(f"⚠️ Failed to add UNIQUE constraint (it might already exist or DB is SQLite): {e}")

        await db.commit()
        print("Cleanup completed successfully.")

if __name__ == "__main__":
    asyncio.run(cleanup_duplicates())
