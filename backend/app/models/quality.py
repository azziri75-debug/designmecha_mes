from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class InspectionProcess(Base):
    """공정별 필요한 품질 검사 항목 정의 (Master Data)"""
    __tablename__ = "inspection_processes"
    
    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(Integer, ForeignKey("processes.id"))
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
