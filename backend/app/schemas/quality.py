from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# Inspection Result Schemas
class InspectionResultBase(BaseModel):
    work_order_id: int
    inspector_name: str
    result_data: str # JSON string for now
    is_passed: bool

class InspectionResultCreate(InspectionResultBase):
    pass

class InspectionResultResponse(InspectionResultBase):
    id: int
    inspection_date: datetime

    class Config:
        from_attributes = True

# Attachment Schemas
class AttachmentBase(BaseModel):
    related_type: str # ORDER, WORK, QUALITY
    related_id: int
    file_name: str
    file_type: str
    
class AttachmentResponse(AttachmentBase):
    id: int
    file_path: str
    upload_date: datetime
    
    class Config:
        from_attributes = True
