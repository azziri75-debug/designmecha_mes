from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, DateTime, JSON, Text, Enum as SqEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
from app.core.timezone import now_kst
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
    updated_at = Column(DateTime, default=now_kst, onupdate=now_kst)

    product = relationship("Product")

class StockProduction(Base):
    """수주 없는 재고 보충용 생산 계획 요청 (수주와 유사한 역할)"""
    __tablename__ = "stock_productions"

    id = Column(Integer, primary_key=True, index=True)
    production_no = Column(String, unique=True, index=True) # 재고생산번호 (SP-YYYYMMDD-XXX)
    batch_no = Column(String, nullable=True, index=True)    # 묶음번호 (다중등록 시 첫 번호 공유)
    
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True) # 보충 요청 거래처
    quantity = Column(Integer, nullable=False) # 요청 수량
    
    request_date = Column(Date, default=now_kst) # 등록일
    target_date = Column(Date, nullable=True)      # 완공 목표일
    
    status = Column(SqEnum(StockProductionStatus, native_enum=False), default=StockProductionStatus.PENDING)
    note = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=now_kst)

    product = relationship("Product")
    partner = relationship("app.models.basics.Partner") # Use string reference to avoid circularities
    # ProductionPlan과의 역참조는 production.py에서 정의됨 (backref 또는 relationship)

class TransactionType(str, enum.Enum):
    IN = "IN"                 # 입고
    OUT = "OUT"               # 출고
    ADJUSTMENT = "ADJUSTMENT" # 재정의/조정

class StockTransaction(Base):
    """재고 입출고 이력 (수불부)"""
    __tablename__ = "stock_transactions"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    
    quantity = Column(Integer, nullable=False) # 증감 수량 (양수/음수)
    transaction_type = Column(SqEnum(TransactionType, native_enum=False), nullable=False)
    
    reference = Column(String, nullable=True) # 구매번호, 수주번호, 작업지시번호 등
    created_at = Column(DateTime, default=now_kst)

    stock = relationship("Stock", backref="transactions")
