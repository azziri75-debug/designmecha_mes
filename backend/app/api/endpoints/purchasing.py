from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.api import deps
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus
from app.models.production import ProductionPlanItem
from app.models.product import Product
from app.schemas import purchasing as schemas

router = APIRouter()

# --- Pending Items (Waiting List) ---

@router.get("/purchase/pending-items", response_model=List[Any])
async def read_pending_purchase_items(
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Get Production Plan Items that need purchasing and are not yet ordered.
    """
    # Subquery for ordered items
    subquery = select(PurchaseOrderItem.production_plan_item_id).where(PurchaseOrderItem.production_plan_item_id.isnot(None))
    
    query = select(ProductionPlanItem).options(selectinload(ProductionPlanItem.product))\
        .where(ProductionPlanItem.course_type == 'PURCHASE')\
        .where(ProductionPlanItem.id.notin_(subquery))
        
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Return as list of dicts or specific schema? 
    # Let's return a simple structure for frontend. 
    # Or maybe we define a schema. For now, returning list of objects which Pydantic might serialize if schema matches.
    # But ProductionPlanItem is a model.
    # Let's construct a response list.
    return items

@router.get("/outsourcing/pending-items", response_model=List[Any])
async def read_pending_outsourcing_items(
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Get Production Plan Items that need outsourcing and are not yet ordered.
    """
    subquery = select(OutsourcingOrderItem.production_plan_item_id).where(OutsourcingOrderItem.production_plan_item_id.isnot(None))
    
    query = select(ProductionPlanItem).options(selectinload(ProductionPlanItem.product))\
        .where(ProductionPlanItem.course_type == 'OUTSOURCING')\
        .where(ProductionPlanItem.id.notin_(subquery))
        
    result = await db.execute(query)
    items = result.scalars().all()
    return items

# --- Purchase Orders ---

@router.post("/purchase/orders", response_model=schemas.PurchaseOrder)
async def create_purchase_order(
    order_in: schemas.PurchaseOrderCreate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Create a new Purchase Order.
    """
    # Generate Order No
    date_str = datetime.now().strftime("%Y%m%d")
    from sqlalchemy import func
    query = select(func.count()).filter(PurchaseOrder.order_date == datetime.now().date())
    result = await db.execute(query)
    count = result.scalar() or 0
    order_no = f"PO-{date_str}-{count+1:03d}"

    db_order = PurchaseOrder(
        order_no=order_no,
        partner_id=order_in.partner_id,
        order_date=order_in.order_date,
        delivery_date=order_in.delivery_date,
        note=order_in.note,
        status=PurchaseStatus.PENDING
    )
    db.add(db_order)
    await db.flush()

    for item in order_in.items:
        db_item = PurchaseOrderItem(
            purchase_order_id=db_order.id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            note=item.note,
            production_plan_item_id=item.production_plan_item_id # Save link
        )
        db.add(db_item)
        
        # Update ProductionPlanItem status if linked
        if item.production_plan_item_id:
            from app.models.production import ProductionStatus
            # Fetch the item to update status. 
            # We can use update statement or fetch object.
            # Since we are in a loop, update statement is efficient but we need to check if it exists?
            # It should exist if ID is valid.
            # Let's use direct update on the model class or fetch.
            # Fetching is safer to ensure it exists.
            
            # Use `await db.get(...)`? No, session.get is sync in some versions or async in 1.4+?
            # async_session.get is available.
            plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
            if plan_item:
                plan_item.status = ProductionStatus.IN_PROGRESS # Or keep it PLANNED until received?
                # User request: "Update status to 'IN_PROGRESS' or 'ORDERED'"
                # ProductionStatus enum has: PENDING, PLANNED, IN_PROGRESS, COMPLETED, CANCELED.
                # Let's use IN_PROGRESS to indicate "Ordered/Work Started".
                db.add(plan_item)

    await db.commit()
    await db.refresh(db_order)

    # Re-fetch with eager load
    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product),
        selectinload(PurchaseOrder.partner)
    ).where(PurchaseOrder.id == db_order.id)
    result = await db.execute(query)
    return result.scalar_one()

@router.get("/purchase/orders", response_model=List[schemas.PurchaseOrder])
async def read_purchase_orders(
    skip: int = 0,
    limit: int = 100,
    status: str = None, # Added status filter for 'Completed' tab logic if needed
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve purchase orders.
    """
    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product),
        selectinload(PurchaseOrder.partner)
    )
    if status:
         # Map generic status to enum? Or just filter.
         pass # Implement if needed for tabs, but frontend can filter/backend can filter.

    query = query.order_by(desc(PurchaseOrder.order_date)).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

