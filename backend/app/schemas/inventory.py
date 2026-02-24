from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import Optional, List
from .product import ProductResponse

class StockBase(BaseModel):
    product_id: int
    current_quantity: Optional[int] = 0
    in_production_quantity: Optional[int] = 0
    location: Optional[str] = None

class StockCreate(StockBase):
    pass

class StockUpdate(BaseModel):
    current_quantity: Optional[int] = None
    in_production_quantity: Optional[int] = None
    location: Optional[str] = None

class StockResponse(StockBase):
    id: int
    updated_at: Optional[datetime] = None
    product: Optional[ProductResponse] = None
    model_config = ConfigDict(from_attributes=True)

# --- Stock Production ---

class StockProductionBase(BaseModel):
    product_id: int
    quantity: int
    target_date: Optional[date] = None
    note: Optional[str] = None

class StockProductionCreate(StockProductionBase):
    production_no: Optional[str] = None

class StockProductionUpdate(BaseModel):
    quantity: Optional[int] = None
    target_date: Optional[date] = None
    status: Optional[str] = None
    note: Optional[str] = None

class StockProductionResponse(StockProductionBase):
    id: int
    production_no: str
    request_date: date
    status: str
    created_at: datetime
    product: Optional[ProductResponse] = None
    model_config = ConfigDict(from_attributes=True)
