from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db.base import Base

class ProductGroup(Base):
    __tablename__ = "product_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    type = Column(String, nullable=False)  # "MAJOR" or "MINOR"
    parent_id = Column(Integer, ForeignKey("product_groups.id"), nullable=True)
    description = Column(Text, nullable=True)

    # Relationships
    parent = relationship("ProductGroup", remote_side=[id], backref="children")
    products = relationship("Product", back_populates="group")
    processes = relationship("Process", back_populates="group")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("product_groups.id"), nullable=True) # 대/소그룹
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True) # 거래처 (고객사/공급사)
    name = Column(String, index=True, nullable=False) # 품명
    specification = Column(String, nullable=True) # 규격
    material = Column(String, nullable=True) # 재질
    unit = Column(String, default="EA") # 단위
    drawing_file = Column(String, nullable=True) # 도면 파일 경로
    note = Column(Text, nullable=True) # 비고
    
    # Relationships
    group = relationship("ProductGroup", back_populates="products")
    partner = relationship("Partner", back_populates="products")
    inventory = relationship("Inventory", back_populates="product", uselist=False)
    standard_processes = relationship("ProductProcess", back_populates="product", order_by="ProductProcess.sequence")

class Process(Base):
    __tablename__ = "processes"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("product_groups.id"), nullable=True) # 대/소그룹
    name = Column(String, unique=True, nullable=False) # 공정명
    course_type = Column(String, default="INTERNAL") # 구분: INTERNAL(내부), OUTSOURCING(외주), PURCHASE(구매)
    description = Column(Text, nullable=True)

    # Relationships
    group = relationship("ProductGroup", back_populates="processes")

class ProductProcess(Base):
    """
    제품별 표준 공정 (Routing)
    """
    __tablename__ = "product_processes"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    process_id = Column(Integer, ForeignKey("processes.id"))
    sequence = Column(Integer, nullable=False)
    estimated_time = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    
    # New Columns
    partner_name = Column(String, nullable=True) # 업체명 (외주/구매 시)
    equipment_name = Column(String, nullable=True) # 장비명 (내부 시)
    attachment_file = Column(String, nullable=True) # 첨부파일 경로
    course_type = Column(String, nullable=True) # 구분 Override (NULL이면 Process 기본값 사용)

    product = relationship("Product", back_populates="standard_processes")
    process = relationship("Process")

class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True)
    quantity = Column(Integer, default=0)
    location = Column(String, nullable=True) # 보관 위치
    
    product = relationship("Product", back_populates="inventory")
