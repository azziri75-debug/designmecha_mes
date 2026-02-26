from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Text
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
    inspection_date = Column(DateTime, default=func.now())
    
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
    upload_date = Column(DateTime, default=func.now())

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
    
    defect_date = Column(DateTime, default=func.now())
    defect_reason = Column(String, nullable=False) # 불량 내용/사유
    quantity = Column(Integer, default=0) # 불량 수량
    amount = Column(Float, default=0.0) # 불량 금액 (손실액)
    attachment_file = Column(Text, nullable=True) # 첨부자료 (JSON array string 예상)
    
    status = Column(String, default=DefectStatus.OCCURRED) # OCCURRED, RESOLVED
    
    # Resolution Info
    resolution_date = Column(DateTime, nullable=True)
    resolution_note = Column(Text, nullable=True) # 처리 내용
    
    created_at = Column(DateTime, default=func.now())

    # Relationships
    order = relationship("SalesOrder")
    plan = relationship("ProductionPlan")
    plan_item = relationship("ProductionPlanItem")
