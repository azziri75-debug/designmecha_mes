from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ProductGroup Schemas
class ProductGroupBase(BaseModel):
    name: str
    type: str # 'MAJOR' or 'MINOR'
    parent_id: Optional[int] = None
    description: Optional[str] = None

class ProductGroupCreate(ProductGroupBase):
    pass

class ProductGroupUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    parent_id: Optional[int] = None
    description: Optional[str] = None

class ProductGroupResponse(ProductGroupBase):
    id: int
    
    class Config:
        from_attributes = True

# Process Schemas
class ProcessBase(BaseModel):
    group_id: Optional[int] = None
    name: str
    course_type: str = "INTERNAL" # INTERNAL, OUTSOURCING, PURCHASE
    description: Optional[str] = None

class ProcessCreate(ProcessBase):
    major_group_id: Optional[int] = None  # UI only - not stored in Process model, only group_id (minor) is stored

class ProcessUpdate(ProcessBase):
    pass

class ProcessResponse(ProcessBase):
    id: int

    class Config:
        from_attributes = True

class ProcessQuickCreate(BaseModel):
    name: str
    course_type: str
    major_group_id: Optional[int] = None
    group_id: Optional[int] = None

# Product Process (Routing) Schemas
class ProductProcessBase(BaseModel):
    process_id: Optional[int] = None
    sequence: int
    estimated_time: Optional[float] = None
    notes: Optional[str] = None
    partner_name: Optional[str] = None
    equipment_name: Optional[str] = None
    attachment_file: Optional[str] = None
    course_type: Optional[str] = None
    cost: Optional[float] = 0.0

class ProductProcessCreate(ProductProcessBase):
    pass

class ProductProcessResponse(ProductProcessBase):
    id: int
    product_id: int
    process: Optional[ProcessResponse] = None

    class Config:
        from_attributes = True

# BOM Schemas
class ProductSimpleForBOM(BaseModel):
    id: int
    name: str
    specification: Optional[str] = None
    unit: Optional[str] = "EA"
    item_type: Optional[str] = None

    class Config:
        from_attributes = True

class BOMItemCreate(BaseModel):
    child_product_id: int
    required_quantity: float = 1.0

class BOMItemResponse(BaseModel):
    id: int
    parent_product_id: int
    child_product_id: int
    required_quantity: float
    child_product: Optional[ProductSimpleForBOM] = None

    class Config:
        from_attributes = True

# Product Schemas
class ProductBase(BaseModel):
    group_id: Optional[int] = None
    partner_id: Optional[int] = None
    name: str
    specification: Optional[str] = None
    material: Optional[str] = None
    unit: str = "EA"
    drawing_file: Optional[str] = None
    note: Optional[str] = None
    item_type: Optional[str] = None  # PRODUCED, PART, CONSUMABLE
    recent_price: Optional[float] = 0.0 # 구매 시 자동 갱신되는 단가
    price_currency: str = 'KRW' # 단가 통화 (KRW/USD)

class ProductCreate(ProductBase):
    standard_processes: List[ProductProcessCreate] = []

class ProductUpdate(BaseModel):
    group_id: Optional[int] = None
    partner_id: Optional[int] = None
    name: Optional[str] = None
    specification: Optional[str] = None
    material: Optional[str] = None
    unit: Optional[str] = None
    drawing_file: Optional[str] = None
    note: Optional[str] = None
    item_type: Optional[str] = None
    standard_processes: Optional[List[ProductProcessCreate]] = None
    recent_price: Optional[float] = None
    price_currency: Optional[str] = None

class ProductSimple(ProductBase):
    id: int
    
    class Config:
        from_attributes = True

class ProductResponse(ProductBase):
    id: int
    standard_processes: List[ProductProcessResponse] = []
    bom_items: List[BOMItemResponse] = []
    current_inventory: int = 0 # Computed field
    latest_price: float = 0.0 # Latest quotation/order price
    partner_name: Optional[str] = None
    price_history: List["ProductPriceHistoryResponse"] = []

    class Config:
        from_attributes = True

class ProductPriceHistoryCreate(BaseModel):
    product_id: int
    price: float
    currency: str = 'KRW'
    note: Optional[str] = None
    type: str = "MANUAL"

class ProductPriceHistoryResponse(ProductPriceHistoryCreate):
    id: int
    date: datetime

    class Config:
        from_attributes = True

class ProductPriceHistory(BaseModel):
    date: str
    type: str # "QUOTATION" or "ORDER"
    partner_name: str
    quantity: int
    unit_price: float
    total_amount: float
    order_no: Optional[str] = None

class ProcessCostHistory(BaseModel):
    date: str
    partner_name: Optional[str] = None
    unit_price: float
    source: str # "PURCHASE" or "OUTSOURCING"

class CloneToTargetsRequest(BaseModel):
    target_product_ids: List[int]
