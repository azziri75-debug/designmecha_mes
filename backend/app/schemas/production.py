from typing import Optional, List, Union, Any
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from enum import Enum

from app.schemas.sales import SalesOrder, SalesOrderSimple
from app.schemas.product import ProductResponse, ProductSimple
from app.schemas.inventory import StockProductionResponse

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
    
    purchase_items: List[PurchaseOrderItemSimple] = []
    outsourcing_items: List[OutsourcingOrderItemSimple] = []

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
