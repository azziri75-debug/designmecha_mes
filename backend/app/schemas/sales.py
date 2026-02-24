from typing import List, Optional, Any, Union
from pydantic import BaseModel
from datetime import date, datetime
from app.schemas.basics import PartnerResponse as Partner
from app.schemas.product import ProductResponse as Product, ProductSimple

# --- Estimate Schemas ---

class EstimateItemBase(BaseModel):
    product_id: int
    unit_price: float
    quantity: int
    note: Optional[str] = None

class EstimateItemCreate(EstimateItemBase):
    pass

class EstimateItem(EstimateItemBase):
    id: int
    estimate_id: int
    product: Optional[ProductSimple] = None

    class Config:
        from_attributes = True

class EstimateBase(BaseModel):
    partner_id: int
    estimate_date: Optional[date] = None
    valid_until: Optional[date] = None
    total_amount: float
    note: Optional[str] = None
    attachment_file: Optional[Union[List[Any], str]] = None # JSON list or stringified JSON
    sheet_metadata: Optional[dict] = None # 견적서 편집 상태


class EstimateCreate(EstimateBase):
    items: List[EstimateItemCreate]

class EstimateUpdate(BaseModel):
    partner_id: Optional[int] = None
    estimate_date: Optional[date] = None
    valid_until: Optional[date] = None
    total_amount: Optional[float] = None
    note: Optional[str] = None
    attachment_file: Optional[Union[List[Any], str]] = None
    sheet_metadata: Optional[dict] = None
    items: Optional[List[EstimateItemCreate]] = None

class Estimate(EstimateBase):
    id: int
    created_at: datetime
    partner: Optional[Partner] = None
    items: List[EstimateItem] = []

    class Config:
        from_attributes = True

# --- Sales Order Schemas ---

class SalesOrderItemBase(BaseModel):
    product_id: int
    unit_price: float
    quantity: int
    delivered_quantity: int = 0
    note: Optional[str] = None

class SalesOrderItemCreate(SalesOrderItemBase):
    pass

class SalesOrderItemSimple(SalesOrderItemBase):
    id: int
    order_id: int
    delivered_quantity: int
    status: str
    product: Optional[ProductSimple] = None

    class Config:
        from_attributes = True

class SalesOrderItem(SalesOrderItemBase):
    id: int
    order_id: int
    delivered_quantity: int
    status: str
    product: Optional[Product] = None

    class Config:
        from_attributes = True

class SalesOrderBase(BaseModel):
    partner_id: int
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    actual_delivery_date: Optional[date] = None
    delivery_method: Optional[str] = None
    transaction_date: Optional[date] = None
    total_amount: float
    note: Optional[str] = None
    status: Optional[str] = "PENDING"
    attachment_file: Optional[Union[List[Any], str]] = None # JSON list or stringified JSON

class SalesOrderCreate(SalesOrderBase):
    items: List[SalesOrderItemCreate]
    # Optional: create directly from estimate
    from_estimate_id: Optional[int] = None 

class SalesOrderUpdate(BaseModel):
    partner_id: Optional[int] = None
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    actual_delivery_date: Optional[date] = None
    delivery_method: Optional[str] = None
    transaction_date: Optional[date] = None
    total_amount: Optional[float] = None
    note: Optional[str] = None
    status: Optional[str] = None
    attachment_file: Optional[Union[List[Any], str]] = None
    items: Optional[List[SalesOrderItemCreate]] = None

from app.schemas.basics import PartnerResponse as Partner, PartnerSimple

class SalesOrderSimple(SalesOrderBase):
    id: int
    order_no: Optional[str] = None
    created_at: datetime
    partner: Optional[PartnerSimple] = None
    # items removed to prevent deep recursion in ProductionPlan

    class Config:
        from_attributes = True

class SalesOrder(SalesOrderBase):
    id: int
    order_no: Optional[str] = None
    created_at: datetime
    partner: Optional[Partner] = None
    items: List[SalesOrderItem] = []

    class Config:
        from_attributes = True
