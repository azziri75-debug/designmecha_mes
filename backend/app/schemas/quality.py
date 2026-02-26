from typing import List, Optional, Any
from pydantic import BaseModel
from datetime import date, datetime

class InspectionResultBase(BaseModel):
    work_order_id: int
    inspector_name: Optional[str] = None
    result_data: Optional[str] = None
    is_passed: bool = False

class InspectionResultCreate(InspectionResultBase):
    pass

class InspectionResultResponse(InspectionResultBase):
    id: int
    inspection_date: datetime

    class Config:
        from_attributes = True

class AttachmentResponse(BaseModel):
    id: int
    related_type: str
    related_id: int
    file_name: str
    file_path: str
    file_type: Optional[str] = None
    upload_date: datetime

    class Config:
        from_attributes = True

# --- Quality Defect ---

class QualityDefectBase(BaseModel):
    order_id: int
    plan_id: int
    plan_item_id: int
    defect_reason: str
    quantity: int
    amount: float = 0.0
    status: str = "OCCURRED"
    resolution_note: Optional[str] = None
    resolution_date: Optional[datetime] = None
    attachment_file: Optional[str] = None

class QualityDefectCreate(QualityDefectBase):
    defect_date: Optional[datetime] = None

class QualityDefectUpdate(BaseModel):
    defect_reason: Optional[str] = None
    quantity: Optional[int] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    resolution_note: Optional[str] = None
    resolution_date: Optional[datetime] = None
    attachment_file: Optional[str] = None

from app.schemas.sales import SalesOrderSimple
from app.schemas.production import ProductionPlanSimple, ProductionPlanItem as ProductionPlanItemResponse

class QualityDefectResponse(QualityDefectBase):
    id: int
    defect_date: datetime
    created_at: datetime
    order: Optional[SalesOrderSimple] = None
    plan: Optional[ProductionPlanSimple] = None
    plan_item: Optional[ProductionPlanItemResponse] = None

    class Config:
        from_attributes = True
