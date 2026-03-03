import asyncio
import sys
import os
from sqlalchemy import text
from sqlalchemy.future import select

# Add parent dir to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from app.models.basics import EmployeeTimeRecord, Company
from app.models.approval import ApprovalDocument

def to_minutes(t_s):
    if not t_s: return 0
    parts = t_s.split(':')
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    return h * 60 + m

async def fix_attendance_hours():
    async with AsyncSessionLocal() as db:
        print("Starting data fix for employee_time_records...")
        
        # 1. Fetch Company for default work_end_time
        comp_res = await db.execute(select(Company))
        comp = comp_res.scalars().first()
        work_end_str = "17:30"
        if comp:
            if isinstance(comp.work_end_time, str):
                work_end_str = comp.work_end_time
            elif comp.work_end_time: # time object
                work_end_str = comp.work_end_time.strftime("%H:%M")
        
        print(f"Reference work_end_time: {work_end_str}")
        
        # 2. Fetch all records with 0 hours that might be fixable via content parsing
        stmt = select(EmployeeTimeRecord).where(
            EmployeeTimeRecord.category.in_(["EARLY_LEAVE", "OUTING", "OVERTIME"]),
            EmployeeTimeRecord.hours == 0.0
        )
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        fixed_count = 0
        for r in records:
            try:
                # Content format: "조퇴: 15:30 ~  - 개인사유" or "연장근무: 18:00 ~ 20:00 - 업무"
                content = r.content or ""
                if "~" in content:
                    times_part = content.split('-')[0].split(':')[-1].strip() # "15:30 ~ 17:30" or "15:30 ~ "
                    if "~" in times_part:
                        parts = times_part.split('~')
                        t1_str = parts[0].strip()
                        t2_str = parts[1].strip() if len(parts) > 1 else ""
                        
                        if t1_str:
                            m1 = to_minutes(t1_str)
                            if t2_str:
                                m2 = to_minutes(t2_str)
                                delta = m2 - m1
                            else:
                                m_end = to_minutes(work_end_str)
                                delta = m_end - m1
                            
                            if delta < 0: delta += 1440
                            r.hours = round(delta / 60.0, 2)
                            fixed_count += 1
                            print(f"Fixed record {r.id}: {r.hours}h")
            except Exception as e:
                print(f"Error fixing record {r.id}: {e}")
        
        await db.commit()
        print(f"Data fix finished. Fixed {fixed_count} records.")

if __name__ == "__main__":
    asyncio.run(fix_attendance_hours())
