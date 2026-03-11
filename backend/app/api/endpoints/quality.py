from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc
import shutil
import os
import uuid

from app.api import deps
from app.models.quality import CustomerComplaint, ComplaintStatus, QualityDefect
from app.schemas import quality as schemas
from datetime import datetime

router = APIRouter()

# Use absolute path based on project root for uploads
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
UPLOAD_DIR = os.path.join(_BASE_DIR, "uploads", "quality")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# --- Quality Defect Endpoints ---

@router.get("/defects/", response_model=List[schemas.QualityDefectResponse])
async def read_defects(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(QualityDefect).options(
        selectinload(QualityDefect.order),
        selectinload(QualityDefect.plan),
        selectinload(QualityDefect.plan_item)
    ).order_by(desc(QualityDefect.defect_date)).offset(skip).limit(limit)
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/defects/", response_model=schemas.QualityDefectResponse)
async def create_defect(
    defect_in: schemas.QualityDefectCreate,
    db: AsyncSession = Depends(deps.get_db)
):
    db_defect = QualityDefect(**defect_in.model_dump())
    if not db_defect.defect_date:
        db_defect.defect_date = datetime.now()
        
    db.add(db_defect)
    await db.commit()
    await db.refresh(db_defect)
    
    # Reload with relations
    query = select(QualityDefect).options(
        selectinload(QualityDefect.order),
        selectinload(QualityDefect.plan),
        selectinload(QualityDefect.plan_item)
    ).where(QualityDefect.id == db_defect.id)
    res = await db.execute(query)
    return res.scalar_one()

@router.put("/defects/{defect_id}", response_model=schemas.QualityDefectResponse)
async def update_defect(
    defect_id: int,
    defect_in: schemas.QualityDefectUpdate,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(QualityDefect).where(QualityDefect.id == defect_id)
    res = await db.execute(query)
    db_defect = res.scalar_one_or_none()
    if not db_defect:
        raise HTTPException(status_code=404, detail="Defect not found")

    update_data = defect_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_defect, field, value)

    await db.commit()
    await db.refresh(db_defect)
    
    # Reload with relations
    query = select(QualityDefect).options(
        selectinload(QualityDefect.order),
        selectinload(QualityDefect.plan),
        selectinload(QualityDefect.plan_item)
    ).where(QualityDefect.id == db_defect.id)
    res = await db.execute(query)
    return res.scalar_one()

@router.delete("/defects/{defect_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_defect(
    defect_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(QualityDefect).where(QualityDefect.id == defect_id)
    res = await db.execute(query)
    db_defect = res.scalar_one_or_none()
    if not db_defect:
        raise HTTPException(status_code=404, detail="Defect not found")
        
    await db.delete(db_defect)
    await db.commit()
    return None

@router.post("/upload/", response_model=dict)
async def upload_quality_file(file: UploadFile = File(...)):
    try:
        # Generate unique filename
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        current_date = datetime.now().strftime("%Y%m%d")
        
        # Create date-based subdirectory
        save_dir = os.path.join(UPLOAD_DIR, current_date)
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
            
        file_path = os.path.join(save_dir, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Return the relative path
        relative_path = os.path.join("quality", current_date, unique_filename).replace("\\", "/")
        return {"filename": file.filename, "url": f"/static/{relative_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Customer Complaint Endpoints ---

@router.post("/", response_model=schemas.CustomerComplaintResponse)
async def create_complaint(
    complaint_in: schemas.CustomerComplaintCreate,
    db: AsyncSession = Depends(deps.get_db)
):
    db_complaint = CustomerComplaint(**complaint_in.model_dump())
    db.add(db_complaint)
    await db.commit()
    await db.refresh(db_complaint)
    
    # Reload with relations
    query = select(CustomerComplaint).options(
        selectinload(CustomerComplaint.partner),
        selectinload(CustomerComplaint.order)
    ).where(CustomerComplaint.id == db_complaint.id)
    res = await db.execute(query)
    return res.scalar_one()

@router.get("/", response_model=List[schemas.CustomerComplaintResponse])
async def read_complaints(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    partner_id: Optional[int] = None,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(CustomerComplaint).options(
        selectinload(CustomerComplaint.partner),
        selectinload(CustomerComplaint.order)
    )
    if status:
        query = query.where(CustomerComplaint.status == status)
    if partner_id:
        query = query.where(CustomerComplaint.partner_id == partner_id)
        
    query = query.order_by(desc(CustomerComplaint.receipt_date)).offset(skip).limit(limit)
    res = await db.execute(query)
    return res.scalars().all()

@router.get("/{complaint_id}", response_model=schemas.CustomerComplaintResponse)
async def read_complaint(
    complaint_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(CustomerComplaint).options(
        selectinload(CustomerComplaint.partner),
        selectinload(CustomerComplaint.order),
        selectinload(CustomerComplaint.delivery_history)
    ).where(CustomerComplaint.id == complaint_id)
    res = await db.execute(query)
    db_complaint = res.scalar_one_or_none()
    if not db_complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return db_complaint

@router.put("/{complaint_id}", response_model=schemas.CustomerComplaintResponse)
async def update_complaint(
    complaint_id: int,
    complaint_in: schemas.CustomerComplaintUpdate,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(CustomerComplaint).where(CustomerComplaint.id == complaint_id)
    res = await db.execute(query)
    db_complaint = res.scalar_one_or_none()
    if not db_complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    update_data = complaint_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_complaint, field, value)

    await db.commit()
    await db.refresh(db_complaint)
    
    # Reload with relations
    query = select(CustomerComplaint).options(
        selectinload(CustomerComplaint.partner),
        selectinload(CustomerComplaint.order)
    ).where(CustomerComplaint.id == db_complaint.id)
    res = await db.execute(query)
    return res.scalar_one()

@router.delete("/{complaint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_complaint(
    complaint_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(CustomerComplaint).where(CustomerComplaint.id == complaint_id)
    res = await db.execute(query)
    db_complaint = res.scalar_one_or_none()
    if not db_complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
        
    await db.delete(db_complaint)
    await db.commit()
    return None
