from pydantic import BaseModel
from typing import List, Optional


class AttendanceDocItem(BaseModel):
    """집계에 사용된 개별 결재 문서 요약"""
    id: int
    doc_type: str          # VACATION, EARLY_LEAVE, OVERTIME
    title: str
    date: Optional[str]    # 문서 날짜 (content 내 date / start_date)
    applied_value: float   # 계산된 값 (일수 또는 시간)
    applied_unit: str      # "일" 또는 "시간"
    status: str            # COMPLETED 등


class AttendanceSummaryResponse(BaseModel):
    """근태 집계 응답"""
    year: int
    user_id: int
    user_name: Optional[str] = None

    total_vacation_days: float       # 연간 누적 휴가 사용 일수
    total_leave_outing_hours: float  # 누적 조퇴/외출 시간
    total_overtime_hours: float      # 누적 야근/특근 시간

    documents: List[AttendanceDocItem]  # 집계 근거 문서 리스트
