from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
from app.schemas.basics import StaffSimple

class ApprovalLineBase(BaseModel):
    doc_type: str
    approver_id: int
    sequence: int

class ApprovalLineCreate(ApprovalLineBase):
    pass

class ApprovalLineResponse(ApprovalLineBase):
    id: int
    approver: Optional[StaffSimple] = None
    class Config:
        from_attributes = True

class ApprovalStepBase(BaseModel):
    approver_id: int
    sequence: int
    status: str = "PENDING"
    comment: Optional[str] = None
    processed_at: Optional[datetime] = None

class ApprovalStepResponse(ApprovalStepBase):
    id: int
    approver: Optional[StaffSimple] = None
    class Config:
        from_attributes = True

class ApprovalDocumentBase(BaseModel):
    doc_type: str
    title: str
    content: dict # JSON for doc-specific fields
    attachment_file: Optional[List[dict]] = None

class ApprovalDocumentCreate(ApprovalDocumentBase):
    # Optionally specify initial approval line if not using template
    pass

class ApprovalDocumentResponse(ApprovalDocumentBase):
    id: int
    author_id: int
    author: Optional[StaffSimple] = None
    status: str
    current_sequence: int
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    steps: List[ApprovalStepResponse] = []
    
    class Config:
        from_attributes = True

class ApprovalAction(BaseModel):
    """Action taken by an approver"""
    status: str # APPROVED, REJECTED
    comment: Optional[str] = None

class ApprovalStats(BaseModel):
    pending_count: int
    completed_count: int
    rejected_count: int
    waiting_for_me_count: int
