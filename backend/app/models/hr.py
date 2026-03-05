from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Date, DateTime, Text, Float, Enum, func
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum

class AttendanceLogType(str, enum.Enum):
    MANUAL_IN = "MANUAL_IN"
    MANUAL_OUT = "MANUAL_OUT"
    WIFI_DETECTED = "WIFI_DETECTED"

class AttendanceStatus(str, enum.Enum):
    NORMAL = "NORMAL"
    LATE = "LATE"
    EARLY_LEAVE = "EARLY_LEAVE"
    ABSENT = "ABSENT"

class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=True) # 직책
    main_duty = Column(String, nullable=True) # 주업무 (생산, 관리 등)
    phone = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    user_type = Column(String, default="USER") # ADMIN or USER
    password = Column(String, nullable=True) # Login password
    menu_permissions = Column(JSON, default=[]) # List of allowed menu keys
    stamp_image = Column(JSON, nullable=True) # {name, url}
    
    # Wi-Fi attendance tracking
    mac_address = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)

class AttendanceLog(Base):
    """수동/자동 원시 데이터 기록"""
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    log_time = Column(DateTime, default=func.now(), nullable=False)
    log_type = Column(Enum(AttendanceLogType), nullable=False)
    
    staff = relationship("Staff")

class EmployeeTimeRecord(Base):
    """사원 근태/HR 기록 (전자결재 승인 시 자동 생성 및 수동 관리)"""
    __tablename__ = "employee_time_records"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False)
    
    record_date = Column(Date, nullable=False, index=True)
    category = Column(String, nullable=False, index=True) # ANNUAL, HALF_DAY, SICK, EARLY_LEAVE, OUTING, OVERTIME, SPECIAL
    
    content = Column(Text, nullable=True) # 상세 내용 (반차-오전/오후, 조퇴 시간 등)
    status = Column(String, default="APPROVED") # APPROVED, PENDING, REJECTED
    
    # 세분화된 시간 기록 (Labor Standards Act)
    hours = Column(Float, default=0.0)
    extension_hours = Column(Float, default=0.0)
    night_hours = Column(Float, default=0.0)
    holiday_hours = Column(Float, default=0.0)
    holiday_night_hours = Column(Float, default=0.0)
    
    # 추가된 필드들
    clock_in_time = Column(DateTime, nullable=True)
    clock_out_time = Column(DateTime, nullable=True)
    record_source = Column(String, nullable=True) # e.g., 'WIFI', 'MANUAL'
    attendance_status = Column(Enum(AttendanceStatus), default=AttendanceStatus.NORMAL)

    # 가시성을 위한 작성자 연계 (전자결재 연동 시 결재 상신자)
    author_id = Column(Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime, default=func.now())

    staff = relationship("Staff", foreign_keys=[staff_id])
    author = relationship("Staff", foreign_keys=[author_id])
