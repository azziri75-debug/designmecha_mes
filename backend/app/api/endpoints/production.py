from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List

from app.api.deps import get_db
from app.models.sales import ProductionPlan, SalesOrder, SalesOrderItem, WorkOrder
from app.models.product import Product, ProductProcess
from app.schemas.production import ProductionPlanResponse, ProductionPlanUpdate, WorkOrderResponse, WorkOrderUpdate

router = APIRouter()

@router.get("/plans/", response_model=List[ProductionPlanResponse])
async def read_production_plans(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ProductionPlan)
        .options(selectinload(ProductionPlan.work_orders))
        .offset(skip).limit(limit)
    )
    return result.scalars().all()

@router.post("/plans/{plan_id}/generate-work-orders")
async def generate_work_orders(
    plan_id: int,
    db: AsyncSession = Depends(get_db)
):
    # 1. Get Plan & Order & Product
    result = await db.execute(
        select(ProductionPlan)
        .options(selectinload(ProductionPlan.sales_order_item).selectinload(SalesOrderItem.product))
        .where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")
    
    if plan.work_orders:
         raise HTTPException(status_code=400, detail="Work Orders already generated")

    product = plan.sales_order_item.product
    
    # 2. Get Standard Processes for Product
    # Note: Need to fetch standard_processes relation. 
    # Since we didn't eager load it above, let's fetch it now or use a separate query.
    # Better to just query ProductProcess directly.
    result = await db.execute(
        select(ProductProcess)
        .where(ProductProcess.product_id == product.id)
        .options(selectinload(ProductProcess.process))
        .order_by(ProductProcess.sequence)
    )
    product_processes = result.scalars().all()
    
    if not product_processes:
        raise HTTPException(status_code=400, detail="No standard processes defined for this product")

    # 3. Create Work Orders
    for pp in product_processes:
        work_order = WorkOrder(
            production_plan_id=plan.id,
            process_name=pp.process.name,
            sequence=pp.sequence,
            status="PENDING"
        )
        db.add(work_order)
    
    plan.status = "IN_PROGRESS"
    await db.commit()
    
    # Return updated plan
    await db.refresh(plan)
    # Re-fetch with work_orders
    result = await db.execute(
        select(ProductionPlan)
        .options(selectinload(ProductionPlan.work_orders))
        .where(ProductionPlan.id == plan_id)
    )
    return result.scalar_one()

# --- Work Order Endpoints ---
@router.put("/work-orders/{work_order_id}", response_model=WorkOrderResponse)
async def update_work_order(
    work_order_id: int,
    update_data: WorkOrderUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(WorkOrder).where(WorkOrder.id == work_order_id))
    work_order = result.scalar_one_or_none()
    if not work_order:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    for key, value in update_data.model_dump(exclude_unset=True).items():
        setattr(work_order, key, value)
        
    await db.commit()
    await db.refresh(work_order)
    return work_order

# --- PDF Generation (Stub) ---
@router.get("/plans/{plan_id}/pdf")
async def generate_work_order_pdf(
    plan_id: int,
    db: AsyncSession = Depends(get_db)
):
    # This is a stub for PDF generation.
    # In a real implementation, we would use WeasyPrint or ReportLab here.
    # returning a dummy PDF content for now.
    
    pdf_content = b"%PDF-1.4... Dummy PDF Content ..."
    
    return Response(content=pdf_content, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=work_order_{plan_id}.pdf"})
