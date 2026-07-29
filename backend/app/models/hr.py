from sqlalchemy import Column, Integer, String, ForeignKey, Enum, DateTime, func, Float
from sqlalchemy.orm import relationship
from app.db.base import Base
from app.core.timezone import now_kst
import enum

class AttendanceLogType(str, enum.Enum):
    MANUAL_IN = "MANUAL_IN"
    MANUAL_OUT = "MANUAL_OUT"
    WIFI_DETECTED = "WIFI_DETECTED"

class AttendanceLog(Base):
    """수동/자동 원시 데이터 기록"""
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    log_time = Column(DateTime, default=now_kst, nullable=False)
    log_type = Column(Enum(AttendanceLogType), nullable=False)
    
    staff = relationship("Staff")

class EmployeeAnnualLeave(Base):
    """사원별 연차 내역 관리"""
    __tablename__ = "employee_annual_leaves"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)
    base_days = Column(Float, default=0.0)
    adjustment_days = Column(Float, default=0.0)   # 관리자 조정 (포상+, 차감-, 도입전 사용분은 음수 입력)
    prior_used_hours = Column(Float, default=0.0)  # [NEW] 시스템 도입 전 수기 입력 사용 시간 (sync에 의해 덮어씌워지지 않음)
    used_leave_hours = Column(Float, default=0.0)  # 전자결재 기반 실사용 시간 (sync로 자동 갱신)
    sick_leave_days = Column(Float, default=0.0)
    event_leave_days = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=now_kst)
    updated_at = Column(DateTime, default=now_kst, onupdate=now_kst)

    staff = relationship("Staff")
