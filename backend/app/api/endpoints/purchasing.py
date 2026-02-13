from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.api import deps
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus
from app.schemas import purchasing as schemas

router = APIRouter()

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
            note=item.note
        )
        db.add(db_item)
    
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
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve purchase orders.
    """
    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product),
        selectinload(PurchaseOrder.partner)
    ).order_by(desc(PurchaseOrder.order_date)).offset(skip).limit(limit)
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

    # Update Items (Replace Strategy for simplicity, or ID matching)
    if items_data is not None:
        # Simple replace strategy: Delete all and re-create? 
        # Or partial update. Let's try partial update if ID present.
        
        # Current items map
        current_items = {item.id: item for item in db_order.items}
        
        # Keep track of processed IDs
        processed_ids = []
        
        for item_in in order_in.items: # This is List[PurchaseOrderItemUpdate]
            if item_in.id and item_in.id in current_items:
                # Update existing
                db_item = current_items[item_in.id]
                item_data = item_in.model_dump(exclude_unset=True)
                for field, value in item_data.items():
                    setattr(db_item, field, value)
                processed_ids.append(item_in.id)
            else:
                # Create new (if allowed via update endpoint)
                # Schema might strictly require ID for update, or allow new.
                # Assuming simple replace/add logic not fully needed yet via Update model.
                # If we want to support adding items via PUT, we need Create schema mixed in.
                # For now, let's assume update only touches existing or simply ignores.
                # Actually, standard pattern: existing items updated/deleted, new ones added.
                pass
                
        # To delete removed items? 
        # If the list is meant to be the full state, then yes.
        # But here `items` is Optional. If provided, does it mean "replace all" or "update these"?
        # Usually PUT is replace resource. 
        # Let's stick to updating fields for now. 
        # If user wants to add items, better use specific endpoint or proper full update logic.
        # For this MVP, let's just update the specific items provided.
        pass

    await db.commit()
    await db.refresh(db_order)
    
    # Re-fetch
    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product),
        selectinload(PurchaseOrder.partner)
    ).where(PurchaseOrder.id == order_id)
    result = await db.execute(query)
    return result.scalar_one()


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
