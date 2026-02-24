from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, DateTime, JSON, Text, Enum as SqEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
import enum

class StockProductionStatus(str, enum.Enum):
    PENDING = "PENDING"       # 대기
    IN_PROGRESS = "IN_PROGRESS" # 생산 진행 중
    COMPLETED = "COMPLETED"   # 완료 (재고 자동 입고됨)
    CANCELLED = "CANCELLED"   # 취소

class Stock(Base):
    """현재고 현황"""
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True, nullable=False)
    
    current_quantity = Column(Integer, default=0)    # 가용 보유 수량 (실재고)
    in_production_quantity = Column(Integer, default=0) # 현재 생산 중인 수량
    
    location = Column(String, nullable=True) # 창고 위치 등
    updated_at = Column(DateTime, onupdate=func.now())

    product = relationship("Product")

class StockProduction(Base):
    """수주 없는 재고 보충용 생산 계획 요청 (수주와 유사한 역할)"""
    __tablename__ = "stock_productions"

    id = Column(Integer, primary_key=True, index=True)
    production_no = Column(String, unique=True, index=True) # 재고생산번호 (SP-YYYYMMDD-XXX)
    
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False) # 요청 수량
    
    request_date = Column(Date, default=func.now()) # 등록일
    target_date = Column(Date, nullable=True)      # 완공 목표일
    
    status = Column(SqEnum(StockProductionStatus), default=StockProductionStatus.PENDING)
    note = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=func.now())

    product = relationship("Product")
    # ProductionPlan과의 역참조는 production.py에서 정의됨 (backref 또는 relationship)
