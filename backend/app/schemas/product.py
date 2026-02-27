from pydantic import BaseModel
from typing import Optional, List

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
    pass

class ProcessUpdate(ProcessBase):
    pass

class ProcessResponse(ProcessBase):
    id: int

    class Config:
        from_attributes = True

# Product Process (Routing) Schemas
class ProductProcessBase(BaseModel):
    process_id: int
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
    process: ProcessResponse

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
    standard_processes: Optional[List[ProductProcessCreate]] = None

class ProductSimple(ProductBase):
    id: int
    
    class Config:
        from_attributes = True

class ProductResponse(ProductBase):
    id: int
    standard_processes: List[ProductProcessResponse] = []
    current_inventory: int = 0 # Computed field

    class Config:
        from_attributes = True
