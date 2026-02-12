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
    
    contacts = relationship("Contact", back_populates="partner", lazy="selectin")
    products = relationship("Product", back_populates="partner")

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
