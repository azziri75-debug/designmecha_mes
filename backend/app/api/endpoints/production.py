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

    await db.flush() # Ensure plan items have IDs

    # 5. Auto-Create Purchase/Outsourcing Orders
    # Re-fetch items directly from DB to be safe with IDs
    result = await db.execute(select(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan.id))
    created_items = result.scalars().all()

    purchase_group = {}
    outsourcing_group = {}

    for item in created_items:
        if item.course_type == "PURCHASE":
            p_name = item.partner_name or "Unknown"
            if p_name not in purchase_group:
                 purchase_group[p_name] = []
            purchase_group[p_name].append(item)
        elif item.course_type == "OUTSOURCING":
            p_name = item.partner_name or "Unknown"
            if p_name not in outsourcing_group:
                 outsourcing_group[p_name] = []
            outsourcing_group[p_name].append(item)

    # Create Purchase Orders
    for p_name, items in purchase_group.items():
        # Find Partner
        stmt = select(Partner).where(Partner.name == p_name)
        result = await db.execute(stmt)
        partner = result.scalar_one_or_none()

        po = PurchaseOrder(
            partner_id=partner.id if partner else None,
            order_date=plan_in.plan_date,
            status=PurchaseStatus.PENDING,
            order_no=f"PO-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
            total_amount=0
        )
        db.add(po)
        await db.flush() # Get PO ID

        for item in items:
            poi = PurchaseOrderItem(
                purchase_order_id=po.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=0,
                production_plan_item_id=item.id,
                received_quantity=0
            )
            db.add(poi)

    # Create Outsourcing Orders
    for p_name, items in outsourcing_group.items():
        stmt = select(Partner).where(Partner.name == p_name)
        result = await db.execute(stmt)
        partner = result.scalar_one_or_none()

        oo = OutsourcingOrder(
            partner_id=partner.id if partner else None,
            order_date=plan_in.plan_date,
            status=OutsourcingStatus.PENDING,
            order_no=f"OO-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
            total_amount=0
        )
        db.add(oo)
        await db.flush() # Get OO ID

        for item in items:
            ooi = OutsourcingOrderItem(
                outsourcing_order_id=oo.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=0,
                production_plan_item_id=item.id,
                status=OutsourcingStatus.PENDING
            )
            db.add(ooi)

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
