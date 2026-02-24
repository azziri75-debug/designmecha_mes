from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON
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

class Equipment(Base):
    """공정 장비 (Master Data)"""
    __tablename__ = "equipments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    code = Column(String, unique=True, index=True) # 장비 코드
    spec = Column(String, nullable=True) # 사양/모델명
    process_id = Column(Integer, ForeignKey("processes.id"), nullable=True) # 주 공정
    
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

