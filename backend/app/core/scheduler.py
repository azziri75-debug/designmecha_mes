import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime
from app.db.session import async_session_maker
from app.models.basics import Company, Staff, EmployeeTimeRecord
from app.utils.push import send_push_notification

scheduler = AsyncIOScheduler()

async def check_attendance_and_notify():
    """
    매 분마다 실행되어 현재 시각이 회사 출/퇴근 시각인지 확인.
    시각이 일치하면, 오늘자 출퇴근 기록이 없는 활성 직원들에게 푸시 알림.
    """
    now = datetime.now()
    # 월~금 (0~4) 외에는 발송하지 않음
    if now.weekday() > 4:
        return

    current_time_str = now.strftime("%H:%M")
    
    async with async_session_maker() as db:
        result = await db.execute(select(Company).limit(1))
        company = result.scalars().first()
        
        if not company:
            return
            
        start_time_str = company.work_start_time.strftime("%H:%M") if company.work_start_time else "08:30"
        end_time_str = company.work_end_time.strftime("%H:%M") if company.work_end_time else "17:30"
        
        is_start_time = (current_time_str == start_time_str)
        is_end_time = (current_time_str == end_time_str)
        
        if not is_start_time and not is_end_time:
            return
            
        # 알림 발송 대상: 오늘(record_date == today) EmployeeTimeRecord가 아직 없는 직원 또는 출/퇴근 항목이 비어있는 직원
        today_date = now.date()
        
        # 활성 직원 전체 쿼리
        staff_result = await db.execute(select(Staff).where(Staff.is_active == True))
        active_staffs = staff_result.scalars().all()
        
        # 오늘자 기록 쿼리
        record_result = await db.execute(
            select(EmployeeTimeRecord).where(EmployeeTimeRecord.record_date == today_date)
        )
        today_records = {r.staff_id: r for r in record_result.scalars().all()}
        
        for staff in active_staffs:
            record = today_records.get(staff.id)
            need_notify = False
            message = ""
            title = "근태 알림"
            
            if is_start_time:
                # 출근 시각 검사
                if not record or not record.clock_in_time:
                    need_notify = True
                    message = f"{staff.name}님, 좋은 아침입니다! 출근 기록을 잊지 마세요."
            
            elif is_end_time:
                # 퇴근 시각 검사
                if not record or not record.clock_out_time:
                    need_notify = True
                    message = f"{staff.name}님, 오늘 하루 고생하셨습니다! 퇴근 전 기록을 잊지 마세요."
            
            if need_notify:
                # 비동기적으로 푸시 알림 백그라운드 발송
                asyncio.create_task(send_push_notification(
                    user_id=staff.id,
                    title=title,
                    body=message,
                    url="/attendance"
                ))

def start_scheduler():
    if not scheduler.running:
        # 매 1분마다 실행 (0초에 실행)
        scheduler.add_job(check_attendance_and_notify, 'cron', minute='*')
        scheduler.start()
        print("Backend: Scheduler started (Attendance Check interval).")
