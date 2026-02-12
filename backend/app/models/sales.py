from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, DateTime, Enum as SqEnum, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
import enum

class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"       # 대기
    CONFIRMED = "CONFIRMED"   # 확정 (수주 승인)
    CANCELLED = "CANCELLED"   # 취소

class OrderItemStatus(str, enum.Enum):
    PENDING = "PENDING"       # 대기
    IN_PRODUCTION = "IN_PRODUCTION" # 생산 중
    COMPLETED = "COMPLETED"   # 생산 완료
    SHIPPED = "SHIPPED"       # 출고 완료

class Estimate(Base):
    """견적서 (Header)"""
    __tablename__ = "estimates"

    id = Column(Integer, primary_key=True, index=True)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=False)
    estimate_date = Column(Date, default=func.now())
    valid_until = Column(Date, nullable=True) # 유효기간
    total_amount = Column(Float, default=0.0) # 총 견적 금액
    note = Column(Text, nullable=True)
    attachment_file = Column(JSON, nullable=True) # 첨부파일 (JSON List of {name, url})
    created_at = Column(DateTime, default=func.now())

    partner = relationship("Partner")
    items = relationship("EstimateItem", back_populates="estimate", cascade="all, delete-orphan")

class EstimateItem(Base):
    """견적 품목 (Detail)"""
    __tablename__ = "estimate_items"

    id = Column(Integer, primary_key=True, index=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)

    estimate = relationship("Estimate", back_populates="items")
    product = relationship("Product")

class SalesOrder(Base):
    """수주 (Header) - Renamed from Order to avoid keyword conflicts and clarity"""
    __tablename__ = "sales_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True) # 수주번호 (자동생성 예정)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=False)
    order_date = Column(Date, default=func.now())
    delivery_date = Column(Date, nullable=True) # 납기일
    total_amount = Column(Float, default=0.0)
    note = Column(Text, nullable=True)
    status = Column(SqEnum(OrderStatus), default=OrderStatus.PENDING)
    created_at = Column(DateTime, default=func.now())

    partner = relationship("Partner")
    items = relationship("SalesOrderItem", back_populates="order", cascade="all, delete-orphan")

class SalesOrderItem(Base):
    """수주 품목 (Detail)"""
    __tablename__ = "sales_order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    delivered_quantity = Column(Integer, default=0) # 납품 수량
    status = Column(SqEnum(OrderItemStatus), default=OrderItemStatus.PENDING)
    note = Column(Text, nullable=True)

    order = relationship("SalesOrder", back_populates="items")
    product = relationship("Product")
    production_plan = relationship("ProductionPlan", back_populates="sales_order_item", uselist=False)

class ProductionPlan(Base):
    """생산 계획 (수주 품목별)"""
    __tablename__ = "production_plans"

    id = Column(Integer, primary_key=True, index=True)
    # Changed from order_id to sales_order_item_id
    sales_order_item_id = Column(Integer, ForeignKey("sales_order_items.id"), unique=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    status = Column(String, default="PLANNED") # PLANNED, IN_PROGRESS, COMPLETED
    
    sales_order_item = relationship("SalesOrderItem", back_populates="production_plan")
    work_orders = relationship("WorkOrder", back_populates="production_plan")

class WorkOrder(Base):
    """작업 지시 및 실적"""
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True, index=True)
    production_plan_id = Column(Integer, ForeignKey("production_plans.id"))
    process_name = Column(String, nullable=False) # 공정명 (Snapshotted or Linked)
    sequence = Column(Integer, nullable=False)
    
    worker_id = Column(Integer, ForeignKey("staff.id"), nullable=True)
    status = Column(String, default="PENDING") # PENDING, WORKING, DONE
    
    # Result Data
    work_date = Column(Date, nullable=True)
    good_quantity = Column(Integer, default=0) # 합격 수량
    bad_quantity = Column(Integer, default=0) # 불량 수량
    
    # Linked Inspection
    inspection_result = relationship("InspectionResult", back_populates="work_order", uselist=False)
    production_plan = relationship("ProductionPlan", back_populates="work_orders")
    worker = relationship("Staff")
