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
                # Use local variable to ensure consistent logic
                final_course_type = proc.course_type or proc_course_type or "INTERNAL"
                
                plan_item = ProductionPlanItem(
                    plan_id=plan.id,
                    product_id=item.product_id,
                    process_name=proc_name,
                    sequence=proc.sequence,
                    course_type=final_course_type,
                    partner_name=proc.partner_name,
                    work_center=proc.equipment_name,
                    estimated_time=proc.estimated_time,
                    quantity=item.quantity, # Set target quantity from Order
                    status=ProductionStatus.PLANNED
                )
                db.add(plan_item)
                await db.flush() # Need ID for linking

                # --- Auto-Create Purchase/Outsourcing Orders (Restored) ---
                # Use final_course_type for check
                
                # 1. Purchase
                if "PURCHASE" in final_course_type or "구매" in final_course_type:
                    # Logic:
                    po = PurchaseOrder(
                        order_no=f"PO-AUTO-{plan.id}-{plan_item.id}", # Temp ID
                        partner_id=None, # We don't have ID, only name. Leave null or find?
                        order_date=datetime.now().date(),
                        delivery_date=plan_in.plan_date,
                        status=PurchaseStatus.PENDING,
                        note=f"Auto-generated from Plan {plan.id}"
                    )
                    db.add(po)
                    await db.flush()
                    
                    po_item = PurchaseOrderItem(
                        purchase_order_id=po.id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        unit_price=0, # Unknown
                        production_plan_item_id=plan_item.id
                    )
                    db.add(po_item)
                    
                # 2. Outsourcing
                if "OUTSOURCING" in final_course_type or "외주" in final_course_type:
                    
                    oo = OutsourcingOrder(
                        order_no=f"OS-AUTO-{plan.id}-{plan_item.id}",
                        partner_id=None,
                        order_date=datetime.now().date(),
                        delivery_date=plan_in.plan_date,
                        status=OutsourcingStatus.PENDING,
                        note=f"Auto-generated from Plan {plan.id}"
                    )
                    db.add(oo)
                    await db.flush()
                    
                    oo_item = OutsourcingOrderItem(
                        outsourcing_order_id=oo.id,
                        production_plan_item_id=plan_item.id,
                        product_id=item.product_id,
                        quantity=item.quantity,
                        unit_price=0
                    )
                    db.add(oo_item)

    await db.commit()
    await db.refresh(plan)
    
    # Reload logic...
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner), # Deep load for Schema
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
    # Re-fetch with full options for response
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner), # Deep Load
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
    # Eager load items and linked orders
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order)
        )
        .where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")
        
    plan.status = status
    
    # Auto-Complete Logic
    if status == ProductionStatus.COMPLETED:
        affected_po_ids = set()
        affected_oo_ids = set()
        
        for item in plan.items:
            # 1. Update Purchase Items
            for po_item in item.purchase_items:
                # Set received quantity to full
                if po_item.quantity > po_item.received_quantity:
                    po_item.received_quantity = po_item.quantity
                    db.add(po_item)
                affected_po_ids.add(po_item.purchase_order_id)
                
            # 2. Update Outsourcing Items
            for oo_item in item.outsourcing_items:
                if oo_item.status != OutsourcingStatus.COMPLETED:
                    oo_item.status = OutsourcingStatus.COMPLETED
                    db.add(oo_item)
                affected_oo_ids.add(oo_item.outsourcing_order_id)
        
        await db.flush()
        
        # 3. Check and Complete Purchase Orders
        for po_id in affected_po_ids:
            po_query = select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.id == po_id)
            po_result = await db.execute(po_query)
            po = po_result.scalar_one_or_none()
            
            if po:
                # Check if all items are fully received
                all_received = all(i.received_quantity >= i.quantity for i in po.items)
                if all_received:
                    po.status = PurchaseStatus.COMPLETED
                    po.delivery_date = datetime.now().date() # Set actual delivery date?
                    db.add(po)

        # 4. Check and Complete Outsourcing Orders
        for oo_id in affected_oo_ids:
            oo_query = select(OutsourcingOrder).options(selectinload(OutsourcingOrder.items)).where(OutsourcingOrder.id == oo_id)
            oo_result = await db.execute(oo_query)
            oo = oo_result.scalar_one_or_none()
            
            if oo:
                # Check if all items are completed
                all_completed = all(i.status == OutsourcingStatus.COMPLETED for i in oo.items)
                if all_completed:
                    oo.status = OutsourcingStatus.COMPLETED
                    oo.delivery_date = datetime.now().date()
                    db.add(oo)

    # Sync with Sales Order
    if plan.order:
        from app.models.sales import OrderStatus
        if status == ProductionStatus.COMPLETED:
            plan.order.status = OrderStatus.PRODUCTION_COMPLETED
        elif status == ProductionStatus.IN_PROGRESS or status == ProductionStatus.PLANNED:
            # If reverting from COMPLETED, set back to CONFIRMED
            plan.order.status = OrderStatus.CONFIRMED
            
        db.add(plan.order)
        
    await db.commit()
    
    # Re-fetch with full options for response
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner), # Deep Load
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .where(ProductionPlan.id == plan_id)
    )
    return result.scalar_one()
