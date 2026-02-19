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
from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem, PurchaseOrder, OutsourcingOrder, PurchaseStatus, OutsourcingStatus
from app.models.basics import Partner
from app.schemas import production as schemas
from datetime import datetime
import uuid

router = APIRouter()

@router.get("/plans", response_model=List[schemas.ProductionPlan])
async def read_production_plans(
    skip: int = 0,
    limit: int = 1000,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve production plans.
    """
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .offset(skip).limit(limit)
    )
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
    if plan_in.items:
         for item_in in plan_in.items:
             plan_item = ProductionPlanItem(
                 plan_id=plan.id,
                 product_id=item_in.product_id,
                 process_name=item_in.process_name,
                 sequence=item_in.sequence,
                 course_type=item_in.course_type,
                 partner_name=item_in.partner_name,
                 work_center=item_in.work_center,
                 estimated_time=item_in.estimated_time,
                 start_date=item_in.start_date,
                 end_date=item_in.end_date,
                 worker_name=item_in.worker_name,
                 note=item_in.note,
                 status=item_in.status,
                 quantity=item_in.quantity
             )
             db.add(plan_item)
    else:
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
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .where(ProductionPlan.id == plan.id)
    )
    plan = result.scalar_one()
    return plan

@router.put("/plans/{plan_id}", response_model=schemas.ProductionPlan)
async def update_production_plan(
    plan_id: int,
    plan_in: schemas.ProductionPlanUpdate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Update a production plan.
    If items are provided, existing items are replaced.
    """
    # 1. Fetch Plan
    result = await db.execute(select(ProductionPlan).options(selectinload(ProductionPlan.items)).where(ProductionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")

    # 2. Update Header
    update_data = plan_in.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)
    
    for field, value in update_data.items():
        setattr(plan, field, value)
        
    # 3. Update Items (Replace Strategy)
    if items_data is not None:
        # Delete existing items
        # SQLAlchemy cascade="all, delete-orphan" on relationship handles deletion from DB
        # when we remove them from the list, IF configured. 
        # But explicitly deleting is clearer for async session sometimes.
        # Let's try clearing the list which should trigger delete-orphan.
        plan.items.clear()
        
        # Add new items
        for item_in in plan_in.items:
            # We need to map schema to model. Schema has product_id, process_name, etc.
            new_item = ProductionPlanItem(
                plan_id=plan.id, # Should be set auto by relationship but explicit is fine
                product_id=item_in.product_id,
                process_name=item_in.process_name,
                sequence=item_in.sequence,
                course_type=item_in.course_type,
                partner_name=item_in.partner_name,
                work_center=item_in.work_center,
                estimated_time=item_in.estimated_time,
                start_date=item_in.start_date,
                end_date=item_in.end_date,
                worker_name=item_in.worker_name,
                note=item_in.note,
                status=item_in.status,
                quantity=item_in.quantity
            )
            # Fix: Schema missing quantity. For now, use 1 or try to copy? 
            # Better to fix schema first. 
            # Assuming schema has quantity now? No I didn't add it.
            # I must add quantity to ProductionPlanItemBase.
            plan.items.append(new_item)

    await db.commit()
    await db.refresh(plan)
    
    await db.commit()
    await db.refresh(plan)
    
    # Re-fetch for response
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one()
    return plan

@router.delete("/plans/{plan_id}", status_code=204)
async def delete_production_plan(
    plan_id: int,
    db: AsyncSession = Depends(deps.get_db),
):
    """
    Delete a production plan.
    """
    result = await db.execute(select(ProductionPlan).where(ProductionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")
        
    # Check for linked orders (Safety Check) -> Changed to Unlink Strategy
    # We un-link the Purchase/Outsourcing Orders instead of blocking deletion.
    # This keeps the financial record (PO/OO) but removes the Production Plan.
    
    # Unlink Purchase Orders
    stmt_po = select(PurchaseOrderItem).join(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan_id)
    result_po = await db.execute(stmt_po)
    po_items = result_po.scalars().all()
    for po_item in po_items:
        po_item.production_plan_item_id = None
        db.add(po_item)

    # Unlink Outsourcing Orders
    stmt_oo = select(OutsourcingOrderItem).join(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan_id)
    result_oo = await db.execute(stmt_oo)
    oo_items = result_oo.scalars().all()
    for oo_item in oo_items:
        oo_item.production_plan_item_id = None
        db.add(oo_item)

    await db.delete(plan)
    await db.commit()
    return None

@router.patch("/plans/{plan_id}/status", response_model=schemas.ProductionPlan)
async def update_production_plan_status(
    plan_id: int,
    status: ProductionStatus,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Update production plan status.
    If COMPLETED, update SalesOrder status to PRODUCTION_COMPLETED.
    """
    # Eager load order to update its status
    result = await db.execute(
        select(ProductionPlan)
        .options(selectinload(ProductionPlan.order))
        .where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")
        
    plan.status = status
    
    # Check for linked orders if Completing
    if status == ProductionStatus.COMPLETED:
        # Check Purchase Orders Status
        # We want to ensure all linked PO items are RECEIVED or Orders are COMPLETED?
        # User said: "check then complete". 
        # If any mapped PO item is NOT Received, warn?
        # Let's check if any linked PO Item belongs to a PO that is NOT Completed/Confirmed?
        # Or simpler: Check if any linked item exists that is not fully processed.
        # Given "PurchaseOrderItem" has "received_quantity", we could check if received >= quantity.
        # But for now, let's just check if any linked Order is still PENDING.
        
        # Check Purchase Orders
        # Join PlanItem -> PurchaseOrderItem -> PurchaseOrder
        stmt_po = select(PurchaseOrder).join(PurchaseOrderItem).join(ProductionPlanItem).where(
            ProductionPlanItem.plan_id == plan_id,
            PurchaseOrder.status.in_([PurchaseStatus.PENDING]) 
        )
        result_po = await db.execute(stmt_po)
        if result_po.first():
             raise HTTPException(status_code=400, detail="Cannot complete plan with PENDING Purchase Orders. Please complete/confirm orders first.")

        # Check Outsourcing Orders
        stmt_oo = select(OutsourcingOrder).join(OutsourcingOrderItem).join(ProductionPlanItem).where(
            ProductionPlanItem.plan_id == plan_id,
            OutsourcingOrder.status.in_([OutsourcingStatus.PENDING])
        )
        result_oo = await db.execute(stmt_oo)
        if result_oo.first():
             raise HTTPException(status_code=400, detail="Cannot complete plan with PENDING Outsourcing Orders. Please complete/confirm orders first.")

    # Sync with Sales Order
    if status == ProductionStatus.COMPLETED and plan.order:
        from app.models.sales import OrderStatus
        plan.order.status = OrderStatus.PRODUCTION_COMPLETED
        db.add(plan.order)
        
    await db.commit()
    
    # Re-fetch with full options for response
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .where(ProductionPlan.id == plan_id)
    )
    return result.scalar_one()
