from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel
from enum import Enum

from app.schemas.sales import SalesOrder, SalesOrderSimple
from app.schemas.product import ProductResponse, ProductSimple

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
    quantity: int = 1
    
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

# --- Plan Schemas (Moved Base Up) ---
class ProductionPlanBase(BaseModel):
    plan_date: date
    status: ProductionStatus = ProductionStatus.PLANNED

# --- Plan Schemas (Forward Declaration for Item) ---
class ProductionPlanSimple(ProductionPlanBase):
    id: int
    order_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    order: Optional[SalesOrderSimple] = None

    class Config:
        from_attributes = True

# Forward refs for Purchasing
from app.schemas.purchasing import PurchaseOrderItemSimple, OutsourcingOrderItemSimple

class ProductionPlanItem(ProductionPlanItemBase):
    id: int
    plan_id: int
    product: Optional[ProductResponse] = None
    plan: Optional[ProductionPlanSimple] = None
    
    purchase_items: List[PurchaseOrderItemSimple] = []
    outsourcing_items: List[OutsourcingOrderItemSimple] = []

    class Config:
        from_attributes = True

# --- Plan Schemas ---

class ProductionPlanCreate(BaseModel):
    order_id: int
    plan_date: date
    items: Optional[List[ProductionPlanItemCreate]] = None

class ProductionPlanUpdate(BaseModel):
    plan_date: Optional[date] = None
    status: Optional[ProductionStatus] = None
    items: Optional[List[ProductionPlanItemCreate]] = None

class ProductionPlan(ProductionPlanBase):
    id: int
    order_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    order: Optional[SalesOrderSimple] = None
    items: List[ProductionPlanItem] = []

    class Config:
        from_attributes = True
