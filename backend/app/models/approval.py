from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Date, DateTime, Text, Float, func
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum

class DocumentType(str, enum.Enum):
    VACATION = "VACATION"           # 휴가원
    EARLY_LEAVE = "EARLY_LEAVE"     # 조퇴.외출원
    SUPPLIES = "SUPPLIES"           # 소모품 신청서

class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"

class ApprovalLine(Base):
    """결재선 설정 (Template)"""
    __tablename__ = "approval_lines"

    id = Column(Integer, primary_key=True, index=True)
    doc_type = Column(String, nullable=False) # VACATION, EARLY_LEAVE, SUPPLIES
    approver_id = Column(Integer, ForeignKey("staff.id"), nullable=False)
    sequence = Column(Integer, nullable=False) # 1, 2, 3...

    approver = relationship("Staff", foreign_keys=[approver_id], lazy="selectin")

class ApprovalDocument(Base):
    """결재 문서"""
    __tablename__ = "approval_documents"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("staff.id"), nullable=False)
    doc_type = Column(String, nullable=False) # VACATION, EARLY_LEAVE, SUPPLIES
    
    title = Column(String, nullable=False)
    # content stores doc-specific fields (dates, reason, supply items etc.)
    content = Column(JSON, nullable=False) 
    
    status = Column(String, default=ApprovalStatus.PENDING)
    current_sequence = Column(Integer, default=1) # 현재 결재 대기 중인 순서
    
    rejection_reason = Column(Text, nullable=True)
    attachment_file = Column(JSON, nullable=True) # List of {name, url}
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    author = relationship("Staff", foreign_keys=[author_id], lazy="selectin")
    steps = relationship("ApprovalStep", back_populates="document", cascade="all, delete-orphan", lazy="selectin")

class ApprovalStep(Base):
    """문서별 실시간 결재 단계"""
    __tablename__ = "approval_steps"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("approval_documents.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("staff.id"), nullable=False)
    sequence = Column(Integer, nullable=False) # 1, 2, 3...
    
    status = Column(String, default="PENDING") # PENDING, APPROVED, REJECTED
    comment = Column(Text, nullable=True) # 반려 사유 또는 의견
    processed_at = Column(DateTime, nullable=True)
    
    document = relationship("ApprovalDocument", back_populates="steps")
    approver = relationship("Staff", foreign_keys=[approver_id], lazy="selectin")
