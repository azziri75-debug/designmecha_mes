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
    adjustment_days = Column(Float, default=0.0)
    used_leave_hours = Column(Float, default=0.0)
    sick_leave_days = Column(Float, default=0.0)
    event_leave_days = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=now_kst)
    updated_at = Column(DateTime, default=now_kst, onupdate=now_kst)

    staff = relationship("Staff")
