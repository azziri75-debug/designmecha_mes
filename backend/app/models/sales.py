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
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
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
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
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
