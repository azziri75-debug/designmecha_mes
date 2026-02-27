from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from typing import List, Optional
from pydantic import BaseModel

from app.api.deps import get_db
from app.models.basics import Partner, Staff, Contact, Company, Equipment, EquipmentHistory, FormTemplate, MeasuringInstrument, MeasurementHistory
from app.schemas.basics import (
    PartnerCreate, PartnerResponse, PartnerUpdate,
    StaffCreate, StaffResponse, StaffUpdate,
    ContactCreate, ContactResponse, ContactUpdate,
    CompanyCreate, CompanyResponse, CompanyUpdate,
    EquipmentCreate, EquipmentResponse, EquipmentUpdate, EquipmentHistoryCreate, EquipmentHistoryResponse,
    FormTemplateCreate, FormTemplateResponse, FormTemplateUpdate,
    MeasuringInstrumentCreate, MeasuringInstrumentResponse, MeasuringInstrumentUpdate,
    MeasurementHistoryCreate, MeasurementHistoryResponse
)
from dateutil.relativedelta import relativedelta

router = APIRouter()

# --- Login ---
class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(
    req: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Staff).where(Staff.name == req.username))
    staff = result.scalar_one_or_none()
    
    if not staff:
        raise HTTPException(status_code=401, detail="사원 이름이 존재하지 않습니다.")
    if not staff.is_active:
        raise HTTPException(status_code=401, detail="비활성화된 계정입니다.")
    if staff.password != req.password:
        raise HTTPException(status_code=401, detail="비밀번호가 일치하지 않습니다.")
    
    # Return staff info (no JWT for simplicity)
    return {
        "id": staff.id,
        "name": staff.name,
        "role": staff.role,
        "user_type": staff.user_type or "USER",
        "menu_permissions": staff.menu_permissions or [],
        "message": "로그인 성공"
    }

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
        if key in ["attachment_file", "partner_type"]:
            flag_modified(partner, key)
    
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

# --- Equipment Endpoints ---

@router.get("/equipments/", response_model=List[EquipmentResponse])
async def read_equipments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Equipment).options(selectinload(Equipment.history)))
    return result.scalars().all()

@router.post("/equipments/", response_model=EquipmentResponse)
async def create_equipment(eq_in: EquipmentCreate, db: AsyncSession = Depends(get_db)):
    new_eq = Equipment(**eq_in.model_dump())
    db.add(new_eq)
    await db.commit()
    
    # Reload with history for serialization
    result = await db.execute(
        select(Equipment)
        .options(selectinload(Equipment.history))
        .where(Equipment.id == new_eq.id)
    )
    return result.scalar_one()

@router.put("/equipments/{eq_id}", response_model=EquipmentResponse)
async def update_equipment(eq_id: int, eq_in: EquipmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Equipment).where(Equipment.id == eq_id))
    eq = result.scalar_one_or_none()
    if not eq: raise HTTPException(status_code=404)
    for k, v in eq_in.model_dump(exclude_unset=True).items():
        setattr(eq, k, v)
    await db.commit()
    
    # Reload with history
    result = await db.execute(
        select(Equipment)
        .options(selectinload(Equipment.history))
        .where(Equipment.id == eq_id)
    )
    return result.scalar_one()

@router.delete("/equipments/{eq_id}")
async def delete_equipment(eq_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Equipment).where(Equipment.id == eq_id))
    eq = result.scalar_one_or_none()
    if not eq: raise HTTPException(status_code=404)
    await db.delete(eq)
    await db.commit()
    return {"status": "success"}

@router.post("/equipments/{eq_id}/history", response_model=EquipmentHistoryResponse)
async def create_equipment_history(eq_id: int, h_in: EquipmentHistoryCreate, db: AsyncSession = Depends(get_db)):
    new_h = EquipmentHistory(**h_in.model_dump(), equipment_id=eq_id)
    db.add(new_h)
    await db.commit()
    await db.refresh(new_h)
    return new_h

@router.put("/equipments/{eq_id}/history/{h_id}", response_model=EquipmentHistoryResponse)
async def update_equipment_history(eq_id: int, h_id: int, h_in: EquipmentHistoryCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EquipmentHistory).where(EquipmentHistory.id == h_id, EquipmentHistory.equipment_id == eq_id))
    h = result.scalar_one_or_none()
    if not h: raise HTTPException(status_code=404, detail="History not found")
    
    for k, v in h_in.model_dump(exclude_unset=True).items():
        setattr(h, k, v)
        if k == "attachment_file":
            flag_modified(h, k)
            
    await db.commit()
    await db.refresh(h)
    return h

@router.delete("/equipments/{eq_id}/history/{h_id}")
async def delete_equipment_history(eq_id: int, h_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EquipmentHistory).where(EquipmentHistory.id == h_id, EquipmentHistory.equipment_id == eq_id))
    h = result.scalar_one_or_none()
    if not h: raise HTTPException(status_code=404, detail="History not found")
    
    await db.delete(h)
    await db.commit()
    return {"status": "success"}

# --- Form Template Endpoints ---

@router.get("/form-templates/", response_model=List[FormTemplateResponse])
async def read_form_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FormTemplate))
    return result.scalars().all()

@router.get("/form-templates/{form_type}", response_model=FormTemplateResponse)
async def read_form_template(form_type: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FormTemplate).where(FormTemplate.form_type == form_type))
    template = result.scalar_one_or_none()
    if not template: raise HTTPException(status_code=404)
    return template

