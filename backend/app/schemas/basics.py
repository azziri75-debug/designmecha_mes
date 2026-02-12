from pydantic import BaseModel, EmailStr
from typing import Optional, List
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

# Staff Schemas
class StaffBase(BaseModel):
    name: str
    role: Optional[str] = None
    main_duty: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True

class StaffCreate(StaffBase):
    pass

class StaffUpdate(StaffBase):
    pass

class StaffResponse(StaffBase):
    id: int

    class Config:
        from_attributes = True
