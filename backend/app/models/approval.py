from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Date, DateTime, Text, Float, func
from sqlalchemy.orm import relationship
from app.db.base import Base
from app.core.timezone import now_kst
import enum

class DocumentType(str, enum.Enum):
    VACATION = "VACATION"           # 휴가원 (Legacy)
    EARLY_LEAVE = "EARLY_LEAVE"     # 조퇴.외출원
    SUPPLIES = "SUPPLIES"           # 소모품 신청서 (Legacy)
    OVERTIME = "OVERTIME"           # 야근/특근신청서
    INTERNAL_DRAFT = "INTERNAL_DRAFT" # 내부기안
    EXPENSE_REPORT = "EXPENSE_REPORT" # 지출결의서
    CONSUMABLES_PURCHASE = "CONSUMABLES_PURCHASE" # 소모품 구매 신청서
    LEAVE_REQUEST = "LEAVE_REQUEST" # 휴가원 (New version)
    PURCHASE_ORDER = "PURCHASE_ORDER" # 구매발주서
    BUSINESS_TRIP = "BUSINESS_TRIP" # 출장여비정산서

class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"

class ApprovalLine(Base):
    """결재선 설정 (Template)"""
    __tablename__ = "approval_lines"

    id = Column(Integer, primary_key=True, index=True)
    doc_type = Column(String, nullable=False) # VACATION, EARLY_LEAVE, SUPPLIES, INTERNAL_DRAFT
    approver_id = Column(Integer, ForeignKey("staff.id"), nullable=False)
    sequence = Column(Integer, nullable=False) # 1, 2, 3...

    approver = relationship("Staff", foreign_keys=[approver_id], lazy="selectin")

class ApprovalDocument(Base):
    """결재 문서"""
    __tablename__ = "approval_documents"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("staff.id"), nullable=False)
    doc_type = Column(String, nullable=False) # VACATION, EARLY_LEAVE, SUPPLIES, INTERNAL_DRAFT
    
    title = Column(String, nullable=False)
    # content stores doc-specific fields (dates, reason, supply items etc.)
    content = Column(JSON, nullable=False) 
    
    # 통합 연동 필드: 기존 업무 DB와 연결 (자재/외주/소모품 발주 등)
    reference_id = Column(Integer, nullable=True)
    reference_type = Column(String, nullable=True) # PURCHASE, OUTSOURCING 등
    
    status = Column(String, default=ApprovalStatus.PENDING)
    current_sequence = Column(Integer, default=1) # 현재 결재 대기 중인 순서
    
    rejection_reason = Column(Text, nullable=True)
    attachment_file = Column(JSON, nullable=True) # [Legacy] List of {name, url}
    
    created_at = Column(DateTime, default=now_kst)
    updated_at = Column(DateTime, default=now_kst, onupdate=now_kst)
    deleted_at = Column(DateTime, nullable=True) # Soft delete

    author = relationship("Staff", foreign_keys=[author_id], lazy="selectin")
    steps = relationship("ApprovalStep", back_populates="document", cascade="all, delete-orphan", lazy="selectin")
    attachments = relationship("ApprovalAttachment", back_populates="document", cascade="all, delete-orphan", lazy="selectin")

class ApprovalAttachment(Base):
    """결재 문서 첨부파일"""
    __tablename__ = "approval_attachments"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("approval_documents.id"), nullable=False)
    filename = Column(String, nullable=False)
    url = Column(String, nullable=False)
    created_at = Column(DateTime, default=now_kst)

    document = relationship("ApprovalDocument", back_populates="attachments")

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
