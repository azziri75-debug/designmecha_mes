from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc

from app.api import deps
from app.models.quality import CustomerComplaint, ComplaintStatus
from app.schemas import quality as schemas
from datetime import datetime

router = APIRouter()

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
