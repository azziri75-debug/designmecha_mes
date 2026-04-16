from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional
from datetime import date, datetime, timedelta, time as time_type, timezone

from app.api import deps
from app.core.timezone import now_kst, KST
from app.models.approval import ApprovalDocument, ApprovalStatus
from app.models import Staff, Company, EmployeeTimeRecord, AttendanceStatus
from app.utils.push import send_push_notification
import asyncio
from app.schemas.hr import (
    AttendanceSummaryResponse, 
    AttendanceDocItem, 
    AttendanceClockInUpdate, 
    AttendanceClockOutUpdate, 
    AttendanceMonthlyResponse,
    EmployeeTimeRecordUpdate,
    EmployeeTimeRecordResponse,
    EmployeeAnnualLeaveResponse,
    AnnualLeaveHistoryResponse,
    AnnualLeaveUpdate
)
from app.models.hr import EmployeeAnnualLeave, AttendanceLog, AttendanceLogType

KST = timezone(timedelta(hours=9))

# SSE 브로드캐스터 임포트 (실시간 업데이트용)
try:
    from app.main import sse_broadcaster
except ImportError:
    sse_broadcaster = None

router = APIRouter()

@router.post("/sync-attendance")
async def sync_all_attendance_records(
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    # 시스템 관리자만 실행 가능
    if not getattr(current_user, 'is_sysadmin', False) and current_user.user_type != 'ADMIN':
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
        
    # 👇👇 [핵심 픽스] 순환 참조를 피하기 위해 함수 내부에서 지역적으로 import 할 것 👇👇
    from app.api.endpoints.approval import create_attendance_record
        
    # 1. 결재가 완료된 근태 관련 문서들 모두 색인
    stmt = select(ApprovalDocument).where(
        ApprovalDocument.status == ApprovalStatus.COMPLETED,
        ApprovalDocument.doc_type.in_(["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"])
    )
    res = await db.execute(stmt)
    approved_docs = res.scalars().all()
    
    recovered_count = 0
    
    for doc in approved_docs:
        # 2. 해당 문서(approval_id)로 생성된 근태 기록이 있는지 확인
        check_stmt = select(EmployeeTimeRecord).where(EmployeeTimeRecord.approval_id == doc.id)
        check_res = await db.execute(check_stmt)
        existing_records = check_res.scalars().all()
        
        # 3. 기록이 아예 없다면 (과거 에러로 유실되었다면) 복구 실행
        if not existing_records:
            await create_attendance_record(db, doc)
            recovered_count += 1
            
    return {"message": f"총 {recovered_count}건의 누락된 근태 기록 및 연차 차감이 성공적으로 복구(동기화)되었습니다."}

@router.post("/cleanup-ghost-data")
async def cleanup_ghost_data(
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    """
    유령 근태 데이터 강제 삭제 (마운트 시 프론트엔드에서 자동 호출)
    - approval_id가 NULL인 결재 연계 카테고리 기록 삭제
    - 연결된 결재 문서가 소프트 삭제된 기록 삭제
    """
    from sqlalchemy import text as sql_text
    await db.execute(sql_text("""
        DELETE FROM employee_time_records 
        WHERE category IN ('휴가', '연차', '외출', '반차', 'ANNUAL', 'HALF_DAY', 'OUTING', 'EARLY_LEAVE', 'EVENT_LEAVE')
        AND (
            approval_id IS NULL
            OR approval_id IN (
                SELECT id FROM approval_documents WHERE deleted_at IS NOT NULL
            )
        )
    """))
    await db.commit()
    return {"status": "ok", "message": "Ghost employee_time_records cleaned up"}


def _to_minutes(t_str: str) -> int:
    """'HH:MM' 또는 'HH:MM:SS' 문자열을 분(Minutes)으로 변환"""
    if not t_str:
        return 0
    parts = t_str.split(":")
    h = int(parts[0]) if len(parts) > 0 else 0
    m = int(parts[1]) if len(parts) > 1 else 0
    return h * 60 + m


def _time_obj_to_minutes(t: time_type) -> int:
    """time 객체를 분(Minutes)으로 변환"""
    return t.hour * 60 + t.minute


def _business_days_between(start: date, end: date) -> int:
    """시작~종료 사이의 평일(월~금) 수를 반환"""
    count = 0
    curr = start
    while curr <= end:
        if curr.weekday() < 5:  # 0~4 = 월~금
            count += 1
        curr += timedelta(days=1)
    return count


def calculate_base_days(join_date: date, target_year: int) -> float:
    """사내 규정 반영 연차 계산 로직"""
    if not join_date:
        return 15.0
        
    # 1. 입사 당해 연도 (올해 입사자)
    if join_date.year == target_year:
        return float(max(0, 12 - join_date.month))
        
    # 2. 입사 다음 해부터 (무조건 15일 + 2년마다 가산연차 1일)
    years_of_service = target_year - join_date.year
    extra_days = (years_of_service - 1) // 2
    base = 15.0 + extra_days
    return float(min(25.0, base))


@router.get("/attendance/summary", response_model=AttendanceSummaryResponse)
async def get_attendance_summary(
    year: int = Query(..., description="조회 연도"),
    user_id: Optional[int] = Query(None, description="조회 대상 사원 ID (ADMIN만 타인 가능)"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    """
    전자결재 COMPLETED 문서를 실시간 집계하여 근태 요약을 반환합니다.
    - 휴가원 (VACATION)
    - 외출/조퇴원 (EARLY_LEAVE)
    - 특근/야근신청서 (OVERTIME)
    """
    # 권한 분기: 일반 사용자는 본인만 조회 가능
    target_id = user_id if user_id else current_user.id
    if target_id != current_user.id and current_user.user_type != "ADMIN":
        raise HTTPException(status_code=403, detail="본인의 근태만 조회할 수 있습니다.")

    # 대상 사원 정보 조회
    staff_res = await db.execute(select(Staff).where(Staff.id == target_id))
    target_staff = staff_res.scalar_one_or_none()
    if not target_staff:
        raise HTTPException(status_code=404, detail="사원을 찾을 수 없습니다.")

    # 회사 근무 종료 시간 조회
    comp_res = await db.execute(select(Company))
    company = comp_res.scalars().first()

    work_end_minutes = 17 * 60 + 30  # 기본값 17:30
    if company and company.work_end_time:
        if isinstance(company.work_end_time, str):
            work_end_minutes = _to_minutes(company.work_end_time)
        elif isinstance(company.work_end_time, time_type):
            work_end_minutes = _time_obj_to_minutes(company.work_end_time)

    # 해당 연도의 COMPLETED 결재 문서 조회 (VACATION, EARLY_LEAVE, OVERTIME, LEAVE_REQUEST)
    TARGET_TYPES = ["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]

    year_start = datetime(year, 1, 1)
    year_end = datetime(year, 12, 31, 23, 59, 59)

    docs_res = await db.execute(
        select(ApprovalDocument).where(
            ApprovalDocument.author_id == target_id,
            ApprovalDocument.doc_type.in_(TARGET_TYPES),
            ApprovalDocument.status == ApprovalStatus.COMPLETED,
            ApprovalDocument.deleted_at.is_(None),
        ).order_by(ApprovalDocument.created_at.desc())
    )
    docs = docs_res.scalars().all()

    total_vacation_days = 0.0
    total_sick_leave_days = 0.0
    total_event_leave_days = 0.0
    total_leave_outing_hours = 0.0
    total_overtime_hours = 0.0
    document_items: list[AttendanceDocItem] = []

    # [Sync] Sync annual leave record with these documents
    # used_leave_hours(Annual+Half-day), sick_leave_days, event_leave_days
    # Note: overtime is not part of annual leave, outing/early_leave is part of used_leave_hours
    leave_record = await get_or_create_annual_leave(db, target_id, year)

    for doc in docs:
        content = doc.content or {}

        if doc.doc_type in ["VACATION", "LEAVE_REQUEST"]:
            vacation_type = content.get("vacation_type", "연차")
            start_date_str = content.get("start_date")
            end_date_str = content.get("end_date") or start_date_str

            date_label = start_date_str
            applied_value = 0.0

            if vacation_type == "반차(Half-day)" or vacation_type == "반차":
                applied_value = 0.5
            else:
                if start_date_str:
                    try:
                        s_date = date.fromisoformat(str(start_date_str).split('T')[0])
                        e_date = date.fromisoformat(str(end_date_str).split('T')[0]) if end_date_str else s_date
                        
                        # 타겟 연도에 포함되는지 검사
                        if s_date.year != year and e_date.year != year:
                            continue
                            
                        applied_value = float(_business_days_between(s_date, e_date))
                        s_pure = str(start_date_str).split('T')[0]
                        e_pure = str(end_date_str).split('T')[0] if end_date_str else s_pure
                        if e_pure and e_pure != s_pure:
                            date_label = f"{s_pure} ~ {e_pure}"
                        else:
                            date_label = s_pure
                    except (ValueError, TypeError):
                        applied_value = 1.0

            if vacation_type == "병가":
                total_sick_leave_days += applied_value
            elif vacation_type == "경조휴가":
                total_event_leave_days += applied_value
            else:
                total_vacation_days += applied_value

            document_items.append(AttendanceDocItem(
                id=doc.id,
                doc_type=doc.doc_type,
                title=doc.title,
                date=date_label,
                applied_value=round(applied_value, 2),
                applied_unit="일",
                status=doc.status,
                vacation_type=vacation_type
            ))

        elif doc.doc_type == "EARLY_LEAVE":
            leave_type = content.get("type", "조퇴")
            # 🚨 타임존 찌꺼기 방어
            raw_date = content.get("date")
            date_label = str(raw_date).split('T')[0] if raw_date else raw_date
            
            applied_value = 0.0

            leave_time_str = content.get("leave_time") or content.get("time")
            return_time_str = content.get("return_time") or content.get("end_time")

            try:
                if leave_type in ("외출", "Outing") and return_time_str:
                    # 외출: return_time - leave_time
                    m_leave = _to_minutes(leave_time_str) if leave_time_str else 0
                    m_return = _to_minutes(return_time_str)
                    delta = m_return - m_leave
                    if delta < 0:
                        delta += 1440  # 날짜 경계 처리
                    applied_value = round(delta / 60.0, 2)
                else:
                    # 조퇴: leave_time ~ work_end_time
                    if leave_time_str:
                        m_leave = _to_minutes(leave_time_str)
                        delta = work_end_minutes - m_leave
                        if delta > 0:
                            applied_value = round(delta / 60.0, 2)
                            
                # 년도 필터 확인
                raw_pure = str(raw_date).split('T')[0] if raw_date else str(now_kst().date())
                check_date = date.fromisoformat(raw_pure)
                if check_date.year != year:
                    continue
            except (ValueError, TypeError, AttributeError):
                applied_value = 0.0

            total_leave_outing_hours += applied_value
            document_items.append(AttendanceDocItem(
                id=doc.id,
                doc_type=doc.doc_type,
                title=doc.title,
                date=date_label,
                applied_value=applied_value,
                applied_unit="시간",
                status=doc.status,
            ))

        elif doc.doc_type == "OVERTIME":
            raw_date = content.get("date")
            date_label = str(raw_date).split('T')[0] if raw_date else raw_date
            start_time_str = content.get("start_time")
            end_time_str = content.get("end_time")
            applied_value = 0.0

            try:
                if start_time_str and end_time_str:
                    m_start = _to_minutes(start_time_str)
                    m_end = _to_minutes(end_time_str)
                    delta = m_end - m_start
                    if delta < 0:
                        delta += 1440  # 자정 넘어가는 경우
                    applied_value = round(delta / 60.0, 2)
                    
                # 년도 필터 확인
                raw_pure = str(raw_date).split('T')[0] if raw_date else str(now_kst().date())
                check_date = date.fromisoformat(raw_pure)
                if check_date.year != year:
                    continue
            except (ValueError, TypeError, AttributeError):
                applied_value = 0.0

            total_overtime_hours += applied_value
            document_items.append(AttendanceDocItem(
                id=doc.id,
                doc_type=doc.doc_type,
                title=doc.title,
                date=date_label,
                applied_value=applied_value,
                applied_unit="시간",
                status=doc.status,
            ))

    # [FIXED] Single Source of Truth:
    # used_leave_hours = ONLY actual approved doc usage (휴가일수*8 + 외출/조퇴 시간)
    # adjustment_days is applied SEPARATELY when computing remaining_days
    # This prevents double-counting in get_annual_leave_history which adds adjustment_days separately.
    leave_record.used_leave_hours = float(total_vacation_days * 8.0 + total_leave_outing_hours)
    leave_record.sick_leave_days = float(total_sick_leave_days)
    leave_record.event_leave_days = float(total_event_leave_days)
    db.add(leave_record)
    await db.commit()
    await db.refresh(leave_record)

    # [FIXED] total_annual_days = strictly base_days (Company Policy)
    # [FIXED] remaining = base + adjustment - (used / 8)
    total_annual = leave_record.base_days
    adj_days = leave_record.adjustment_days or 0.0
    remaining = total_annual + adj_days - (leave_record.used_leave_hours / 8.0)

    return AttendanceSummaryResponse(
        year=year,
        user_id=target_id,
        user_name=target_staff.name,
        total_vacation_days=total_vacation_days,
        total_sick_leave_days=total_sick_leave_days,
        total_event_leave_days=total_event_leave_days,
        total_leave_outing_hours=total_leave_outing_hours,
        total_overtime_hours=total_overtime_hours,
        total_annual_days=round(total_annual, 2),   # Only base_days
        remaining_annual_days=round(remaining, 2),
        documents=document_items
    )


@router.post("/attendance/clock-in")
async def clock_in(
    data: AttendanceClockInUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    now = datetime.now(KST).replace(tzinfo=None)
    today = now.date()

    # 1. 원시 로그 기록
    new_log = AttendanceLog(
        staff_id=data.staff_id,
        log_time=now,
        log_type=AttendanceLogType.MANUAL_IN
    )
    db.add(new_log)

    # 2. 회사 설정 조회 (출근 시간 및 유예 시간)
    comp_res = await db.execute(select(Company))
    company = comp_res.scalars().first()
    
    grace_start = 0
    work_start_time = time_type(8, 30)
    if company:
        grace_start = company.grace_period_start_mins or 0
        if company.work_start_time:
            work_start_time = company.work_start_time

    # 3. 출근 상태 판별
    # 지각 기준: 출근시간 + 유예시간
    work_start_dt = datetime.combine(today, work_start_time)
    late_threshold = work_start_dt + timedelta(minutes=grace_start)
    
    status = AttendanceStatus.NORMAL
    if now > late_threshold:
        status = AttendanceStatus.LATE

    # 4. 근태 기록 업데이트 또는 생성
    record_res = await db.execute(
        select(EmployeeTimeRecord).where(
            EmployeeTimeRecord.staff_id == data.staff_id,
            EmployeeTimeRecord.record_date == today
        )
    )
    record = record_res.scalar_one_or_none()

    if not record:
        record = EmployeeTimeRecord(
            staff_id=data.staff_id,
            record_date=today,
            category="NORMAL", # 기본값
            clock_in_time=now,
            attendance_status=status,
            record_source="MANUAL"
        )
        db.add(record)
    else:
        # 이미 기록이 있는 경우 (예: 연차 등), 출근 시간과 상태만 업데이트할지 정책 필요
        # 여기서는 중복 출근 시 최초 시간 유지 또는 업데이트 등 선택. 요청대로 업데이트.
        if not record.clock_in_time:
            record.clock_in_time = now
            record.attendance_status = status
            record.record_source = "MANUAL"

    await db.commit()

    # SSE 브로드캐스트: 출근 기록 후 직원 및 관리자 화면 즈시 갱신
    if sse_broadcaster:
        import json as _json
        await sse_broadcaster.broadcast(
            "attendance_updated",
            _json.dumps({"type": "clock_in", "staff_id": data.staff_id})
        )

    # 푸시 알림: 등록 성공 알림
    asyncio.create_task(send_push_notification(
        user_id=data.staff_id,
        title="출근 완료",
        body=f"{now.strftime('%H:%M')} 출근 기록이 성공적으로 등록되었습니다.",
        url="/attendance"
    ))

    return {"message": "Clock-in recorded", "status": status, "time": now}


@router.post("/attendance/clock-out")
async def clock_out(
    data: AttendanceClockOutUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    now = datetime.now(KST).replace(tzinfo=None)
    today = now.date()

    # 1. 원시 로그 기록
    new_log = AttendanceLog(
        staff_id=data.staff_id,
        log_time=now,
        log_type=AttendanceLogType.MANUAL_OUT
    )
    db.add(new_log)

    # 2. 회사 설정 조회 (퇴근 시간 및 유예 시간)
    comp_res = await db.execute(select(Company))
    company = comp_res.scalars().first()
    
    grace_end = 0
    work_end_time = time_type(17, 30)
    if company:
        grace_end = company.grace_period_end_mins or 0
        if company.work_end_time:
            work_end_time = company.work_end_time

    # 3. 조퇴 상태 판별
    # 조퇴 기준: 퇴근시간 - 유예시간 보다 일찍 나가는 경우
    work_end_dt = datetime.combine(today, work_end_time)
    early_leave_threshold = work_end_dt - timedelta(minutes=grace_end)
    
    is_early = now < early_leave_threshold

    # 4. 근태 기록 업데이트
    record_res = await db.execute(
        select(EmployeeTimeRecord).where(
            EmployeeTimeRecord.staff_id == data.staff_id,
            EmployeeTimeRecord.record_date == today
        )
    )
    record = record_res.scalar_one_or_none()

    status_updated = False
    if record:
        record.clock_out_time = now
        # 이미 지각인 경우 조퇴로 덮어쓰지 않거나, 복합 상태 고민 필요. 
        # 여기서는 요청에 따라 조퇴 판별.
        if is_early:
            record.attendance_status = AttendanceStatus.EARLY_LEAVE
            status_updated = True
        record.record_source = "MANUAL"
    else:
        # 출근 기록 없이 퇴근만 하는 경우
        record = EmployeeTimeRecord(
            staff_id=data.staff_id,
            record_date=today,
            category="NORMAL",
            clock_out_time=now,
            attendance_status=AttendanceStatus.EARLY_LEAVE if is_early else AttendanceStatus.NORMAL,
            record_source="MANUAL"
        )
        db.add(record)
        status_updated = True

    await db.commit()

    # SSE 브로드캐스트: 퇴근 기록 후 직원 및 관리자 화면 즈시 갱신
    if sse_broadcaster:
        import json as _json
        await sse_broadcaster.broadcast(
            "attendance_updated",
            _json.dumps({"type": "clock_out", "staff_id": data.staff_id})
        )

    # 푸시 알림: 등록 성공 알림
    asyncio.create_task(send_push_notification(
        user_id=data.staff_id,
        title="퇴근 완료",
        body=f"{now.strftime('%H:%M')} 퇴근 기록이{' (조퇴)' if is_early else ''} 성공적으로 등록되었습니다. 고생하셨습니다!",
        url="/attendance"
    ))

    return {"message": "Clock-out recorded", "is_early_leave": is_early, "time": now}


@router.get("/attendance/{staff_id}/monthly", response_model=AttendanceMonthlyResponse)
async def get_monthly_attendance(
    staff_id: int,
    year: int = Query(..., description="조회 연도"),
    month: int = Query(..., description="조회 월"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    """관리자용 월별 근태 조회"""
    if current_user.user_type != "ADMIN" and current_user.id != staff_id:
        raise HTTPException(status_code=403, detail="조회 권한이 없습니다.")

    # 대상 사원 정보 조회
    staff_res = await db.execute(select(Staff).where(Staff.id == staff_id))
    target_staff = staff_res.scalar_one_or_none()
    if not target_staff:
        raise HTTPException(status_code=404, detail="사원을 찾을 수 없습니다.")

    # 해당 월의 시작일과 종료일 계산
    import calendar
    _, last_day = calendar.monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    # [Ghost-proof] 결재 카테고리 목록 - NULL approval_id 또는 소프트 삭제된 결재 연결 기록 제외
    APPROVAL_CATEGORIES = ["ANNUAL", "HALF_DAY", "SICK", "EARLY_LEAVE", "OUTING", "EVENT_LEAVE"]
    from sqlalchemy import or_ as sa_or, and_ as sa_and, not_ as sa_not
    from sqlalchemy import delete as sa_delete

    # =====================================================================
    # [HARD DELETE] 유령 데이터 영구 삭제 - 조회 전에 DB에서 완전히 제거
    # 조건: 결재 카테고리인데 (1) approval_id가 NULL이거나
    #        (2) 연결된 approval_doc이 소프트 삭제(deleted_at IS NOT NULL)된 것
    # =====================================================================
    deleted_approval_ids_subq = (
        select(ApprovalDocument.id)
        .where(ApprovalDocument.deleted_at != None)  # noqa: E711
        .scalar_subquery()
    )

    await db.execute(
        sa_delete(EmployeeTimeRecord).where(
            EmployeeTimeRecord.staff_id == staff_id,
            EmployeeTimeRecord.category.in_(APPROVAL_CATEGORIES),
            sa_or(
                EmployeeTimeRecord.approval_id == None,  # noqa: E711
                EmployeeTimeRecord.approval_id.in_(deleted_approval_ids_subq)
            )
        )
    )
    await db.commit()

    # 근태 기록 조회 (유령 데이터는 위 DELETE 단계에서 이미 제거됨)
    records_res = await db.execute(
        select(EmployeeTimeRecord)
        .where(
            EmployeeTimeRecord.staff_id == staff_id,
            EmployeeTimeRecord.record_date >= start_date,
            EmployeeTimeRecord.record_date <= end_date,
        )
        .order_by(EmployeeTimeRecord.record_date.asc())
    )
    records = records_res.scalars().all()


    # 해당 월의 승인된 결재 문서 조회 (VACATION, EARLY_LEAVE, OVERTIME, LEAVE_REQUEST) - 소프트 삭제 제외
    TARGET_TYPES = ["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]
    search_start = datetime.combine(start_date - timedelta(days=7), time_type.min)
    search_end = datetime.combine(end_date + timedelta(days=7), time_type.max)

    docs_res = await db.execute(
        select(ApprovalDocument).where(
            ApprovalDocument.author_id == staff_id,
            ApprovalDocument.doc_type.in_(TARGET_TYPES),
            ApprovalDocument.status == ApprovalStatus.COMPLETED,
            ApprovalDocument.deleted_at == None,  # noqa: E711
        )
    )
    docs = docs_res.scalars().all()
    
    approval_items = []
    
    # 회사 근무 종료 시간 (조퇴 계산용)
    comp_res = await db.execute(select(Company))
    company = comp_res.scalars().first()
    work_end_minutes = 17 * 60 + 30
    if company and company.work_end_time:
        if isinstance(company.work_end_time, str):
            work_end_minutes = _to_minutes(company.work_end_time)
        elif isinstance(company.work_end_time, time_type):
            work_end_minutes = _time_obj_to_minutes(company.work_end_time)

    for doc in docs:
        content = doc.content or {}
        doc_date_str = None
        applied_value = 0.0
        applied_unit = "일"

        if doc.doc_type in ["VACATION", "LEAVE_REQUEST"]:
            s_str = content.get("start_date")
            e_str = content.get("end_date") or s_str
            if not s_str: continue
            
            try:
                s_date = date.fromisoformat(str(s_str).split('T')[0])
                e_date = date.fromisoformat(str(e_str).split('T')[0]) if e_str else s_date
                
                # 해당 월에 하루라도 걸쳐 있는지 확인
                if not (s_date <= end_date and e_date >= start_date):
                    continue
                
                s_pure = str(s_str).split('T')[0]
                e_pure = str(e_str).split('T')[0] if e_str else s_pure
                doc_date_str = f"{s_pure} ~ {e_pure}" if s_pure != e_pure else s_pure
                v_type = content.get("vacation_type", "")
                if "반차" in v_type:
                    applied_value = 0.5
                else:
                    applied_value = float(_business_days_between(s_date, e_date))
            except: continue

        elif doc.doc_type == "EARLY_LEAVE":
            d_str = content.get("date")
            if not d_str: continue
            try:
                d_date = date.fromisoformat(str(d_str).split('T')[0])
                if not (start_date <= d_date <= end_date): continue
                doc_date_str = str(d_str).split('T')[0]
                applied_unit = "시간"
                
                t_str = content.get("leave_time") or content.get("time")
                ret_str = content.get("return_time") or content.get("end_time")
                
                if (content.get("type") in ("외출", "Outing")) and ret_str:
                    m1 = _to_minutes(t_str)
                    m2 = _to_minutes(ret_str)
                    applied_value = round((m2 - m1) / 60.0, 2)
                elif t_str:
                    m1 = _to_minutes(t_str)
                    applied_value = round((work_end_minutes - m1) / 60.0, 2)
            except: continue

        elif doc.doc_type == "OVERTIME":
            d_str = content.get("date")
            if not d_str: continue
            try:
                d_date = date.fromisoformat(str(d_str).split('T')[0])
                if not (start_date <= d_date <= end_date): continue
                doc_date_str = str(d_str).split('T')[0]
                applied_unit = "시간"
                
                s_t = content.get("start_time")
                e_t = content.get("end_time")
                if s_t and e_t:
                    m1 = _to_minutes(s_t)
                    m2 = _to_minutes(e_t)
                    delta = m2 - m1
                    if delta < 0: delta += 1440
                    applied_value = round(delta / 60.0, 2)
            except: continue

        if doc_date_str:
            approval_items.append(AttendanceDocItem(
                id=doc.id,
                doc_type=doc.doc_type,
                title=doc.title,
                date=doc_date_str,
                applied_value=applied_value,
                applied_unit=applied_unit,
                status=doc.status
            ))

    return AttendanceMonthlyResponse(
        staff_id=staff_id,
        staff_name=target_staff.name,
        year=year,
        month=month,
        records=records,
        approval_items=approval_items
    )


@router.put("/attendance/records/{record_id}", response_model=EmployeeTimeRecordResponse)
async def update_attendance_record(
    record_id: int,
    data: EmployeeTimeRecordUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    """관리자용 근태 기록 수동 수정"""
    if current_user.user_type != "ADMIN":
        raise HTTPException(status_code=403, detail="관리자만 수정 가능합니다.")

    res = await db.execute(select(EmployeeTimeRecord).where(EmployeeTimeRecord.id == record_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")

    if data.clock_in_time is not None:
        record.clock_in_time = data.clock_in_time
    if data.clock_out_time is not None:
        record.clock_out_time = data.clock_out_time
    if data.attendance_status is not None:
        record.attendance_status = data.attendance_status
    if data.category is not None:
        record.category = data.category
    
    record.record_source = "ADMIN_MODIFIED"
    
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/annual-leave/{staff_id}", response_model=AnnualLeaveHistoryResponse)
async def get_annual_leave_history(
    staff_id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    """사원별 최근 3년 연차 내역 조회"""
    if current_user.user_type != "ADMIN" and current_user.id != staff_id:
        raise HTTPException(status_code=403, detail="조회 권한이 없습니다.")
    
    current_year = now_kst().year
    years = [current_year, current_year - 1, current_year - 2, current_year - 3]
    
    history_records = []
    for year in years:
        # Sync usage for the year (to ensure it's up to date)
        await sync_annual_leave_usage(db, staff_id, year)
        record = await get_or_create_annual_leave(db, staff_id, year)
        history_records.append(record)
    
    # 잔여 연차 계산 포함하여 반환
    resp_leaves = []
    for r in history_records:
        remaining = r.base_days + r.adjustment_days - (r.used_leave_hours / 8.0)
        resp_leaves.append(EmployeeAnnualLeaveResponse(
            id=r.id,
            staff_id=r.staff_id,
            year=r.year,
            base_days=r.base_days,
            adjustment_days=r.adjustment_days,
            used_leave_hours=r.used_leave_hours,
            sick_leave_days=r.sick_leave_days,
            event_leave_days=r.event_leave_days,
            remaining_days=round(remaining, 2)
        ))
        
    return AnnualLeaveHistoryResponse(staff_id=staff_id, leaves=resp_leaves)


async def sync_annual_leave_usage(db: AsyncSession, staff_id: int, year: int):
    """전자결재 COMPLETED 문서를 순회하여 연차 사용량을 테이블에 동기화합니다."""
    from sqlalchemy import delete as sa_delete, or_, and_

    year_start = datetime(year, 1, 1)
    year_end = datetime(year, 12, 31, 23, 59, 59)

    # === [Hard Cleanup] 유령 데이터(Zombie Data) 강제 삭제 ===
    # 결재 문서와 연결된 카테고리 목록 (결재로 생성되는 근태 기록만 대상으로)
    approval_categories = ["ANNUAL", "HALF_DAY", "SICK", "EARLY_LEAVE", "OUTING", "EVENT_LEAVE"]

    # 1) approval_id가 NULL인 유령 기록 삭제
    await db.execute(
        sa_delete(EmployeeTimeRecord).where(
            EmployeeTimeRecord.staff_id == staff_id,
            EmployeeTimeRecord.category.in_(approval_categories),
            EmployeeTimeRecord.record_date >= year_start.date(),
            EmployeeTimeRecord.record_date <= year_end.date(),
            EmployeeTimeRecord.approval_id == None,  # noqa: E711
        )
    )

    # 2) 연결된 결재 문서가 소프트 삭제된 경우도 삭제
    deleted_doc_subq = (
        select(ApprovalDocument.id).where(
            ApprovalDocument.deleted_at != None,  # noqa: E711
        ).scalar_subquery()
    )
    await db.execute(
        sa_delete(EmployeeTimeRecord).where(
            EmployeeTimeRecord.staff_id == staff_id,
            EmployeeTimeRecord.category.in_(approval_categories),
            EmployeeTimeRecord.record_date >= year_start.date(),
            EmployeeTimeRecord.record_date <= year_end.date(),
            EmployeeTimeRecord.approval_id.in_(deleted_doc_subq),
        )
    )
    await db.commit()
    # === [End Cleanup] ===

    docs_res = await db.execute(
        select(ApprovalDocument).where(
            ApprovalDocument.author_id == staff_id,
            ApprovalDocument.doc_type.in_(["VACATION", "EARLY_LEAVE", "LEAVE_REQUEST"]),
            ApprovalDocument.status == ApprovalStatus.COMPLETED,
            ApprovalDocument.deleted_at == None,  # [Fix] Explicitly filter out soft-deleted documents
        )
    )
    docs = docs_res.scalars().all()
    
    # 회사 근무 종료 시간 (조퇴 계산용)
    comp_res = await db.execute(select(Company))
    company = comp_res.scalars().first()
    work_end_minutes = 17 * 60 + 30
    if company and company.work_end_time:
        if isinstance(company.work_end_time, str):
            work_end_minutes = _to_minutes(company.work_end_time)
        elif isinstance(company.work_end_time, time_type):
            work_end_minutes = _time_obj_to_minutes(company.work_end_time)

    v_days = 0.0
    s_days = 0.0
    e_days = 0.0
    o_hours = 0.0
    
    for doc in docs:
        content = doc.content or {}
        if doc.doc_type in ["VACATION", "LEAVE_REQUEST"]:
            v_type = content.get("vacation_type", "연차")
            val = 0.0
            
            try:
                s_date = date.fromisoformat(str(content.get("start_date")).split('T')[0])
                raw_end = content.get("end_date") or content.get("start_date")
                e_date = date.fromisoformat(str(raw_end).split('T')[0])
                
                # 년도 필터 확인
                if s_date.year != year and e_date.year != year:
                    continue
                    
                if "반차" in v_type:
                    val = 0.5
                else:
                    val = float(_business_days_between(s_date, e_date))
            except: val = 1.0
            
            if v_type == "병가": s_days += val
            elif v_type == "경조휴가": e_days += val
            else: v_days += val
            
        elif doc.doc_type == "EARLY_LEAVE":
            try:
                raw_date = content.get("date")
                if raw_date:
                    d_date = date.fromisoformat(str(raw_date).split('T')[0])
                    if d_date.year != year:
                        continue
                        
                t_str = content.get("leave_time") or content.get("time")
                ret_str = content.get("return_time") or content.get("end_time")
                if content.get("type") in ("외출", "Outing") and ret_str:
                    m1 = _to_minutes(t_str)
                    m2 = _to_minutes(ret_str)
                    o_hours += round((m2 - m1) / 60.0, 2)
                elif t_str:
                    m1 = _to_minutes(t_str)
                    o_hours += round((work_end_minutes - m1) / 60.0, 2)
            except: pass
            
    record = await get_or_create_annual_leave(db, staff_id, year)
    
    # [FIXED] Recalculate base_days during sync to reflect new policy for existing records
    res_s = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = res_s.scalar_one_or_none()
    if staff:
        record.base_days = calculate_base_days(staff.join_date, year)

    # [FIXED] used_leave_hours = ONLY actual approval-doc-based usage (no adjustment inside)
    # adjustment_days is applied separately in all remaining_days calculations
    record.used_leave_hours = float(v_days * 8.0 + o_hours)
    record.sick_leave_days = float(s_days)
    record.event_leave_days = float(e_days)
    db.add(record)
    await db.commit()


async def get_or_create_annual_leave(db: AsyncSession, staff_id: int, year: int) -> EmployeeAnnualLeave:
    """연차 레코드 조회 또는 자동 생성 (근로기준법 로직 포함)"""
    res = await db.execute(
        select(EmployeeAnnualLeave).where(
            EmployeeAnnualLeave.staff_id == staff_id,
            EmployeeAnnualLeave.year == year
        )
    )
    record = res.scalar_one_or_none()
    
    if not record:
        res_s = await db.execute(select(Staff).where(Staff.id == staff_id))
        staff = res_s.scalar_one_or_none()
        if not staff:
            raise ValueError(f"Staff id {staff_id} not found")
            
        base = calculate_base_days(staff.join_date, year)
        record = EmployeeAnnualLeave(
            staff_id=staff_id,
            year=year,
            base_days=base,
            adjustment_days=0.0,
            used_leave_hours=0.0,
            sick_leave_days=0.0,
            event_leave_days=0.0
        )
        db.add(record)
        await db.flush()
    return record


@router.put("/annual-leave/{record_id}", response_model=EmployeeAnnualLeaveResponse)
async def update_annual_leave(
    record_id: int,
    data: AnnualLeaveUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    """관리자용 연차 내역 수동 수정 (마이그레이션용)"""
    if current_user.user_type != "ADMIN":
        raise HTTPException(status_code=403, detail="관리자만 수정 가능합니다.")
        
    res = await db.execute(select(EmployeeAnnualLeave).where(EmployeeAnnualLeave.id == record_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="내역을 찾을 수 없습니다.")
        
    if data.adjustment_days is not None:
        record.adjustment_days = float(data.adjustment_days)
    if data.used_leave_hours is not None:
        record.used_leave_hours = float(data.used_leave_hours)
    if data.sick_leave_days is not None:
        record.sick_leave_days = float(data.sick_leave_days)
    if data.event_leave_days is not None:
        record.event_leave_days = float(data.event_leave_days)
        
    await db.commit()
    await db.refresh(record)
    
    remaining = record.base_days + (record.adjustment_days or 0.0) - (record.used_leave_hours / 8.0)
    return EmployeeAnnualLeaveResponse(
        id=record.id,
        staff_id=record.staff_id,
        year=record.year,
        base_days=record.base_days,
        adjustment_days=record.adjustment_days,
        used_leave_hours=record.used_leave_hours,
        sick_leave_days=record.sick_leave_days,
        event_leave_days=record.event_leave_days,
        remaining_days=round(remaining, 2)
    )


@router.post("/sync-annual-leave/{staff_id}")
async def trigger_sync_annual_leave(
    staff_id: int,
    year: Optional[int] = Query(None, description="동기화할 연도 (기본: 올해)"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    """관리자가 특정 사원의 연차 데이터를 강제로 재계산/동기화하는 API"""
    if current_user.user_type != "ADMIN" and current_user.id != staff_id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    from datetime import date as _date
    target_year = year or _date.today().year
    await sync_annual_leave_usage(db, staff_id, target_year)
    return {"status": "ok", "staff_id": staff_id, "year": target_year, "message": "연차 데이터가 재동기화되었습니다."}
