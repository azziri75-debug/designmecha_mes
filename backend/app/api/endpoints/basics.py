from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.api.deps import get_db
from app.models.basics import Partner, Staff
from app.schemas.basics import PartnerCreate, PartnerResponse, StaffCreate, StaffResponse, StaffUpdate, PartnerUpdate

router = APIRouter()

# --- Partner Endpoints ---
@router.post("/partners/", response_model=PartnerResponse)
async def create_partner(
    partner: PartnerCreate,
    db: AsyncSession = Depends(get_db)
):
    try:
        data = partner.model_dump()
        # Remove contacts if it's an empty list to avoid SQLAlchemy issues with Pydantic relation mapping
        if 'contacts' in data and not data['contacts']:
            del data['contacts']
            
        new_partner = Partner(**data)
        db.add(new_partner)
        await db.commit()

        # Re-fetch with eager loading
        result = await db.execute(
            select(Partner)
            .options(selectinload(Partner.contacts))
            .where(Partner.id == new_partner.id)
        )
        created_partner = result.scalar_one()
        return created_partner
    except Exception as e:
        import traceback
        error_msg = f"Error creating partner: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        with open("backend_error.log", "a", encoding="utf-8") as f:
            f.write(error_msg + "\n")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/partners/", response_model=List[PartnerResponse])
async def read_partners(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Partner).options(selectinload(Partner.contacts)).offset(skip).limit(limit))
    partners = result.scalars().all()
    return partners

@router.put("/partners/{partner_id}", response_model=PartnerResponse)
async def update_partner(
    partner_id: int,
    partner_update: PartnerUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    for key, value in partner_update.model_dump(exclude_unset=True).items():
        setattr(partner, key, value)
    
    await db.commit()
    await db.refresh(partner)
    return partner

@router.delete("/partners/{partner_id}")
async def delete_partner(
    partner_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    await db.delete(partner)
    await db.commit()
    return {"message": "Partner deleted successfully"}

# --- Staff Endpoints ---
@router.post("/staff/", response_model=StaffResponse)
async def create_staff(
    staff: StaffCreate,
    db: AsyncSession = Depends(get_db)
):
    new_staff = Staff(**staff.model_dump())
    db.add(new_staff)
    await db.commit()
    await db.refresh(new_staff)
    return new_staff

@router.get("/staff/", response_model=List[StaffResponse])
async def read_staff(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Staff).offset(skip).limit(limit))
    staff_list = result.scalars().all()
    return staff_list

@router.put("/staff/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: int,
    staff_update: StaffUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    for key, value in staff_update.model_dump(exclude_unset=True).items():
        setattr(staff, key, value)
    
    await db.commit()
    await db.refresh(staff)
    return staff

@router.delete("/staff/{staff_id}")
async def delete_staff(
    staff_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    await db.delete(staff)
    await db.commit()
    return {"message": "Staff deleted successfully"}

# --- Contact Endpoints ---
from app.models.basics import Contact
from app.schemas.basics import ContactCreate, ContactResponse, ContactUpdate

@router.post("/contacts/", response_model=ContactResponse)
async def create_contact(
    contact: ContactCreate,
    partner_id: int, 
    db: AsyncSession = Depends(get_db)
):
    # Note: partner_id might need to be passed in body or query, 
    # but strictly following schema ContactCreate doesn't have it.
    # Actually, ContactCreate DOES NOT have partner_id.
    # We should probably pass partner_id as a query param or change schema.
    # For now, let's assume it's passed as query param `partner_id`.
    
    new_contact = Contact(**contact.model_dump(), partner_id=partner_id)
    db.add(new_contact)
    await db.commit()
    await db.refresh(new_contact)
    return new_contact

@router.put("/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    contact_update: ContactUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    for key, value in contact_update.model_dump(exclude_unset=True).items():
        setattr(contact, key, value)
    
    await db.commit()
    await db.refresh(contact)
    return contact

@router.delete("/contacts/{contact_id}")
async def delete_contact(
    contact_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    await db.delete(contact)
    await db.commit()
    return {"message": "Contact deleted successfully"}

# --- Company Endpoints ---
from app.models.basics import Company
from app.schemas.basics import CompanyCreate, CompanyResponse, CompanyUpdate

@router.get("/company", response_model=Optional[CompanyResponse])
async def read_company(
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Company).limit(1))
    company = result.scalar_one_or_none()
    return company

@router.post("/company", response_model=CompanyResponse)
async def create_or_update_company(
    company_in: CompanyCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if company exists
    result = await db.execute(select(Company).limit(1))
    existing_company = result.scalar_one_or_none()

    if existing_company:
        # Update
        for key, value in company_in.model_dump(exclude_unset=True).items():
            setattr(existing_company, key, value)
        await db.commit()
        await db.refresh(existing_company)
        return existing_company
    else:
        # Create
        new_company = Company(**company_in.model_dump())
        db.add(new_company)
        await db.commit()
        await db.refresh(new_company)
        return new_company
