from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Date, DateTime, Text, Float, Time, Enum, func
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum

class PartnerType(str, enum.Enum):
    CUSTOMER = "CUSTOMER"  # 매출처
    SUPPLIER = "SUPPLIER"  # 매입처
    SUBCONTRACTOR = "SUBCONTRACTOR" # 외주처
    BOTH = "BOTH"

class Partner(Base):
    __tablename__ = "partners"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    partner_type = Column(JSON, default=["CUSTOMER"]) # JSON list of strings
    registration_number = Column(String, nullable=True) # 사업자등록번호
    representative = Column(String, nullable=True) # 대표자
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    description = Column(String, nullable=True) # 비고
    attachment_file = Column(JSON, nullable=True) # List of {name, url} objects
    
    contacts = relationship("Contact", back_populates="partner", lazy="selectin", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="partner")
    purchase_orders = relationship("PurchaseOrder", back_populates="partner")
    outsourcing_orders = relationship("OutsourcingOrder", back_populates="partner")

class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    partner_id = Column(Integer, ForeignKey("partners.id"))
    name = Column(String, nullable=False)
    position = Column(String, nullable=True) # 직위
    phone = Column(String, nullable=True)
    mobile = Column(String, nullable=True) # 휴대전화
    email = Column(String, nullable=True)
    
    partner = relationship("Partner", back_populates="contacts", lazy="selectin")


class IgnoredPartnerDuplicate(Base):
    __tablename__ = "ignored_partner_duplicates"

    id = Column(Integer, primary_key=True, index=True)
    partner_id_1 = Column(Integer, ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    partner_id_2 = Column(Integer, ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=func.now())

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    owner_name = Column(String, nullable=True) # 대표자
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    fax = Column(String, nullable=True)
    email = Column(String, nullable=True)
    registration_number = Column(String, nullable=True) # 사업자번호
    logo_image = Column(JSON, nullable=True) # {name, url}
    stamp_image = Column(JSON, nullable=True) # {name, url}
    work_start_time = Column(Time, default="08:30")
    work_end_time = Column(Time, default="17:30")
    grace_period_start_mins = Column(Integer, default=0)
    grace_period_end_mins = Column(Integer, default=0)

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
    user_type = Column(String(20), nullable=False) # 'ADMIN', 'USER'
    is_sysadmin = Column(Boolean, default=False)   # NEW: True if the user is a system administrator
    staff_no = Column(String(50), nullable=True)   # NEW: Employee Number
    
    password = Column(String, nullable=True) # Login password
    menu_permissions = Column(JSON, default=[]) # List of allowed menu keys
    stamp_image = Column(JSON, nullable=True) # {name, url}
    
    login_id = Column(String, unique=True, index=True, nullable=True)
    department = Column(String, nullable=True)
    email = Column(String, nullable=True)
    join_date = Column(Date, nullable=True)
    
    # Wi-Fi attendance tracking
    mac_address = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    
    # Permission Fields
    can_access_external = Column(Boolean, default=False)
    can_view_others = Column(Boolean, default=False)

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
    
    # [Fix] 전자결재 문서와 명시적으로 연결을 위한 컬럼 추가
    approval_id = Column(Integer, ForeignKey("approval_documents.id", ondelete="CASCADE"), nullable=True)
    
    created_at = Column(DateTime, default=func.now())

    staff = relationship("Staff", foreign_keys=[staff_id])
    author = relationship("Staff", foreign_keys=[author_id])
    approval_doc = relationship("ApprovalDocument", foreign_keys=[approval_id])

class Equipment(Base):
    """공정 장비 (Master Data)"""
    __tablename__ = "equipments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    code = Column(String, unique=True, index=True) # 장비 코드
    spec = Column(String, nullable=True) # 사양/모델명
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="SET NULL"), nullable=True) # 주 공정
    
    status = Column(String, default="IDLE") # IDLE, RUNNING, DOWN, REPAIR
    purchase_date = Column(Date, nullable=True)
    location = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    history = relationship("EquipmentHistory", back_populates="equipment", cascade="all, delete-orphan")

class EquipmentHistory(Base):
    """장비 고장 및 수리 이력"""
    __tablename__ = "equipment_histories"

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipments.id"), nullable=False)
    
    history_date = Column(Date, default=func.now())
    history_type = Column(String, nullable=False) # FAILURE, REPAIR, INSPECTION
    
    description = Column(Text, nullable=False) # 상세 내용
    cost = Column(Float, default=0.0) # 비용
    worker_name = Column(String, nullable=True) # 담당자/업체명
    
    attachment_file = Column(JSON, nullable=True) # 증빙 서류/사진 (list of {name, url})
    
    created_at = Column(DateTime, default=func.now())

    equipment = relationship("Equipment", back_populates="history")

class FormTemplate(Base):
    """문서 양식 (견적서, 생산시트 등)"""
    __tablename__ = "form_templates"

    id = Column(Integer, primary_key=True, index=True)
    form_type = Column(String, unique=True, index=True) # ESTIMATE, PRODUCTION_SHEET, PURCHASE_ORDER, OUTSOURCING_ORDER
    name = Column(String, nullable=False)
    
    layout_data = Column(JSON, nullable=False) # 레이아웃/스타일 설정
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, onupdate=func.now())

class MeasuringInstrument(Base):
    """측정기 (계측기) Master Data"""
    __tablename__ = "measuring_instruments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    code = Column(String, unique=True, index=True) # 측정기 식별 번호/코드
    spec = Column(String, nullable=True) # 규격/사양
    serial_number = Column(String, nullable=True) # 기기 일련번호
    
    calibration_cycle_months = Column(Integer, default=12) # 교정 주기(개월)
    next_calibration_date = Column(Date, nullable=True) # 다음 교정 예정일
    
    is_active = Column(Boolean, default=True)

    history = relationship("MeasurementHistory", back_populates="instrument", cascade="all, delete-orphan")

class MeasurementHistory(Base):
    """측정기 교정 및 수리 이력"""
    __tablename__ = "measurement_histories"

    id = Column(Integer, primary_key=True, index=True)
    instrument_id = Column(Integer, ForeignKey("measuring_instruments.id"), nullable=False)
    
    history_date = Column(Date, default=func.now())
    history_type = Column(String, nullable=False) # CALIBRATION, REPAIR, ETC
    
    description = Column(Text, nullable=False) # 상세 내용
    cost = Column(Float, default=0.0) # 비용
    worker_name = Column(String, nullable=True) # 교정/수리 기관 또는 담당자
    
    attachment_file = Column(JSON, nullable=True) # 성적서 등 증빙 파일
    
    created_at = Column(DateTime, default=func.now())

    instrument = relationship("MeasuringInstrument", back_populates="history")


