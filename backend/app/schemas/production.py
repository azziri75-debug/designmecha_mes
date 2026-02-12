from pydantic import BaseModel
from typing import Optional, List
from datetime import date

# WorkOrder Schemas
class WorkOrderBase(BaseModel):
    process_name: str
    sequence: int
    worker_id: Optional[int] = None
    status: str = "PENDING"
    work_date: Optional[date] = None
    good_quantity: int = 0
    bad_quantity: int = 0

class WorkOrderCreate(WorkOrderBase):
    production_plan_id: int

class WorkOrderUpdate(BaseModel):
    worker_id: Optional[int] = None
    status: Optional[str] = None
    work_date: Optional[date] = None
    good_quantity: Optional[int] = None
    bad_quantity: Optional[int] = None

class WorkOrderResponse(WorkOrderBase):
    id: int
    production_plan_id: int

    class Config:
        from_attributes = True

# ProductionPlan Schemas
class ProductionPlanBase(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = "PLANNED"

class ProductionPlanUpdate(ProductionPlanBase):
    pass

class ProductionPlanResponse(ProductionPlanBase):
    id: int
    order_id: int
    work_orders: List[WorkOrderResponse] = []

    class Config:
        from_attributes = True
