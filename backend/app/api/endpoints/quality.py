from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
import shutil
import os
from datetime import datetime

from app.api.deps import get_db
from app.models.quality import InspectionResult, Attachment, QualityDefect
from app.schemas.quality import (
    InspectionResultCreate, InspectionResultResponse, AttachmentResponse,
    QualityDefectCreate, QualityDefectResponse, QualityDefectUpdate
)
from sqlalchemy import desc, or_, and_

# --- ... existing code ...

# --- Quality Defects ---

@router.post("/defects/", response_model=QualityDefectResponse)
async def create_defect(
    defect_in: QualityDefectCreate,
    db: AsyncSession = Depends(get_db)
):
    new_defect = QualityDefect(**defect_in.model_dump())
    db.add(new_defect)
    await db.commit()
    await db.refresh(new_defect)
    
    # Eager load for response
    query = select(QualityDefect).options(
        selectinload(QualityDefect.order),
        selectinload(QualityDefect.plan),
        selectinload(QualityDefect.plan_item)
    ).where(QualityDefect.id == new_defect.id)
    result = await db.execute(query)
    return result.scalar_one()

@router.get("/defects/", response_model=List[QualityDefectResponse])
async def read_defects(
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(QualityDefect).options(
        selectinload(QualityDefect.order),
        selectinload(QualityDefect.plan),
        selectinload(QualityDefect.plan_item)
    )
    
    if status:
        query = query.where(QualityDefect.status == status)
    
    if start_date:
        query = query.where(QualityDefect.defect_date >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.where(QualityDefect.defect_date <= datetime.combine(end_date, datetime.max.time()))
        
    query = query.order_by(desc(QualityDefect.defect_date))
    result = await db.execute(query)
    return result.scalars().all()

@router.put("/defects/{defect_id}", response_model=QualityDefectResponse)
async def update_defect(
    defect_id: int,
    defect_in: QualityDefectUpdate,
    db: AsyncSession = Depends(get_db)
):
    query = select(QualityDefect).where(QualityDefect.id == defect_id)
    result = await db.execute(query)
    db_defect = result.scalar_one_or_none()
    
    if not db_defect:
        raise HTTPException(status_code=404, detail="Defect not found")
        
    update_data = defect_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_defect, field, value)
        
    await db.commit()
    await db.refresh(db_defect)
    
    # Eager load
    query = select(QualityDefect).options(
        selectinload(QualityDefect.order),
        selectinload(QualityDefect.plan),
        selectinload(QualityDefect.plan_item)
    ).where(QualityDefect.id == defect_id)
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/defects/{defect_id}")
async def delete_defect(
    defect_id: int,
    db: AsyncSession = Depends(get_db)
):
    query = select(QualityDefect).where(QualityDefect.id == defect_id)
    result = await db.execute(query)
    db_defect = result.scalar_one_or_none()
    
    if not db_defect:
        raise HTTPException(status_code=404, detail="Defect not found")
        
    await db.delete(db_defect)
    await db.commit()
    return {"status": "success"}

router = APIRouter()

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))  # backend/
UPLOAD_DIR = os.path.join(_BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Inspection Result Endpoints ---
@router.post("/inspections/", response_model=InspectionResultResponse)
async def create_inspection(
    inspection: InspectionResultCreate,
    db: AsyncSession = Depends(get_db)
):
    new_inspection = InspectionResult(**inspection.model_dump())
    db.add(new_inspection)
    await db.commit()
    await db.refresh(new_inspection)
    return new_inspection

@router.get("/inspections/work-order/{work_order_id}", response_model=InspectionResultResponse)
async def read_inspection_by_work_order(
    work_order_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(InspectionResult).where(InspectionResult.work_order_id == work_order_id))
    inspection = result.scalar_one_or_none()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection result not found")
    return inspection

# --- File Upload Endpoints ---
@router.post("/upload/", response_model=AttachmentResponse)
async def upload_file(
    related_type: str = Form(...),
    related_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    # 1. Save File locally
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Save Metadata to DB
    new_attachment = Attachment(
        related_type=related_type,
        related_id=related_id,
        file_name=file.filename,
        file_path=file_path,
        file_type=file.content_type
    )
    db.add(new_attachment)
    await db.commit()
    await db.refresh(new_attachment)
    
    return new_attachment

@router.get("/attachments/{related_type}/{related_id}", response_model=List[AttachmentResponse])
async def read_attachments(
    related_type: str,
    related_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Attachment)
        .where(Attachment.related_type == related_type)
        .where(Attachment.related_id == related_id)
    )
    return result.scalars().all()
