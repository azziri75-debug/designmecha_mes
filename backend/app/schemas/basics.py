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