@router.put("/purchase/orders/{order_id}", response_model=schemas.PurchaseOrder)
async def update_purchase_order(
    order_id: int,
    order_in: schemas.PurchaseOrderUpdate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Update a Purchase Order.
    """
    query = select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Purchase Order not found")

    # Update Header
    update_data = order_in.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)

    for field, value in update_data.items():
        setattr(db_order, field, value)

    # Update Items (Simple Replace if items provided)
    if items_data is not None:
         # For simplicity in this logic, we will delete existing and recreate, 
         # because tracking which item maps to which plan item after update is complex 
         # without strict ID management.
         # However, cascade delete on order items might lose legacy data if we are not careful.
         # But user just entered "Create Order", likely won't change plan link often.
         # If we recreate, we must ensure production_plan_item_id is preserved or passed from frontend.
         
         # Better Strategy:
         # 1. Map existing items by ID.
         # 2. Update found items.
         # 3. Add new items.
         # 4. Delete missing items.
         
         current_items = {item.id: item for item in db_order.items}
         incoming_ids = set()
         
         for item_in in order_in.items:
             if item_in.id and item_in.id in current_items:
                 # Update
                 db_item = current_items[item_in.id]
                 item_data = item_in.model_dump(exclude_unset=True)
                 for k, v in item_data.items():
                     if k != "id":
                        setattr(db_item, k, v)
                 incoming_ids.add(item_in.id)
             else:
                 # Create
                 db_item = PurchaseOrderItem(
                    purchase_order_id=db_order.id,
                    product_id=item_in.product_id,
                    quantity=item_in.quantity,
                    unit_price=item_in.unit_price,
                    note=item_in.note,
                    production_plan_item_id=item_in.production_plan_item_id
                 )
                 db.add(db_item)
         
         # Delete missing
         for item_id, item in current_items.items():
             if item_id not in incoming_ids:
                 await db.delete(item)

    await db.commit()
    await db.refresh(db_order)
    
    # Re-fetch
    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product),
        selectinload(PurchaseOrder.partner)
    ).where(PurchaseOrder.id == order_id)
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/purchase/orders/{order_id}", status_code=204)
async def delete_purchase_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db),
):
    query = select(PurchaseOrder).where(PurchaseOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    await db.delete(db_order)
    await db.commit()
    return None

# --- Outsourcing Orders ---

@router.post("/outsourcing/orders", response_model=schemas.OutsourcingOrder)
async def create_outsourcing_order(
    order_in: schemas.OutsourcingOrderCreate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Create a new Outsourcing Order.
    """
    # Generate Order No
    date_str = datetime.now().strftime("%Y%m%d")
    from sqlalchemy import func
    query = select(func.count()).filter(OutsourcingOrder.order_date == datetime.now().date())
    result = await db.execute(query)
    count = result.scalar() or 0
    order_no = f"OS-{date_str}-{count+1:03d}"

    db_order = OutsourcingOrder(
        order_no=order_no,
        partner_id=order_in.partner_id,
        order_date=order_in.order_date,
        delivery_date=order_in.delivery_date,
        note=order_in.note,
        status=OutsourcingStatus.PENDING
    )
    db.add(db_order)
    await db.flush()

    for item in order_in.items:
        db_item = OutsourcingOrderItem(
            outsourcing_order_id=db_order.id,
            production_plan_item_id=item.production_plan_item_id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            note=item.note
        )
        db.add(db_item)
        
        # Update ProductionPlanItem status if linked
        if item.production_plan_item_id:
            from app.models.production import ProductionStatus
            plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
            if plan_item:
                plan_item.status = ProductionStatus.IN_PROGRESS
                db.add(plan_item)
    
    await db.commit()
    await db.refresh(db_order)

    # Re-fetch
    query = select(OutsourcingOrder).options(
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.product),
        selectinload(OutsourcingOrder.partner)
    ).where(OutsourcingOrder.id == db_order.id)
    result = await db.execute(query)
    return result.scalar_one()

@router.get("/outsourcing/orders", response_model=List[schemas.OutsourcingOrder])
async def read_outsourcing_orders(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve outsourcing orders.
    """
    query = select(OutsourcingOrder).options(
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.product),
        selectinload(OutsourcingOrder.partner)
    ).order_by(desc(OutsourcingOrder.order_date)).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

@router.delete("/outsourcing/orders/{order_id}", status_code=204)
async def delete_outsourcing_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db),
):
    query = select(OutsourcingOrder).where(OutsourcingOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    await db.delete(db_order)
    await db.commit()
    return None
