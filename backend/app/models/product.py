from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, UniqueConstraint, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
from app.core.timezone import now_kst

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
    item_type = Column(String, default="PRODUCED", nullable=True) # PRODUCED(생산제품), PART(부품), CONSUMABLE(소모품)
    recent_price = Column(Float, default=0.0) # 최근 단가 (구매 시 자동 갱신)
    
    # Relationships
    group = relationship("ProductGroup", back_populates="products")
    partner = relationship("Partner", back_populates="products")
    inventory = relationship("Inventory", back_populates="product", uselist=False)
    standard_processes = relationship("ProductProcess", back_populates="product", order_by="ProductProcess.sequence", lazy="selectin")
    bom_items = relationship("BOM", foreign_keys="BOM.parent_product_id", back_populates="parent_product", cascade="all, delete-orphan", lazy="selectin")
    price_history = relationship("ProductPriceHistory", back_populates="product", cascade="all, delete-orphan", order_by="ProductPriceHistory.date.desc()")

class Process(Base):
    __tablename__ = "processes"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("product_groups.id"), nullable=True) # 대/소그룹
    name = Column(String, index=True, nullable=False) # 공정명
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
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="SET NULL"), nullable=True)
    sequence = Column(Integer, nullable=False)
    estimated_time = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    
    # New Columns
    partner_name = Column(String, nullable=True) # 업체명 (외주/구매 시)
    equipment_name = Column(String, nullable=True) # 장비명 (내부 시)
    attachment_file = Column(String, nullable=True) # 첨부파일 경로
    course_type = Column(String, nullable=True) # 구분 Override (NULL이면 Process 기본값 사용)
    cost = Column(Float, nullable=True, default=0.0) # 공정 비용

    product = relationship("Product", back_populates="standard_processes")
    process = relationship("Process")

    __table_args__ = (
        UniqueConstraint("product_id", "sequence", name="uq_product_process_sequence"),
    )

class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True)
    quantity = Column(Integer, default=0)
    location = Column(String, nullable=True) # 보관 위치
    
    product = relationship("Product", back_populates="inventory")

class BOM(Base):
    """
    자재명세서 (Bill of Materials)
    parent_product: 완제품 또는 반제품
    child_product: 구성 하위 품목 (원자재, 부품, 반제품 등)
    """
    __tablename__ = "bom"

    id = Column(Integer, primary_key=True, index=True)
    parent_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    child_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    required_quantity = Column(Float, nullable=False, default=1.0)

    # Relationships
    parent_product = relationship("Product", foreign_keys=[parent_product_id], back_populates="bom_items")
    child_product = relationship("Product", foreign_keys=[child_product_id], lazy="selectin")

class ProductPriceHistory(Base):
    """
    제품/부품 단가 이력 (수동 입력 및 자동 기록)
    """
    __tablename__ = "product_price_histories"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    price = Column(Float, nullable=False)
    date = Column(DateTime, default=now_kst)
    note = Column(String, nullable=True)
    type = Column(String, default="MANUAL") # MANUAL, PURCHASE, SALES 등

    product = relationship("Product", back_populates="price_history")
