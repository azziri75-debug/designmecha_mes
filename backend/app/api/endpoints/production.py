from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.product import Product, ProductProcess, Process
from app.schemas import production as schemas

router = APIRouter()

@router.get("/plans", response_model=List[schemas.ProductionPlan])
async def read_production_plans(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve production plans.
    """
    result = await db.execute(select(ProductionPlan).options(selectinload(ProductionPlan.items)).offset(skip).limit(limit))
    plans = result.scalars().all()
    return plans

@router.post("/plans", response_model=schemas.ProductionPlan)
async def create_production_plan(
    plan_in: schemas.ProductionPlanCreate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Create a production plan from a Sales Order.
    Auto-generates plan items based on Product Processes.
    """
    # 1. Check if Order exists
    result = await db.execute(select(SalesOrder).where(SalesOrder.id == plan_in.order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sales Order not found")
        
    # 2. Check if Plan already exists for this order
    # (Assuming 1 Plan per Order for simplicity, though model allows duplicate order_id if not unique)
    result = await db.execute(select(ProductionPlan).where(ProductionPlan.order_id == plan_in.order_id))
    existing_plan = result.scalar_one_or_none()
    if existing_plan:
        raise HTTPException(status_code=400, detail="Production Plan already exists for this Order")

    # 3. Create Plan Header
    plan = ProductionPlan(
        order_id=plan_in.order_id,
        plan_date=plan_in.plan_date,
        status=ProductionStatus.PLANNED
    )
    db.add(plan)
    await db.flush() # intent: get plan.id
    
    # 4. Generate Items
    # Fetch Order Items
    result = await db.execute(select(SalesOrderItem).where(SalesOrderItem.order_id == plan_in.order_id))
    order_items = result.scalars().all()
    
    for item in order_items:
        # Fetch Product Processes with Process Name
        stmt = (
            select(ProductProcess, Process.name, Process.course_type)
            .join(Process, ProductProcess.process_id == Process.id)
            .where(ProductProcess.product_id == item.product_id)
            .order_by(ProductProcess.sequence)
        )
        result = await db.execute(stmt)
        processes = result.all()
        
        if not processes:
            # Create a default item if no process defined? 
            # For now, just skip.
            continue
            
        for proc, proc_name, proc_course_type in processes:
             plan_item = ProductionPlanItem(
                 plan_id=plan.id,
                 product_id=item.product_id,
                 process_name=proc_name,
                 sequence=proc.sequence,
                 course_type=proc.course_type or proc_course_type or "INTERNAL", # fallback logic
                 partner_name=proc.partner_name,
                 work_center=proc.equipment_name,
                 estimated_time=proc.estimated_time,
                 quantity=item.quantity, # Set target quantity from Order
                 status=ProductionStatus.PLANNED
             )
             db.add(plan_item)

    await db.commit()
    await db.refresh(plan)
    # Ensure items are loaded for response
    # Explicitly load items to avoid missing greenlet if accessed later
    # (Though refresh might not load them, return plan triggers Pydantic which triggers access)
    # Ideally we re-fetch with options, or trust that they are in session.
    # To be safe for async, let's re-fetch.
    result = await db.execute(select(ProductionPlan).options(selectinload(ProductionPlan.items)).where(ProductionPlan.id == plan.id))
    plan = result.scalar_one()
    return plan