@router.post("/form-templates/", response_model=FormTemplateResponse)
async def create_or_update_form_template(tm_in: FormTemplateCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FormTemplate).where(FormTemplate.form_type == tm_in.form_type))
    existing = result.scalar_one_or_none()
    if existing:
        for k, v in tm_in.model_dump(exclude_unset=True).items():
            setattr(existing, k, v)
        await db.commit()
        await db.refresh(existing)
        return existing
    else:
        new_tm = FormTemplate(**tm_in.model_dump())
        db.add(new_tm)
        await db.commit()
        await db.refresh(new_tm)
        return new_tm

# --- Measuring Instrument Endpoints ---

async def update_next_calibration_date(instrument_id: int, db: AsyncSession):
    # Find latest CALIBRATION history
    result = await db.execute(
        select(MeasurementHistory)
        .where(MeasurementHistory.instrument_id == instrument_id, MeasurementHistory.history_type == 'CALIBRATION')
        .order_by(MeasurementHistory.history_date.desc())
        .limit(1)
    )
    latest_cal = result.scalar_one_or_none()
    
    inst_result = await db.execute(select(MeasuringInstrument).where(MeasuringInstrument.id == instrument_id))
    inst = inst_result.scalar_one_or_none()
    
    if inst and latest_cal and inst.calibration_cycle_months:
        inst.next_calibration_date = latest_cal.history_date + relativedelta(months=inst.calibration_cycle_months)
        await db.commit()

@router.get("/instruments/", response_model=List[MeasuringInstrumentResponse])
async def read_instruments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeasuringInstrument).options(selectinload(MeasuringInstrument.history)))
    return result.scalars().all()

@router.post("/instruments/", response_model=MeasuringInstrumentResponse)
async def create_instrument(inst_in: MeasuringInstrumentCreate, db: AsyncSession = Depends(get_db)):
    new_inst = MeasuringInstrument(**inst_in.model_dump())
    db.add(new_inst)
    await db.commit()
    
    result = await db.execute(
        select(MeasuringInstrument)
        .options(selectinload(MeasuringInstrument.history))
        .where(MeasuringInstrument.id == new_inst.id)
    )
    return result.scalar_one()

@router.put("/instruments/{inst_id}", response_model=MeasuringInstrumentResponse)
async def update_instrument(inst_id: int, inst_in: MeasuringInstrumentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeasuringInstrument).where(MeasuringInstrument.id == inst_id))
    inst = result.scalar_one_or_none()
    if not inst: raise HTTPException(status_code=404, detail="Instrument not found")
    
    for k, v in inst_in.model_dump(exclude_unset=True).items():
        setattr(inst, k, v)
    await db.commit()
    await update_next_calibration_date(inst_id, db)
    
    result = await db.execute(
        select(MeasuringInstrument)
        .options(selectinload(MeasuringInstrument.history))
        .where(MeasuringInstrument.id == inst_id)
    )
    return result.scalar_one()

@router.delete("/instruments/{inst_id}")
async def delete_instrument(inst_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeasuringInstrument).where(MeasuringInstrument.id == inst_id))
    inst = result.scalar_one_or_none()
    if not inst: raise HTTPException(status_code=404, detail="Instrument not found")
    
    await db.delete(inst)
    await db.commit()
    return {"status": "success"}

# --- Measurement History Endpoints ---

@router.post("/instruments/{inst_id}/history", response_model=MeasurementHistoryResponse)
async def create_instrument_history(inst_id: int, h_in: MeasurementHistoryCreate, db: AsyncSession = Depends(get_db)):
    new_h = MeasurementHistory(**h_in.model_dump(), instrument_id=inst_id)
    db.add(new_h)
    await db.commit()
    await db.refresh(new_h)
    
    if new_h.history_type == 'CALIBRATION':
        await update_next_calibration_date(inst_id, db)
        
    return new_h

@router.put("/instruments/{inst_id}/history/{h_id}", response_model=MeasurementHistoryResponse)
async def update_instrument_history(inst_id: int, h_id: int, h_in: MeasurementHistoryCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeasurementHistory).where(MeasurementHistory.id == h_id, MeasurementHistory.instrument_id == inst_id))
    h = result.scalar_one_or_none()
    if not h: raise HTTPException(status_code=404, detail="History not found")
    
    for k, v in h_in.model_dump(exclude_unset=True).items():
        setattr(h, k, v)
        if k == "attachment_file":
            flag_modified(h, k)
            
    await db.commit()
    await db.refresh(h)
    
    if h.history_type == 'CALIBRATION' or 'history_type' in h_in.model_dump(exclude_unset=True):
        await update_next_calibration_date(inst_id, db)
        
    return h

@router.delete("/instruments/{inst_id}/history/{h_id}")
async def delete_instrument_history(inst_id: int, h_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeasurementHistory).where(MeasurementHistory.id == h_id, MeasurementHistory.instrument_id == inst_id))
    h = result.scalar_one_or_none()
    if not h: raise HTTPException(status_code=404, detail="History not found")
    
    was_calibration = h.history_type == 'CALIBRATION'
    await db.delete(h)
    await db.commit()
    
    if was_calibration:
        await update_next_calibration_date(inst_id, db)
        
    return {"status": "success"}
