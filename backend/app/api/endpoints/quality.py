from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
import shutil
import os
from datetime import datetime

from app.api.deps import get_db
from app.models.quality import InspectionResult, Attachment
from app.schemas.quality import InspectionResultCreate, InspectionResultResponse, AttachmentResponse

router = APIRouter()

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend/
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
