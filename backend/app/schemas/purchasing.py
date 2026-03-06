from typing import Any, List, Optional
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
    material_requirement_id: Optional[int] = None

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
    material_requirement_id: Optional[int] = None

class PurchaseOrderItem(PurchaseOrderItemBase):
    id: int
    purchase_order_id: int
    received_quantity: Optional[int] = 0
    production_plan_item_id: Optional[int] = None
    material_requirement_id: Optional[int] = None
    product: Optional[Product] = None
    process_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- Purchase Orders ---
class PurchaseOrderBase(BaseModel):
    partner_id: Optional[int] = None
    order_id: Optional[int] = None
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: Optional[PurchaseStatus] = PurchaseStatus.PENDING
    purchase_type: Optional[str] = "PART" # PART, CONSUMABLE

class PurchaseOrderCreate(PurchaseOrderBase):
    items: List[PurchaseOrderItemCreate] = []

class PurchaseOrderUpdate(BaseModel):
    partner_id: Optional[int] = None
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: Optional[PurchaseStatus] = None
    purchase_type: Optional[str] = None
    attachment_file: Optional[Any] = None
    items: Optional[List[PurchaseOrderItemUpdate]] = None

class PurchaseOrder(PurchaseOrderBase):
    id: int
    order_no: str
    purchase_type: Optional[str] = "PART"
    total_amount: Optional[float] = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    partner: Optional[Partner] = None
    items: List[PurchaseOrderItem] = []
    attachment_file: Optional[Any] = None
    order: Optional[Any] = None
    related_sales_order_info: Optional[str] = None
    related_customer_names: Optional[str] = None

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
    product_id: Optional[int] = None
    production_plan_item_id: Optional[int] = None
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    note: Optional[str] = None
    status: Optional[OutsourcingStatus] = None

class OutsourcingOrderItem(OutsourcingOrderItemBase):
    id: int
    outsourcing_order_id: int
    status: Optional[OutsourcingStatus] = None
    # We might want resolved product name etc.
    product: Optional[Product] = None
    process_name: Optional[str] = None
    
    class Config:
        from_attributes = True

# --- Outsourcing Orders ---
class OutsourcingOrderBase(BaseModel):
    partner_id: Optional[int] = None
    order_id: Optional[int] = None
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: Optional[OutsourcingStatus] = OutsourcingStatus.PENDING

class OutsourcingOrderCreate(OutsourcingOrderBase):
    items: List[OutsourcingOrderItemCreate] = []

class OutsourcingOrderUpdate(BaseModel):
    partner_id: Optional[int] = None
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    status: Optional[OutsourcingStatus] = None
    attachment_file: Optional[Any] = None
    items: Optional[List[OutsourcingOrderItemUpdate]] = None

class OutsourcingOrder(OutsourcingOrderBase):
    id: int
    order_no: str
    total_amount: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    partner: Optional[Partner] = None
    items: List[OutsourcingOrderItem] = []
    attachment_file: Optional[Any] = None
    order: Optional[Any] = None # Include sales order details if needed
    related_sales_order_info: Optional[str] = None
    related_customer_names: Optional[str] = None

    class Config:
        from_attributes = True

# --- Simple Schemas for Production Plan Response ---
class PurchaseOrderSimple(BaseModel):
    id: int
    order_no: str
    status: PurchaseStatus
    
    class Config:
        from_attributes = True

class PurchaseOrderItemSimple(BaseModel):
    id: int
    purchase_order_id: int
    status: Optional[str] = None 
    purchase_order: Optional[PurchaseOrderSimple] = None

    class Config:
        from_attributes = True

class OutsourcingOrderSimple(BaseModel):
    id: int
    order_no: str
    status: OutsourcingStatus

    class Config:
        from_attributes = True

class OutsourcingOrderItemSimple(BaseModel):
    id: int
    outsourcing_order_id: int
    status: Optional[str] = None
    outsourcing_order: Optional[OutsourcingOrderSimple] = None

    class Config:
        from_attributes = True

# --- MRP Schemas ---
class MRPRequirement(BaseModel):
    product_id: int
    product_name: str
    specification: str
    item_type: str
    total_demand: int
    current_stock: int
    open_purchase_qty: int
    required_purchase_qty: int

    class Config:
        from_attributes = True

class MaterialRequirementBase(BaseModel):
    product_id: int
    order_id: Optional[int] = None
    required_quantity: int
    current_stock: int = 0
    open_purchase_qty: int = 0
    shortage_quantity: int
    status: str = "PENDING"

class MaterialRequirementResponse(MaterialRequirementBase):
    id: int
    created_at: datetime
    product: Optional[Product] = None
    product_name: Optional[str] = None
    specification: Optional[str] = None
    item_type: Optional[str] = None

    class Config:
        from_attributes = True
