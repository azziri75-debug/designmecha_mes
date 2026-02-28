from typing import Optional, List, Union, Any
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from enum import Enum

from app.schemas.sales import SalesOrder, SalesOrderSimple
from app.schemas.product import ProductResponse, ProductSimple
from app.schemas.inventory import StockProductionResponse
from app.schemas.basics import EquipmentSimple, StaffSimple

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
    worker_id: Optional[int] = None
    equipment_id: Optional[int] = None
    note: Optional[str] = None
    status: ProductionStatus = ProductionStatus.PLANNED
    cost: Optional[float] = 0.0
    attachment_file: Optional[Union[List[Any], str]] = None

class ProductionPlanItemCreate(ProductionPlanItemBase):
    pass

class ProductionPlanItemUpdate(BaseModel):
    partner_name: Optional[str] = None
    work_center: Optional[str] = None
    estimated_time: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    worker_id: Optional[int] = None
    equipment_id: Optional[int] = None
    note: Optional[str] = None
    status: Optional[ProductionStatus] = None
    cost: Optional[float] = None
    attachment_file: Optional[Union[List[Any], str]] = None
    quantity: Optional[int] = None

# --- Plan Schemas (Base) ---
class ProductionPlanBase(BaseModel):
    plan_date: date
    status: ProductionStatus = ProductionStatus.PLANNED
    attachment_file: Optional[Union[List[Any], str]] = None
    sheet_metadata: Optional[dict] = None

# --- Plan Schemas (Forward Declaration for Item) ---
class ProductionPlanSimple(ProductionPlanBase):
    id: int
    order_id: Optional[int] = None
    stock_production_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    order: Optional[SalesOrderSimple] = None
    stock_production: Optional[StockProductionResponse] = None

    model_config = ConfigDict(from_attributes=True)

# Forward refs for Purchasing
from app.schemas.purchasing import PurchaseOrderItemSimple, OutsourcingOrderItemSimple

class ProductionPlanItem(ProductionPlanItemBase):
    id: int
    plan_id: int
    product: Optional[ProductResponse] = None
    plan: Optional[ProductionPlanSimple] = None
    equipment: Optional[EquipmentSimple] = None
    worker: Optional[StaffSimple] = None
    
    purchase_items: List[PurchaseOrderItemSimple] = []
    outsourcing_items: List[OutsourcingOrderItemSimple] = []
    completed_quantity: int = 0

    model_config = ConfigDict(from_attributes=True)

# --- Plan Schemas ---

class ProductionPlanCreate(BaseModel):
    order_id: Optional[int] = None
    stock_production_id: Optional[int] = None
    plan_date: date
    items: Optional[List[ProductionPlanItemCreate]] = None

class ProductionPlanUpdate(BaseModel):
    plan_date: Optional[date] = None
    status: Optional[ProductionStatus] = None
    attachment_file: Optional[Union[List[Any], str]] = None
    sheet_metadata: Optional[dict] = None
    items: Optional[List[ProductionPlanItemCreate]] = None

class ProductionPlan(ProductionPlanBase):
    id: int
    order_id: Optional[int] = None
    stock_production_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    order: Optional[SalesOrderSimple] = None
    stock_production: Optional[StockProductionResponse] = None
    items: List[ProductionPlanItem] = []

    model_config = ConfigDict(from_attributes=True)


# --- Work Log Schemas ---

class WorkLogItemBase(BaseModel):
    plan_item_id: int
    worker_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    good_quantity: int = 0
    bad_quantity: int = 0
    unit_price: float = 0.0
    note: Optional[str] = None

class WorkLogItemCreate(WorkLogItemBase):
    pass

class WorkLogItem(WorkLogItemBase):
    id: int
    work_log_id: int
    plan_item: Optional[ProductionPlanItem] = None
    worker: Optional[StaffSimple] = None

    model_config = ConfigDict(from_attributes=True)

class WorkLogBase(BaseModel):
    work_date: date
    worker_id: Optional[int] = None
    note: Optional[str] = None
    attachment_file: Optional[Union[List[Any], str]] = None

class WorkLogCreate(WorkLogBase):
    items: List[WorkLogItemCreate]

class WorkLogUpdate(WorkLogBase):
    items: Optional[List[WorkLogItemCreate]] = None
    work_date: Optional[date] = None

class WorkLog(WorkLogBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    worker: Optional[StaffSimple] = None
    items: List[WorkLogItem] = []

    model_config = ConfigDict(from_attributes=True)
