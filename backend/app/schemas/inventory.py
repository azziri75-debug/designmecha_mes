from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import Optional, List
from .product import ProductResponse, ProductSimple
from .basics import PartnerResponse

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
    id: Optional[int] = 0
    updated_at: Optional[datetime] = None
    product: Optional[ProductSimple] = None
    producing_total: Optional[int] = 0
    producing_so: Optional[int] = 0
    producing_sp: Optional[int] = 0
    has_bom: Optional[bool] = False
    model_config = ConfigDict(from_attributes=True)

# --- Stock Production (Item) ---

class StockProductionBase(BaseModel):
    product_id: int
    partner_id: Optional[int] = None
    quantity: int
    target_date: Optional[date] = None
    note: Optional[str] = None
    batch_no: Optional[str] = None

class StockProductionCreate(StockProductionBase):
    production_no: Optional[str] = None
    request_date: Optional[date] = None

class StockProductionUpdate(BaseModel):
    quantity: Optional[int] = None
    target_date: Optional[date] = None
    status: Optional[str] = None
    note: Optional[str] = None

class StockProductionSimple(StockProductionBase):
    id: int
    production_no: str
    request_date: date
    status: str
    created_at: datetime
    product: Optional[ProductSimple] = None
    model_config = ConfigDict(from_attributes=True)

class StockProductionResponse(StockProductionBase):
    id: int
    order_id: Optional[int] = None
    production_no: str
    batch_no: Optional[str] = None
    request_date: date
    status: str
    created_at: datetime
    product: Optional[ProductSimple] = None
    partner: Optional[PartnerResponse] = None
    model_config = ConfigDict(from_attributes=True)

# --- Stock Production Order (Header) ---

class StockProductionOrderItemCreate(BaseModel):
    """헤더 생성 시 포함되는 품목 데이터"""
    product_id: int
    quantity: int
    target_date: Optional[date] = None
    note: Optional[str] = None

class StockProductionOrderCreate(BaseModel):
    partner_id: Optional[int] = None
    request_date: Optional[date] = None
    note: Optional[str] = None
    items: List[StockProductionOrderItemCreate]

class StockProductionOrderUpdate(BaseModel):
    partner_id: Optional[int] = None
    request_date: Optional[date] = None
    note: Optional[str] = None
    items: Optional[List[StockProductionOrderItemCreate]] = None  # None이면 품목 변경 안 함

class StockProductionOrderResponse(BaseModel):
    id: int
    order_no: str
    partner_id: Optional[int] = None
    request_date: date
    note: Optional[str] = None
    created_at: datetime
    partner: Optional[PartnerResponse] = None
    items: List[StockProductionResponse] = []
    model_config = ConfigDict(from_attributes=True)

