from typing import List, Optional, Any, Union
from pydantic import BaseModel
from datetime import date, datetime
from app.schemas.basics import PartnerResponse as Partner
from app.schemas.product import ProductResponse as Product, ProductSimple

# --- Estimate Schemas ---

class EstimateItemBase(BaseModel):
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    unit_price: float
    quantity: float
    note: Optional[str] = None
    specification: Optional[str] = None

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
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    unit_price: float
    quantity: float
    delivered_quantity: float = 0
    note: Optional[str] = None
    specification: Optional[str] = None

class SalesOrderItemCreate(SalesOrderItemBase):
    pass

class SalesOrderItemUpdate(BaseModel):
    id: Optional[int] = None # existing item ID
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    unit_price: Optional[float] = None
    quantity: Optional[float] = None
    delivered_quantity: Optional[float] = 0
    note: Optional[str] = None

class SalesOrderItemSimple(SalesOrderItemBase):
    id: int
    order_id: int
    delivered_quantity: float = 0
    status: str
    product: Optional[ProductSimple] = None

    class Config:
        from_attributes = True

class SalesOrderItem(SalesOrderItemBase):
    id: int
    order_id: int
    delivered_quantity: float = 0
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
    items: Optional[List[SalesOrderItemUpdate]] = None

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
    delivery_histories: List["DeliveryHistory"] = []

    class Config:
        from_attributes = True


# --- Delivery History Schemas ---

class DeliveryHistoryItemBase(BaseModel):
    order_item_id: int
    quantity: int

class DeliveryHistoryItemCreate(DeliveryHistoryItemBase):
    pass

class DeliveryHistoryItem(DeliveryHistoryItemBase):
    id: int
    delivery_id: int
    order_item: Optional[SalesOrderItemSimple] = None
    delivery_amount: float = 0.0

    class Config:
        from_attributes = True

class DeliveryHistoryBase(BaseModel):
    order_id: int
    delivery_date: Optional[date] = None
    delivery_no: Optional[str] = None
    note: Optional[str] = None
    attachment_files: Optional[List[Any]] = None
    statement_json: Optional[dict] = None
    supplier_info: Optional[dict] = None

class DeliveryHistoryCreate(DeliveryHistoryBase):
    items: List[DeliveryHistoryItemCreate]

class DeliveryHistoryUpdate(BaseModel):
    delivery_date: Optional[date] = None
    note: Optional[str] = None
    statement_json: Optional[dict] = None
    supplier_info: Optional[dict] = None
    items: Optional[List[DeliveryHistoryItemCreate]] = None

class DeliveryHistory(DeliveryHistoryBase):
    id: int
    items: List[DeliveryHistoryItem] = []
    delivery_amount: float = 0.0
    class Config:
        from_attributes = True


# --- Delivery Status (lean list view) ---

class DeliveryHistoryForStatus(BaseModel):
    """납품 현황 목록 전용 슬림 스키마 - 깊은 중첩 없이 기본 필드만 포함"""
    id: int
    order_id: int
    delivery_date: Optional[date] = None
    delivery_no: Optional[str] = None
    note: Optional[str] = None
    attachment_files: Optional[List[Any]] = None
    statement_json: Optional[dict] = None
    supplier_info: Optional[dict] = None
    delivery_amount: float = 0.0
    # items: shallow (no product join required for list view)
    items: List[DeliveryHistoryItem] = []

    class Config:
        from_attributes = True


class SalesOrderItemForStatus(BaseModel):
    """납품 현황 목록 전용 수주 항목 슬림 스키마"""
    id: int
    order_id: int
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    unit_price: float
    quantity: float
    delivered_quantity: float = 0
    status: str
    note: Optional[str] = None
    product: Optional[ProductSimple] = None
    specification: Optional[str] = None

    class Config:
        from_attributes = True


class DeliveryStatusResponse(BaseModel):
    """납품 현황 목록 전용 응답 스키마 - 직렬화 오류 방지를 위한 슬림 버전"""
    id: int
    order_no: Optional[str] = None
    partner_id: int
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    actual_delivery_date: Optional[date] = None
    delivery_method: Optional[str] = None
    transaction_date: Optional[date] = None
    total_amount: float
    total_delivered_amount: float = 0.0
    note: Optional[str] = None
    status: Optional[str] = None
    created_at: datetime
    partner: Optional[PartnerSimple] = None
    items: List[SalesOrderItemForStatus] = []
    delivery_histories: List[DeliveryHistoryForStatus] = []

    class Config:
        from_attributes = True
