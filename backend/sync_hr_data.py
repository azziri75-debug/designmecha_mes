import asyncio
import sys
import os
from datetime import date, timedelta
from sqlalchemy import text
from sqlalchemy.future import select

# Add the parent directory to sys.path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from app.models.basics import Company, EmployeeTimeRecord, Staff
from app.models.approval import ApprovalDocument, ApprovalStatus

async def sync_db_columns():
    print("Step 1: Synchronizing companies table columns...")
    async with AsyncSessionLocal() as db:
        try:
            # Add columns if they don't exist
            # Note: SQLite doesn't support 'IF NOT EXISTS' in ALTER TABLE directly in all versions, 
            # but we can try-except or check pragmas. For PostgreSQL it works.
            # Assuming PostgreSQL based on the user's environment in previous logs.
            await db.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS work_start_time VARCHAR DEFAULT '08:30'"))
            await db.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS work_end_time VARCHAR DEFAULT '17:30'"))
            await db.commit()
            print("Successfully added/checked columns in companies table.")
        except Exception as e:
            await db.rollback()
            print(f"Error syncing columns: {e}")

async def migrate_attendance_data():
    print("Step 2: Migrating legacy attendance data from approval documents...")
    async with AsyncSessionLocal() as db:
        try:
            # Fetch all approved attendance documents
            stmt = select(ApprovalDocument).where(
                ApprovalDocument.status == ApprovalStatus.COMPLETED,
                ApprovalDocument.doc_type.in_(["VACATION", "EARLY_LEAVE", "OVERTIME"])
            )
            result = await db.execute(stmt)
            documents = result.scalars().all()
            
            migrated_count = 0
            for doc in documents:
                content = doc.content or {}
                
                if doc.doc_type == "VACATION":
                    start_date_str = content.get("start_date")
                    end_date_str = content.get("end_date")
                    if not start_date_str: continue
                    
                    start_date = date.fromisoformat(start_date_str)
                    end_date = date.fromisoformat(end_date_str) if end_date_str else start_date
                    v_type = content.get("vacation_type", "연차")
                    
                    curr = start_date
                    while curr <= end_date:
                        # Skip weekends
                        if curr.weekday() < 5:
                            # Check for duplicates
                            dup_check = await db.execute(select(EmployeeTimeRecord).where(
                                EmployeeTimeRecord.staff_id == doc.author_id,
                                EmployeeTimeRecord.record_date == curr,
                                EmployeeTimeRecord.category == ("HALF_DAY" if v_type == "반차" else ("SICK" if v_type == "병가" else "ANNUAL"))
                            ))
                            if not dup_check.scalar_one_or_none():
                                record = EmployeeTimeRecord(
                                    staff_id=doc.author_id,
                                    record_date=curr,
                                    category="HALF_DAY" if v_type == "반차" else ("SICK" if v_type == "병가" else "ANNUAL"),
                                    content=f"{v_type} ({content.get('half_day_type', '')}) - {content.get('reason', '')}",
                                    author_id=doc.author_id,
                                    status="APPROVED"
                                )
                                db.add(record)
                                migrated_count += 1
                        curr += timedelta(days=1)
                
                elif doc.doc_type == "EARLY_LEAVE":
                    date_str = content.get("date")
                    if not date_str: continue
                    record_date = date.fromisoformat(date_str)
                    e_type = content.get("type", "조퇴")
                    
                    # Check for duplicates
                    category = "EARLY_LEAVE" if e_type == "조퇴" else "OUTING"
                    dup_check = await db.execute(select(EmployeeTimeRecord).where(
                        EmployeeTimeRecord.staff_id == doc.author_id,
                        EmployeeTimeRecord.record_date == record_date,
                        EmployeeTimeRecord.category == category
                    ))
                    if not dup_check.scalar_one_or_none():
                        record = EmployeeTimeRecord(
                            staff_id=doc.author_id,
                            record_date=record_date,
                            category=category,
                            content=f"{e_type}: {content.get('time', '')} ~ {content.get('end_time', '')} - {content.get('reason', '')}",
                            author_id=doc.author_id,
                            status="APPROVED"
                        )
                        db.add(record)
                        migrated_count += 1
                
                elif doc.doc_type == "OVERTIME":
                    date_str = content.get("date")
                    if not date_str: continue
                    record_date = date.fromisoformat(date_str)
                    
                    # Check for duplicates
                    dup_check = await db.execute(select(EmployeeTimeRecord).where(
                        EmployeeTimeRecord.staff_id == doc.author_id,
                        EmployeeTimeRecord.record_date == record_date,
                        EmployeeTimeRecord.category == "OVERTIME"
                    ))
                    if not dup_check.scalar_one_or_none():
                        record = EmployeeTimeRecord(
                            staff_id=doc.author_id,
                            record_date=record_date,
                            category="OVERTIME",
                            content=f"연장근무: {content.get('start_time', '')} ~ {content.get('end_time', '')} - {content.get('reason', '')}",
                            author_id=doc.author_id,
                            status="APPROVED"
                        )
                        db.add(record)
                        migrated_count += 1
            
            await db.commit()
            print(f"Successfully migrated {migrated_count} records.")
        except Exception as e:
            await db.rollback()
            print(f"Error migrating data: {e}")

async def main():
    await sync_db_columns()
    await migrate_attendance_data()
    print("Migration finished.")

if __name__ == "__main__":
    asyncio.run(main())
