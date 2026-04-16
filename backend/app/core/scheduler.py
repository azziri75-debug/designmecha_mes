import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime
from app.api.deps import AsyncSessionLocal
from app.models.basics import Company, Staff, EmployeeTimeRecord
from app.models.approval import ApprovalDocument, ApprovalStep
from app.utils.push import send_push_notification

scheduler = AsyncIOScheduler()

async def check_pending_approvals_and_notify():
    """
    매 정각(시간마다) 실행되어, 자신의 결재 차례인 미결재 문서가 있는 직원에게 알림을 발송.
    """
    async with AsyncSessionLocal() as db:
        # 현재 내 차례(sequence == current_sequence)이면서, PENDING 상태인 Step 검색
        # 결재 대기 중인 항목 조회 (문서 상태가 PENDING 혹은 IN_PROGRESS인 것만)
        stmt = select(ApprovalStep.approver_id, func.count(ApprovalStep.id)).join(
            ApprovalDocument, ApprovalDocument.id == ApprovalStep.document_id
        ).where(
            ApprovalStep.status == "PENDING",
            ApprovalDocument.status.in_(["PENDING", "IN_PROGRESS"]),
            ApprovalStep.sequence == ApprovalDocument.current_sequence,
            ApprovalDocument.current_sequence > 0,
            ApprovalDocument.deleted_at.is_(None)
        ).group_by(ApprovalStep.approver_id)
        
        result = await db.execute(stmt)
        pending_counts = result.fetchall()
        
        print(f"[DEBUG] Scheduler found {len(pending_counts)} approvers with pending tasks.")
        
        for approver_id, count in pending_counts:
            staff_result = await db.execute(select(Staff).where(Staff.id == approver_id))
            staff = staff_result.scalar_one_or_none()
            
            if staff and count > 0:
                title = "[결재 대기] 처리할 문서가 있습니다"
                body = f"{staff.name}님, 현재 처리 대기 중인 결재 문서가 {count}건 있습니다."
                # [FIX] URL should favor the mobile-redirect-ready path for mobile users
                url = "/approval" 
                
                print(f"[DEBUG] Sending pending reminder to {staff.name} (staff_id: {approver_id}), count: {count}")
                # 푸시 알림 발송 - await to ensure database is not closed before task starts if needed, 
                # but create_task is okay if we don't rely on the session inside the task.
                await send_push_notification(approver_id, title, body, url)

async def check_attendance_and_notify():
    """
    매 분마다 실행되어 현재 시각이 회사 출/퇴근 시각인지 확인.
    시각이 일치하면, 오늘자 출퇴근 기록이 없는 활성 직원들에게 푸시 알림.
    """
    now = now_kst()
    # 월~금 (0~4) 외에는 발송하지 않음
    if now.weekday() > 4:
        return

    current_time_str = now.strftime("%H:%M")
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Company).limit(1))
        company = result.scalars().first()
        
        if not company:
            return
            
        start_time_str = company.work_start_time.strftime("%H:%M") if company.work_start_time else "08:30"
        end_time_str = company.work_end_time.strftime("%H:%M") if company.work_end_time else "17:30"
        
        is_start_time = (current_time_str == start_time_str)
        is_end_time = (current_time_str == end_time_str)
        
        if not is_start_time and not is_end_time:
            # 매 10분마다 스케줄러 생존 신고 로그 (선택 사항)
            if now.minute % 10 == 0:
                print(f"Scheduler: Attendance check active at {current_time_str} (Target: {start_time_str}/{end_time_str})")
            return
            
        print(f"⏰ [NOTIFY] Attendance trigger hit at {current_time_str}!")
            
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
            title = "근태 관리 알람"
            
            if is_start_time:
                # 출근 시각 검사
                if not record or not record.clock_in_time:
                    need_notify = True
                    message = f"{staff.name}님, 좋은 아침입니다! 아직 출근 기록이 없습니다. 기록을 잊지 마세요."
            
            elif is_end_time:
                # 퇴근 시각 검사
                if not record or not record.clock_out_time:
                    need_notify = True
                    message = f"{staff.name}님, 오늘 하루 고생하셨습니다! 퇴근 전 기록을 잊지 마세요."
            
            if need_notify:
                print(f"   >> Sending {title} to {staff.name} ({staff.id})")
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
        # 미결재 알림: 매 정각(0분) 마다 실행
        scheduler.add_job(check_pending_approvals_and_notify, 'cron', minute='0')
        scheduler.start()
        print("Backend: Scheduler started (Attendance Check & Approval Reminder).")
