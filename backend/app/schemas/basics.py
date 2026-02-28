from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime
from app.models.basics import PartnerType

# Contact Schemas
class ContactBase(BaseModel):
    name: str
    position: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[EmailStr] = None

class ContactCreate(ContactBase):
    pass

class ContactUpdate(ContactBase):
    pass

class ContactResponse(ContactBase):
    id: int
    partner_id: int

    class Config:
        from_attributes = True

# Partner Schemas
class PartnerBase(BaseModel):
    name: str
    partner_type: List[str] = ["CUSTOMER"]
    registration_number: Optional[str] = None
    representative: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    attachment_file: Optional[List[dict]] = None # List of {name, url}

class PartnerCreate(PartnerBase):
    contacts: List[ContactCreate] = []

class PartnerUpdate(PartnerBase):
    pass

class PartnerResponse(PartnerBase):
    id: int
    contacts: List[ContactResponse] = []

    class Config:
        from_attributes = True

class PartnerSimple(BaseModel):
    id: int
    name: str
    partner_type: List[str]
    
    class Config:
        from_attributes = True

# Staff Schemas
class StaffBase(BaseModel):
    name: str
    role: Optional[str] = None
    main_duty: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True
    user_type: Optional[str] = "USER"  # ADMIN or USER
    password: Optional[str] = None
    menu_permissions: Optional[List[str]] = []
    stamp_image: Optional[dict] = None # {name, url}
class StaffSimple(StaffBase):
    id: int
    class Config:
        from_attributes = True

class StaffCreate(StaffBase):
    pass

class StaffUpdate(StaffBase):
    pass

class StaffResponse(StaffBase):
    id: int

    class Config:
        from_attributes = True

# Company Schemas
class CompanyBase(BaseModel):
    name: str
    owner_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[EmailStr] = None
    registration_number: Optional[str] = None
    logo_image: Optional[dict] = None
    stamp_image: Optional[dict] = None

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(CompanyBase):
    pass

class CompanyResponse(CompanyBase):
    id: int

    class Config:
        from_attributes = True

# Equipment Schemas
class EquipmentHistoryBase(BaseModel):
    history_date: Optional[date] = None
    history_type: str
    description: str
    cost: Optional[float] = 0.0
    worker_name: Optional[str] = None
    attachment_file: Optional[List[dict]] = None

class EquipmentHistoryCreate(EquipmentHistoryBase):
    pass

class EquipmentHistoryResponse(EquipmentHistoryBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class EquipmentBase(BaseModel):
    name: str
    code: Optional[str] = None
    spec: Optional[str] = None
    process_id: Optional[int] = None
    status: Optional[str] = "IDLE"
    purchase_date: Optional[date] = None
    location: Optional[str] = None
    is_active: bool = True

class EquipmentSimple(EquipmentBase):
    id: int
    class Config:
        from_attributes = True

class EquipmentCreate(EquipmentBase):
    pass

class EquipmentUpdate(EquipmentBase):
    pass

class EquipmentResponse(EquipmentBase):
    id: int
    history: List[EquipmentHistoryResponse] = []
    class Config:
        from_attributes = True

# FormTemplate Schemas
class FormTemplateBase(BaseModel):
    form_type: str
    name: str
    layout_data: dict
    is_active: bool = True

class FormTemplateCreate(FormTemplateBase):
    pass

class FormTemplateUpdate(BaseModel):
    name: Optional[str] = None
    layout_data: Optional[dict] = None
    is_active: Optional[bool] = None

class FormTemplateResponse(FormTemplateBase):
    id: int
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# Measuring Instrument Schemas
class MeasurementHistoryBase(BaseModel):
    history_date: Optional[date] = None
    history_type: str
    description: str
    cost: Optional[float] = 0.0
    worker_name: Optional[str] = None
    attachment_file: Optional[List[dict]] = None

class MeasurementHistoryCreate(MeasurementHistoryBase):
    pass

class MeasurementHistoryResponse(MeasurementHistoryBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class MeasuringInstrumentBase(BaseModel):
    name: str
    code: Optional[str] = None
    spec: Optional[str] = None
    serial_number: Optional[str] = None
    calibration_cycle_months: Optional[int] = 12
    next_calibration_date: Optional[date] = None
    is_active: bool = True

class MeasuringInstrumentSimple(MeasuringInstrumentBase):
    id: int
    class Config:
        from_attributes = True

class MeasuringInstrumentCreate(MeasuringInstrumentBase):
    pass

class MeasuringInstrumentUpdate(MeasuringInstrumentBase):
    pass

class MeasuringInstrumentResponse(MeasuringInstrumentBase):
    id: int
    history: List[MeasurementHistoryResponse] = []
    class Config:
        from_attributes = True
