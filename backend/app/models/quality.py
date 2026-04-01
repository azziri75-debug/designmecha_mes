from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Text, JSON, Date, Enum as SqEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
import enum

class InspectionProcess(Base):
    """공정별 필요한 품질 검사 항목 정의 (Master Data)"""
    __tablename__ = "inspection_processes"
    
    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="SET NULL"), nullable=True)
    check_item = Column(String, nullable=False) # 검사 항목 (치수, 경도 등)
    spec_min = Column(Float, nullable=True)
    spec_max = Column(Float, nullable=True)
    unit = Column(String, nullable=True)

class InspectionResult(Base):
    """검사 결과 기록"""
    __tablename__ = "inspection_results"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), unique=True)
    inspector_name = Column(String, nullable=True) # 검사원
    inspection_date = Column(DateTime, default=now_kst)
    
    # Simplified result storage. For detailed per-item results, another table might be needed.
    # Here assuming JSON text or summary for simplicity as per requirements.
    result_data = Column(Text, nullable=True) # JSON format: {"치수": 10.5, "pass": true}
    is_passed = Column(Boolean, default=False)
    
    work_order = relationship("WorkOrder", back_populates="inspection_result")

class Attachment(Base):
    """첨부파일 (도면, 성적서, 현장 사진)"""
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    related_type = Column(String, nullable=False) # ORDER, PRODUCT, WORK, QUALITY
    related_id = Column(Integer, nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=True) # IMAGE, PDF etc.
    upload_date = Column(DateTime, default=now_kst)

class DefectStatus(str, enum.Enum):
    OCCURRED = "OCCURRED"   # 발생
    RESOLVED = "RESOLVED"   # 처리완료

class QualityDefect(Base):
    """불량 발생 및 처리 내역"""
    __tablename__ = "quality_defects"

    id = Column(Integer, primary_key=True, index=True)
    
    # Relationships to Sales and Production
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False)
    plan_id = Column(Integer, ForeignKey("production_plans.id", ondelete="CASCADE"), nullable=False)
    plan_item_id = Column(Integer, ForeignKey("production_plan_items.id", ondelete="CASCADE"), nullable=False) # 공정
    
    defect_date = Column(DateTime, default=now_kst)
    defect_reason = Column(String, nullable=False) # 불량 내용/사유
    quantity = Column(Integer, default=0) # 불량 수량
    amount = Column(Float, default=0.0) # 불량 금액 (손실액)
    attachment_file = Column(Text, nullable=True) # 첨부자료 (JSON array string 예상)
    
    status = Column(String, default=DefectStatus.OCCURRED) # OCCURRED, RESOLVED
    
    # Resolution Info
    resolution_date = Column(DateTime, nullable=True)
    resolution_note = Column(Text, nullable=True) # 처리 내용
    
    created_at = Column(DateTime, default=now_kst)

    # Relationships
    order = relationship("SalesOrder")
    plan = relationship("ProductionPlan")
    plan_item = relationship("ProductionPlanItem")

class ComplaintStatus(str, enum.Enum):
    RECEIVED = "RECEIVED"     # 접수
    IN_PROGRESS = "IN_PROGRESS" # 조치중
    COMPLETED = "COMPLETED"   # 조치완료

class CustomerComplaint(Base):
    """고객 불만 관리"""
    __tablename__ = "customer_complaints"

    id = Column(Integer, primary_key=True, index=True)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True) # 관련 수주
    delivery_history_id = Column(Integer, ForeignKey("delivery_histories.id"), nullable=True) # 관련 납품
    
    receipt_date = Column(Date, default=now_kst)
    content = Column(Text, nullable=False)     # 불만 내용
    action_note = Column(Text, nullable=True)  # 조치 내용
    status = Column(SqEnum(ComplaintStatus), default=ComplaintStatus.RECEIVED)
    
    attachment_files = Column(JSON, nullable=True) # [{name, url}]
    
    created_at = Column(DateTime, default=now_kst)
    updated_at = Column(DateTime, default=now_kst, onupdate=now_kst)

    partner = relationship("Partner")
    order = relationship("SalesOrder")
    delivery_history = relationship("DeliveryHistory")
