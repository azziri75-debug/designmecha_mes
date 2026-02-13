from sqlalchemy import Column, Integer, String, Date, ForeignKey, Float, DateTime, Enum as SqlEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class PurchaseStatus(str, enum.Enum):
    PENDING = "PENDING"     # 발주 대기
    ORDERED = "ORDERED"     # 발주 완료
    PARTIAL = "PARTIAL"     # 부분 입고
    COMPLETED = "COMPLETED" # 입고 완료
    CANCELED = "CANCELED"   # 취소됨

class OutsourcingStatus(str, enum.Enum):
    PENDING = "PENDING"     # 발주 대기
    ORDERED = "ORDERED"     # 발주 완료
    COMPLETED = "COMPLETED" # 작업 완료 (입고)
    CANCELED = "CANCELED"   # 취소됨

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True) # PO-YYYYMMDD-XXX
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
    order_date = Column(Date, nullable=False)
    delivery_date = Column(Date, nullable=True)
    total_amount = Column(Float, default=0.0)
    note = Column(String, nullable=True)
    status = Column(SqlEnum(PurchaseStatus), default=PurchaseStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    partner = relationship("Partner", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=0)
    unit_price = Column(Float, default=0.0)
    received_quantity = Column(Integer, default=0) # 입고 수량
    note = Column(String, nullable=True)

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product") 

class OutsourcingOrder(Base):
    __tablename__ = "outsourcing_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True) # OS-YYYYMMDD-XXX
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
    order_date = Column(Date, nullable=False)
    delivery_date = Column(Date, nullable=True)
    total_amount = Column(Float, default=0.0)
    note = Column(String, nullable=True)
    status = Column(SqlEnum(OutsourcingStatus), default=OutsourcingStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    partner = relationship("Partner", back_populates="outsourcing_orders")
    items = relationship("OutsourcingOrderItem", back_populates="outsourcing_order", cascade="all, delete-orphan")

class OutsourcingOrderItem(Base):
    __tablename__ = "outsourcing_order_items"

    id = Column(Integer, primary_key=True, index=True)
    outsourcing_order_id = Column(Integer, ForeignKey("outsourcing_orders.id"), nullable=False)
    production_plan_item_id = Column(Integer, ForeignKey("production_plan_items.id"), nullable=True) 
    # Link to specific process in production plan. Nullable if manual external order? 
    # Ideally linked.
    
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True) 
    # Redundant if linked to plan item, but good for manual orders.
    
    quantity = Column(Integer, default=0)
    unit_price = Column(Float, default=0.0)
    note = Column(String, nullable=True)
    status = Column(SqlEnum(OutsourcingStatus), default=OutsourcingStatus.PENDING)

    # Relationships
    outsourcing_order = relationship("OutsourcingOrder", back_populates="items")
    production_plan_item = relationship("ProductionPlanItem")
    product = relationship("Product")
