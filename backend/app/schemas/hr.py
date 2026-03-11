from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime


class AttendanceDocItem(BaseModel):
    """집계에 사용된 개별 결재 문서 요약"""
    id: int
    doc_type: str          # VACATION, EARLY_LEAVE, OVERTIME
    title: str
    date: Optional[str]    # 문서 날짜 (content 내 date / start_date)
    applied_value: float   # 계산된 값 (일수 또는 시간)
    applied_unit: str      # "일" 또는 "시간"
    status: str            # COMPLETED 등
    vacation_type: Optional[str] = None  # 연차, 병가, 경조휴가 등 (VACATION 인 경우)


class AttendanceSummaryResponse(BaseModel):
    """근태 집계 응답"""
    year: int
    user_id: int
    user_name: Optional[str] = None

    total_vacation_days: float       # 연간 누적 휴가 사용 일수
    total_sick_leave_days: float     # 누적 병가 일수
    total_event_leave_days: float    # 누적 경조사 일수
    total_leave_outing_hours: float  # 누적 조퇴/외출 시간
    total_overtime_hours: float      # 누적 야근/특근 시간

    documents: List[AttendanceDocItem]  # 집계 근거 문서 리스트


class AttendanceLogBase(BaseModel):
    staff_id: int
    log_time: datetime
    log_type: str

class AttendanceLogResponse(AttendanceLogBase):
    id: int
    class Config:
        from_attributes = True


class EmployeeTimeRecordBase(BaseModel):
    staff_id: int
    record_date: date
    category: str
    content: Optional[str] = None
    status: Optional[str] = "APPROVED"
    author_id: Optional[int] = None

class EmployeeTimeRecordResponse(EmployeeTimeRecordBase):
    id: int
    created_at: datetime
    staff_name: Optional[str] = None
    
    hours: Optional[float] = 0.0
    extension_hours: Optional[float] = 0.0
    night_hours: Optional[float] = 0.0
    holiday_hours: Optional[float] = 0.0
    holiday_night_hours: Optional[float] = 0.0

    # New fields
    clock_in_time: Optional[datetime] = None
    clock_out_time: Optional[datetime] = None
    record_source: Optional[str] = None
    attendance_status: Optional[str] = "NORMAL"

    class Config:
        from_attributes = True


class AttendanceClockInUpdate(BaseModel):
    staff_id: int
    # log_time is current server time in API

class AttendanceClockOutUpdate(BaseModel):
    staff_id: int

class MonthlyAttendanceRecord(BaseModel):
    date: date
    clock_in: Optional[datetime] = None
    clock_out: Optional[datetime] = None
    status: str
    record_source: Optional[str] = None

class AttendanceMonthlyResponse(BaseModel):
    staff_id: int
    staff_name: str
    year: int
    month: int
    records: List[EmployeeTimeRecordResponse]
    approval_items: List[AttendanceDocItem] = []


class EmployeeTimeRecordUpdate(BaseModel):
    clock_in_time: Optional[datetime] = None
    clock_out_time: Optional[datetime] = None
    attendance_status: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None


class EmployeeAnnualLeaveBase(BaseModel):
    staff_id: int
    year: int
    base_days: float
    adjustment_days: float
    used_leave_hours: float
    sick_leave_days: float
    event_leave_days: float

class EmployeeAnnualLeaveResponse(EmployeeAnnualLeaveBase):
    id: int
    remaining_days: float
    
    class Config:
        from_attributes = True

class AnnualLeaveHistoryResponse(BaseModel):
    staff_id: int
    leaves: List[EmployeeAnnualLeaveResponse]

class AnnualLeaveUpdate(BaseModel):
    adjustment_days: Optional[float] = None
    used_leave_hours: Optional[float] = None
    sick_leave_days: Optional[float] = None
    event_leave_days: Optional[float] = None


