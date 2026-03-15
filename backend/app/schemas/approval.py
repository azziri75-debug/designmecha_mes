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

class ApprovalAttachmentBase(BaseModel):
    filename: str
    url: str

class ApprovalAttachmentCreate(ApprovalAttachmentBase):
    pass

class ApprovalAttachmentResponse(ApprovalAttachmentBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class ApprovalDocumentBase(BaseModel):
    doc_type: str
    title: str
    content: dict # JSON for doc-specific fields
    attachment_file: Optional[List[dict]] = None
    # Support for multi-file attachments in creation
    attachments_to_add: Optional[List[ApprovalAttachmentBase]] = None

class CustomApprover(BaseModel):
    approver_id: int
    sequence: int

class ApprovalDocumentCreate(ApprovalDocumentBase):
    # Optionally specify initial approval line if not using template
    custom_approvers: Optional[List[CustomApprover]] = None

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
    attachments: List[ApprovalAttachmentResponse] = []
    
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
