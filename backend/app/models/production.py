from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Date, DateTime, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
import enum

class ProductionStatus(str, enum.Enum):
    PENDING = "PENDING"       # 대기
    PLANNED = "PLANNED"       # 계획 수립
    IN_PROGRESS = "IN_PROGRESS" # 진행 중
    COMPLETED = "COMPLETED"     # 완료
    CANCELED = "CANCELED"       # 취소

class ProductionPlan(Base):
    """
    수주 기반 생산 계획 헤더
    """
    __tablename__ = "production_plans"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False) # 수주 참조
    plan_date = Column(Date, nullable=False) # 계획 수립일
    
    status = Column(Enum(ProductionStatus), default=ProductionStatus.PLANNED)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    order = relationship("SalesOrder", backref="production_plan")
    items = relationship("ProductionPlanItem", back_populates="plan", cascade="all, delete-orphan", lazy="selectin")

class ProductionPlanItem(Base):
    """
    생산 계획 상세 (공정별 작업 지시)
    """
    __tablename__ = "production_plan_items"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("production_plans.id"), nullable=False)
    
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False) # 품목
    
    process_name = Column(String, nullable=False) # 공정명
    sequence = Column(Integer, nullable=False) # 순서
    course_type = Column(String, default="INTERNAL") # INTERNAL, OUTSOURCING, PURCHASE
    
    # Details
    quantity = Column(Integer, default=1) # 생산 수량 (Target)
    partner_name = Column(String, nullable=True) # 외주처/구매처
    work_center = Column(String, nullable=True) # 작업장/기계 (내부)
    
    estimated_time = Column(Float, nullable=True) # 예상 시간
    
    start_date = Column(Date, nullable=True) # 계획 시작일
    end_date = Column(Date, nullable=True) # 계획 종료일
    
    worker_name = Column(String, nullable=True) # 작업자
    
    status = Column(Enum(ProductionStatus), default=ProductionStatus.PLANNED)
    note = Column(Text, nullable=True)

    # Key Relationship
    plan = relationship("ProductionPlan", back_populates="items")
    product = relationship("Product")
    work_orders = relationship("WorkOrder", back_populates="plan_item")

class WorkOrder(Base):
    """
    작업 지시 및 실적 (Execution of Plan Item)
    """
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True, index=True)
    # Link to Plan Item
    plan_item_id = Column(Integer, ForeignKey("production_plan_items.id"), nullable=True)
    
    # Snapshot or override info
    process_name = Column(String, nullable=False)
    worker_id = Column(Integer, ForeignKey("staff.id"), nullable=True)
    
    status = Column(Enum(ProductionStatus), default=ProductionStatus.PENDING)
    
    work_date = Column(Date, nullable=True)
    good_quantity = Column(Integer, default=0)
    bad_quantity = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    plan_item = relationship("ProductionPlanItem", back_populates="work_orders")
    worker = relationship("Staff")
    inspection_result = relationship("InspectionResult", back_populates="work_order", uselist=False)
