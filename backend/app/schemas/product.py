from pydantic import BaseModel
from typing import Optional, List

# Process Schemas
class ProcessBase(BaseModel):
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
    partner_id: Optional[int] = None
    name: str
    specification: Optional[str] = None
    material: Optional[str] = None
    unit: str = "EA"
    unit: str = "EA"
    drawing_file: Optional[str] = None
    note: Optional[str] = None

class ProductCreate(ProductBase):
    standard_processes: List[ProductProcessCreate] = []

class ProductUpdate(BaseModel):
    partner_id: Optional[int] = None
    name: Optional[str] = None
    specification: Optional[str] = None
    material: Optional[str] = None
    unit: Optional[str] = None
    drawing_file: Optional[str] = None
    note: Optional[str] = None
    standard_processes: Optional[List[ProductProcessCreate]] = None

class ProductResponse(ProductBase):
    id: int
    standard_processes: List[ProductProcessResponse] = []
    current_inventory: int = 0 # Computed field

    class Config:
        from_attributes = True
