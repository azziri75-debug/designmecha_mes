from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional
from datetime import date, datetime, timedelta, time as time_type, timezone

from app.api import deps
from app.models.approval import ApprovalDocument, ApprovalStatus
from app.models import Staff, Company, EmployeeTimeRecord, AttendanceLog, AttendanceLogType, AttendanceStatus
from app.schemas.hr import (
    AttendanceSummaryResponse, 
    AttendanceDocItem, 
    AttendanceClockInUpdate, 
    AttendanceClockOutUpdate, 
    AttendanceMonthlyResponse,
    EmployeeTimeRecordUpdate,
    EmployeeTimeRecordResponse
)

KST = timezone(timedelta(hours=9))

router = APIRouter()


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

    # 해당 연도의 COMPLETED 결재 문서 조회 (VACATION, EARLY_LEAVE, OVERTIME)
    TARGET_TYPES = ["VACATION", "EARLY_LEAVE", "OVERTIME"]

    year_start = datetime(year, 1, 1)
    year_end = datetime(year, 12, 31, 23, 59, 59)

    docs_res = await db.execute(
        select(ApprovalDocument).where(
            ApprovalDocument.author_id == target_id,
            ApprovalDocument.doc_type.in_(TARGET_TYPES),
            ApprovalDocument.status == ApprovalStatus.COMPLETED,
            ApprovalDocument.created_at >= year_start,
            ApprovalDocument.created_at <= year_end,
        ).order_by(ApprovalDocument.created_at.desc())
    )
    docs = docs_res.scalars().all()

    total_vacation_days = 0.0
    total_leave_outing_hours = 0.0
    total_overtime_hours = 0.0
    document_items: list[AttendanceDocItem] = []

    for doc in docs:
        content = doc.content or {}

        if doc.doc_type == "VACATION":
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
                        s_date = date.fromisoformat(start_date_str)
                        e_date = date.fromisoformat(end_date_str) if end_date_str else s_date
                        applied_value = float(_business_days_between(s_date, e_date))
                        if end_date_str and end_date_str != start_date_str:
                            date_label = f"{start_date_str} ~ {end_date_str}"
                    except (ValueError, TypeError):
                        applied_value = 1.0

            total_vacation_days += applied_value
            document_items.append(AttendanceDocItem(
                id=doc.id,
                doc_type=doc.doc_type,
                title=doc.title,
                date=date_label,
                applied_value=round(applied_value, 2),
                applied_unit="일",
                status=doc.status,
            ))

        elif doc.doc_type == "EARLY_LEAVE":
            leave_type = content.get("type", "조퇴")
            date_label = content.get("date")
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
            date_label = content.get("date")
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
    
    return AttendanceSummaryResponse(
        year=year,
        user_id=target_id,
        user_name=target_staff.name,
        total_vacation_days=total_vacation_days,
        total_leave_outing_hours=total_leave_outing_hours,
        total_overtime_hours=total_overtime_hours,
        documents=document_items
    )


@router.post("/attendance/clock-in")
async def clock_in(
    data: AttendanceClockInUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    now = datetime.now(KST)
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
    return {"message": "Clock-in recorded", "status": status, "time": now}


@router.post("/attendance/clock-out")
async def clock_out(
    data: AttendanceClockOutUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user),
):
    now = datetime.now(KST)
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

    # 근태 기록 조회
    records_res = await db.execute(
        select(EmployeeTimeRecord)
        .where(
            EmployeeTimeRecord.staff_id == staff_id,
            EmployeeTimeRecord.record_date >= start_date,
            EmployeeTimeRecord.record_date <= end_date
        )
        .order_by(EmployeeTimeRecord.record_date.asc())
    )
    records = records_res.scalars().all()

    return AttendanceMonthlyResponse(
        staff_id=staff_id,
        staff_name=target_staff.name,
        year=year,
        month=month,
        records=records
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

