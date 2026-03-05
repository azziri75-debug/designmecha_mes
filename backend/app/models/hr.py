from sqlalchemy import Column, Integer, String, ForeignKey, Enum, DateTime, func
from sqlalchemy.orm import relationship
from app.db.base import Base
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
    log_time = Column(DateTime, default=func.now(), nullable=False)
    log_type = Column(Enum(AttendanceLogType), nullable=False)
    
    staff = relationship("Staff")
