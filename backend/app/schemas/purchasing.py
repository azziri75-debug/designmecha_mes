from typing import List, Optional
from datetime import date, datetime
from pydantic import BaseModel
from app.models.purchasing import PurchaseStatus, OutsourcingStatus
from app.schemas.basics import PartnerResponse as Partner
from app.schemas.product import ProductResponse as Product

# --- Purchase Order Items ---
class PurchaseOrderItemBase(BaseModel):
    product_id: int
    quantity: int
    unit_price: float
    note: Optional[str] = None
    production_plan_item_id: Optional[int] = None

class PurchaseOrderItemCreate(PurchaseOrderItemBase):
    pass

class PurchaseOrderItemUpdate(BaseModel):
    id: Optional[int] = None # For identifying item to update
    product_id: Optional[int] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    received_quantity: Optional[int] = None
    note: Optional[str] = None
    production_plan_item_id: Optional[int] = None

class PurchaseOrderItem(PurchaseOrderItemBase):
    id: int
    purchase_order_id: int
    received_quantity: int
    production_plan_item_id: Optional[int] = None
    product: Optional[Product] = None

    class Config:
        from_attributes = True

# --- Purchase Orders ---
class PurchaseOrderBase(BaseModel):
    partner_id: Optional[int] = None
    order_date: date
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: PurchaseStatus = PurchaseStatus.PENDING

class PurchaseOrderCreate(PurchaseOrderBase):
    items: List[PurchaseOrderItemCreate] = []

class PurchaseOrderUpdate(BaseModel):
    partner_id: Optional[int] = None
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: Optional[PurchaseStatus] = None
    items: Optional[List[PurchaseOrderItemUpdate]] = None

class PurchaseOrder(PurchaseOrderBase):
    id: int
    order_no: str
    total_amount: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    partner: Optional[Partner] = None
    items: List[PurchaseOrderItem] = []

    class Config:
        from_attributes = True

# --- Outsourcing Order Items ---
class OutsourcingOrderItemBase(BaseModel):
    production_plan_item_id: Optional[int] = None
    product_id: Optional[int] = None
    quantity: int
    unit_price: float = 0
    note: Optional[str] = None

class OutsourcingOrderItemCreate(OutsourcingOrderItemBase):
    pass

class OutsourcingOrderItemUpdate(BaseModel):
    id: Optional[int] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    note: Optional[str] = None
    status: Optional[OutsourcingStatus] = None

class OutsourcingOrderItem(OutsourcingOrderItemBase):
    id: int
    outsourcing_order_id: int
    status: OutsourcingStatus
    # We might want resolved product name etc.
    product: Optional[Product] = None
    
    class Config:
        from_attributes = True

# --- Outsourcing Orders ---
class OutsourcingOrderBase(BaseModel):
    partner_id: Optional[int] = None
    order_date: date
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: OutsourcingStatus = OutsourcingStatus.PENDING

class OutsourcingOrderCreate(OutsourcingOrderBase):
    items: List[OutsourcingOrderItemCreate] = []

class OutsourcingOrderUpdate(BaseModel):
    partner_id: Optional[int] = None
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: Optional[OutsourcingStatus] = None
    items: Optional[List[OutsourcingOrderItemUpdate]] = None

class OutsourcingOrder(OutsourcingOrderBase):
    id: int
    order_no: str
    total_amount: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    partner: Optional[Partner] = None
    items: List[OutsourcingOrderItem] = []

    class Config:
        from_attributes = True
