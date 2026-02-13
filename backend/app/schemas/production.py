from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel
from enum import Enum

class ProductionStatus(str, Enum):
    PENDING = "PENDING"
    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELED = "CANCELED"

# --- Item Schemas ---
class ProductionPlanItemBase(BaseModel):
    product_id: int
    process_name: str
    sequence: int
    course_type: str = "INTERNAL"
    
    partner_name: Optional[str] = None
    work_center: Optional[str] = None
    estimated_time: Optional[float] = None
    
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    worker_name: Optional[str] = None
    note: Optional[str] = None
    status: ProductionStatus = ProductionStatus.PLANNED

class ProductionPlanItemCreate(ProductionPlanItemBase):
    pass

class ProductionPlanItemUpdate(BaseModel):
    partner_name: Optional[str] = None
    work_center: Optional[str] = None
    estimated_time: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    worker_name: Optional[str] = None
    note: Optional[str] = None
    status: Optional[ProductionStatus] = None

class ProductionPlanItem(ProductionPlanItemBase):
    id: int
    plan_id: int

    class Config:
        from_attributes = True

# --- Plan Schemas ---
class ProductionPlanBase(BaseModel):
    plan_date: date
    status: ProductionStatus = ProductionStatus.PLANNED

class ProductionPlanCreate(BaseModel):
    order_id: int
    plan_date: date

class ProductionPlanUpdate(BaseModel):
    plan_date: Optional[date] = None
    status: Optional[ProductionStatus] = None

class ProductionPlan(ProductionPlanBase):
    id: int
    order_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[ProductionPlanItem] = []

    class Config:
        from_attributes = True
