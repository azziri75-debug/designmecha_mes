from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, or_
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional, Any

from app.api.deps import get_db
from app.models.product import Product, Process, ProductProcess, ProductGroup, BOM
from app.models.sales import Estimate, EstimateItem, SalesOrder, SalesOrderItem
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, OutsourcingOrder, OutsourcingOrderItem
from app.models.basics import Partner
from app.schemas.product import (
    ProductCreate, ProductResponse, ProcessCreate, ProcessResponse, 
    ProductUpdate, ProcessUpdate, ProductGroupCreate, ProductGroupResponse, 
    ProductGroupUpdate, ProductPriceHistory, ProcessCostHistory, ProcessQuickCreate,
    BOMItemCreate, BOMItemResponse
)

router = APIRouter()

# --- Product Group Endpoints ---
@router.post("/groups/", response_model=ProductGroupResponse)
async def create_group(
    group: ProductGroupCreate,
    db: AsyncSession = Depends(get_db)
):
    new_group = ProductGroup(**group.model_dump())
    db.add(new_group)
    await db.commit()
    await db.refresh(new_group)
    return new_group

@router.get("/groups/", response_model=List[ProductGroupResponse])
async def read_groups(
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ProductGroup))
    groups = result.scalars().all()
    return groups

@router.put("/groups/{group_id}", response_model=ProductGroupResponse)
async def update_group(
    group_id: int,
    group_update: ProductGroupUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ProductGroup).where(ProductGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    for key, value in group_update.model_dump(exclude_unset=True).items():
        setattr(group, key, value)
    
    await db.commit()
    await db.refresh(group)
    return group

@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ProductGroup).where(ProductGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    try:
        await db.delete(group)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Cannot delete group. It might be in use.")
    
    return {"message": "Group deleted successfully"}

# --- Process Endpoints ---
@router.post("/processes/", response_model=ProcessResponse)
async def create_process(
    process: ProcessCreate,
    db: AsyncSession = Depends(get_db)
):
    # [Fix] Exclude major_group_id as it is not a column in the Process model
    process_data = process.model_dump(exclude={"major_group_id"})
    new_process = Process(**process_data)
    db.add(new_process)
    await db.commit()
    await db.refresh(new_process)
    return new_process

@router.get("/processes/", response_model=List[ProcessResponse])
async def read_processes(
    skip: int = 0,
    limit: int = 2000,  # [Fix] Increased from 100 to 2000 to avoid missing newly added processes
    major_group_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Retrieve processes.
    """
    query = select(Process)
    if major_group_id:
        query = query.outerjoin(ProductGroup, Process.group_id == ProductGroup.id).where(
            or_(
                Process.group_id == None,
                ProductGroup.id == major_group_id,
                ProductGroup.parent_id == major_group_id
            )
        )
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    processes = result.scalars().all()
    return processes

@router.post("/processes/quick", response_model=ProcessResponse)
async def quick_create_process(
    process_in: ProcessQuickCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    ?꾨줎?몄뿏???쒗뭹 ?섏젙 ?붾㈃?먯꽌 利됱떆 ??怨듭젙???깅줉?섍린 ?꾪븳 API
    """
    new_process = Process(
        name=process_in.name,
        course_type=process_in.course_type,
        group_id=process_in.group_id,
        # major_group_id??ProductGroup ?뚯씠釉붿뿉??蹂꾨룄 ?꾨뱶媛 ?덉쑝??Process ?뚯씠釉붿뿉??group_id(?뚭렇猷?留??곌껐?섏뼱 ?덉뼱
        # ?꾩슂??Process 紐⑤뜽???뺤씤?댁빞 ?섏?留??꾩옱 ?ㅽ궎留덉긽 group_id(minor)留?諛쏆쓬.
    )
    db.add(new_process)
    await db.commit()
    await db.refresh(new_process)
    return new_process

# --- Product Endpoints ---
@router.post("/products/", response_model=ProductResponse)
async def create_product(
    product: ProductCreate,
    db: AsyncSession = Depends(get_db)
):
    # 1. Create Product
    product_data = product.model_dump(exclude={"standard_processes"})
    new_product = Product(**product_data)
    db.add(new_product)
    await db.flush() # ID generation

    # Auto-initialize Stock with 0 quantity
    from app.models.inventory import Stock
    new_stock = Stock(product_id=new_product.id, current_quantity=0, location="湲곕낯李쎄퀬")
    db.add(new_stock)

    # 2. Add Standard Processes (Routing)
    for pp in product.standard_processes:
        new_pp = ProductProcess(
            product_id=new_product.id,
            process_id=pp.process_id,
            sequence=pp.sequence,
            estimated_time=pp.estimated_time,
            notes=pp.notes,
            partner_name=pp.partner_name,
            equipment_name=pp.equipment_name,
            attachment_file=pp.attachment_file,
            course_type=pp.course_type,
            cost=pp.cost
        )
        db.add(new_pp)

    await db.commit()
    # Re-fetch the product with eager loading to avoid MissingGreenlet error on response serialization
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items).selectinload(BOM.child_product),
            joinedload(Product.partner)
        )
        .where(Product.id == new_product.id)
    )
    created_product = result.scalar_one()
    created_product.partner_name = created_product.partner.name if created_product.partner else None
    return created_product

@router.get("/products/", response_model=List[ProductResponse])
async def read_products(
    skip: int = 0,
    limit: int = 200,
    item_type: Optional[str] = None,
    partner_id: Optional[int] = None,
    group_id: Optional[int] = None,
    major_group_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Retrieve products.
    """
    query = select(Product).options(
        selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(Product.bom_items).selectinload(BOM.child_product),
        selectinload(Product.partner)
    )
    
    if major_group_id:
        query = query.join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id, ProductGroup.parent_id == major_group_id))
    elif group_id:
        query = query.where(Product.group_id == group_id)
    
    if partner_id:
        query = query.where(Product.partner_id == partner_id)
    
    if item_type:
        # 吏?먰븯??寃쎌슦 肄ㅻ쭏濡?援щ텇???щ윭 ??낆쓣 諛쏆쓣 ???덈룄濡?泥섎━
        if "," in item_type:
            types = [t.strip() for t in item_type.split(",")]
            query = query.where(Product.item_type.in_(types))
        else:
            query = query.where(Product.item_type == item_type)
        
    
    result = await db.execute(query.offset(skip).limit(limit))
    products = result.scalars().all()
    
    # Enrich with latest_price
    enriched_products = []
    for p in products:
        p_history = await get_product_price_history(p.id, db)
        latest_price = p_history[0].unit_price if p_history else 0.0
        p.latest_price = latest_price
        p.partner_name = p.partner.name if p.partner else None
        enriched_products.append(p)
        
    return enriched_products

@router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_update: ProductUpdate,
    db: AsyncSession = Depends(get_db)
):
    # Ensure checking existing product also loads relationships if needed (though strictly for check only ID is needed)
    # But for update we don't strictly one it here, we reuse scalar_one_or_none
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = product_update.model_dump(exclude_unset=True)
    
    # Handle standard_processes update if provided
    if "standard_processes" in update_data:
        processes_data = update_data.pop("standard_processes")
        
        # Clear existing processes
        # Note: This is a full replacement strategy.
        # Efficient for small lists, but for large ones we might need diffing.
        # Given 15-person company scale, replacement is fine.
        # Add new processes
        # First, delete existing ones
        await db.execute(delete(ProductProcess).where(ProductProcess.product_id == product_id))
        
        # Add new processes
        for pp in processes_data:
            new_pp = ProductProcess(
                product_id=product_id,
                process_id=pp['process_id'],
                sequence=pp['sequence'],
                estimated_time=pp.get('estimated_time'),
                notes=pp.get('notes'),
                partner_name=pp.get('partner_name'),
                equipment_name=pp.get('equipment_name'),
                attachment_file=pp.get('attachment_file'),
                course_type=pp.get('course_type'),
                cost=pp.get('cost', 0.0)
            )
            db.add(new_pp)
            
    # Update other fields
    for key, value in update_data.items():
        setattr(product, key, value)
        
    await db.commit()
    await db.refresh(product)
    
    # Re-fetch with eager load to avoid MissingGreenlet
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items).selectinload(BOM.child_product),
            joinedload(Product.partner)
        )
        .where(Product.id == product_id)
    )
    updated_product = result.unique().scalar_one()
    
    # Recalculate partner_name for response
    if updated_product.partner:
        updated_product.partner_name = updated_product.partner.name
    
    return updated_product

@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Deep Cascade Deletion (Bottom-up)
    from app.models.inventory import Stock, StockTransaction
    from app.models.purchasing import PurchaseOrderItem, ConsumablePurchaseWait, MaterialRequirement, OutsourcingOrderItem
    
    # 1. Get associated Stock IDs
    stock_q = await db.execute(select(Stock.id).where(Stock.product_id == product_id))
    stock_ids = stock_q.scalars().all()
    
    # 2. Delete StockTransactions (Deepest level)
    if stock_ids:
        await db.execute(delete(StockTransaction).where(StockTransaction.stock_id.in_(stock_ids)))
    
    # 3. Delete Stocks
    await db.execute(delete(Stock).where(Stock.product_id == product_id))
    
    # 4. Delete Purchasing related data
    await db.execute(delete(PurchaseOrderItem).where(PurchaseOrderItem.product_id == product_id))
    await db.execute(delete(ConsumablePurchaseWait).where(ConsumablePurchaseWait.product_id == product_id))
    await db.execute(delete(MaterialRequirement).where(MaterialRequirement.product_id == product_id))
    await db.execute(delete(OutsourcingOrderItem).where(OutsourcingOrderItem.product_id == product_id))
    
    # 5. Delete the Product
    await db.delete(product)
    await db.commit()
    return {"message": "Product and all its dependencies deleted successfully"}

# --- Process CRUD Operations ---

@router.put("/processes/{process_id}", response_model=ProcessResponse)
async def update_process(
    process_id: int,
    process_update: ProcessUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Process).where(Process.id == process_id))
    process_obj = result.scalar_one_or_none()
    if not process_obj:
        raise HTTPException(status_code=404, detail="Process not found")
        
    for key, value in process_update.model_dump(exclude_unset=True).items():
        setattr(process_obj, key, value)
        
    await db.commit()
    await db.refresh(process_obj)
    return process_obj

@router.delete("/processes/{process_id}")
async def delete_process(
    process_id: int,
    db: AsyncSession = Depends(get_db)
):
    # Check if used in any product
    # verification logic needed
    # For now, let's allow delete and let FK constraints handle it (if set) or check manually
    
    result = await db.execute(select(Process).where(Process.id == process_id))
    process_obj = result.scalar_one_or_none()
    if not process_obj:
        raise HTTPException(status_code=404, detail="Process not found")
    
    try:
        await db.delete(process_obj)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Cannot delete process. It might be in use. Error: {str(e)}")
        
    return {"message": "Process deleted successfully"}

# --- History Endpoints ---

@router.get("/{product_id}/purchase-history", response_model=List[ProductPriceHistory])
@router.get("/{product_id}/price-history", response_model=List[ProductPriceHistory])
async def get_product_purchase_history(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    ?뱀젙 ?쒗뭹??怨쇨굅 援щℓ(諛쒖＜) ?댁뿭 議고쉶
    """
    stmt = select(PurchaseOrderItem, PurchaseOrder, Partner)\
        .select_from(PurchaseOrderItem)\
        .join(PurchaseOrder)\
        .join(Partner, PurchaseOrder.partner_id == Partner.id)\
        .where(PurchaseOrderItem.product_id == product_id)\
        .order_by(PurchaseOrder.order_date.desc())
    
    result = await db.execute(stmt)
    history = []
    for row in result.all():
        item, order, partner = row
        history.append(ProductPriceHistory(
            date=str(order.order_date),
            type="PURCHASE",
            partner_name=partner.name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_amount=item.quantity * item.unit_price,
            order_no=order.order_no
        ))
    return history

@router.get("/{product_id}/sales-history", response_model=List[ProductPriceHistory])
async def get_product_price_history(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    ?뱀젙 ?쒗뭹??怨쇨굅 寃ъ쟻 諛??섏＜ ?댁뿭 ?듯빀 議고쉶
    """
    history = []

    # 1. Quotations
    q_stmt = select(EstimateItem, Estimate, Partner)\
        .select_from(EstimateItem)\
        .join(Estimate)\
        .join(Partner, Estimate.partner_id == Partner.id)\
        .where(EstimateItem.product_id == product_id)
    q_result = await db.execute(q_stmt)
    for row in q_result.all():
        item, estimate, partner = row
        history.append(ProductPriceHistory(
            date=str(estimate.estimate_date),
            type="QUOTATION",
            partner_name=partner.name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_amount=item.quantity * item.unit_price,
            order_no=None
        ))

    # 2. Sales Orders
    s_stmt = select(SalesOrderItem, SalesOrder, Partner)\
        .select_from(SalesOrderItem)\
        .join(SalesOrder)\
        .join(Partner, SalesOrder.partner_id == Partner.id)\
        .where(SalesOrderItem.product_id == product_id)
    s_result = await db.execute(s_stmt)
    for row in s_result.all():
        item, order, partner = row
        history.append(ProductPriceHistory(
            date=str(order.order_date),
            type="ORDER",
            partner_name=partner.name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_amount=item.quantity * item.unit_price,
            order_no=order.order_no
        ))

    # Sort by date DESC
    history.sort(key=lambda x: x.date, reverse=True)
    return history

@router.get("/{product_id}/cost-history/{process_id}", response_model=List[ProcessCostHistory])
async def get_process_cost_history(
    product_id: int,
    process_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    ?뱀젙 ?쒗뭹-怨듭젙 議고빀???먭? ?대젰 (援щℓ/?몄＜) 議고쉶
    """
    # Check process type
    proc_stmt = select(Process).where(Process.id == process_id)
    proc_res = await db.execute(proc_stmt)
    process = proc_res.scalar_one_or_none()
    if not process:
        raise HTTPException(status_code=404, detail="Process not found")

    history = []
    
    if process.course_type == "PURCHASE":
        # ?먯옱 援щℓ ?댁뿭
        stmt = select(PurchaseOrderItem, PurchaseOrder, Partner)\
            .select_from(PurchaseOrderItem)\
            .join(PurchaseOrder)\
            .join(Partner, PurchaseOrder.partner_id == Partner.id)\
            .where(PurchaseOrderItem.product_id == product_id)
        result = await db.execute(stmt)
        for row in result.all():
            item, order, partner = row
            history.append(ProcessCostHistory(
                date=str(order.order_date),
                partner_name=partner.name,
                unit_price=item.unit_price,
                source="PURCHASE"
            ))
    elif process.course_type == "OUTSOURCING":
        # ?몄＜ 諛쒖＜ ?댁뿭
        stmt = select(OutsourcingOrderItem, OutsourcingOrder, Partner)\
            .select_from(OutsourcingOrderItem)\
            .join(OutsourcingOrder)\
            .join(Partner, OutsourcingOrder.partner_id == Partner.id)\
            .where(OutsourcingOrderItem.product_id == product_id)
        result = await db.execute(stmt)
        for row in result.all():
            item, order, partner = row
            history.append(ProcessCostHistory(
                date=str(order.order_date),
                partner_name=partner.name,
                unit_price=item.unit_price,
                source="OUTSOURCING"
            ))

    # Sort DESC
    history.sort(key=lambda x: x.date, reverse=True)
    return history

@router.get("/{product_id}/latest-cost/{process_id}")
async def get_latest_process_cost(
    product_id: int,
    process_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    媛??理쒓렐???ㅺ굅?섍? 議고쉶
    """
    history = await get_process_cost_history(product_id, process_id, db)
    if not history:
        return {"latest_cost": 0}
    return {"latest_cost": history[0].unit_price}


# --- BOM (Bill of Materials) Endpoints ---

@router.get("/products/{product_id}/bom", response_model=List[BOMItemResponse])
async def get_bom(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    ?뱀젙 ?쒗뭹??BOM(?섏쐞 遺??紐⑸줉) 議고쉶
    """
    result = await db.execute(
        select(BOM)
        .options(selectinload(BOM.child_product))
        .where(BOM.parent_product_id == product_id)
    )
    bom_items = result.scalars().all()
    return bom_items


@router.put("/products/{product_id}/bom", response_model=List[BOMItemResponse])
async def update_bom(
    product_id: int,
    items: List[BOMItemCreate],
    db: AsyncSession = Depends(get_db)
):
    """
    ?뱀젙 ?쒗뭹??BOM ?꾩껜 援먯껜 (???踰꾪듉)
    """
    try:
        # 湲곗〈 BOM ?꾩껜 ??젣
        await db.execute(delete(BOM).where(BOM.parent_product_id == product_id))

        # ??BOM ??ぉ ?쇨큵 ?낅젰
        new_items = []
        for item in items:
            if item.child_product_id == product_id:
                raise HTTPException(status_code=400, detail="?먭린 ?먯떊??BOM ?섏쐞 ?덈ぉ?쇰줈 ?ㅼ젙?????놁뒿?덈떎.")
            bom_row = BOM(
                parent_product_id=product_id,
                child_product_id=item.child_product_id,
                required_quantity=item.required_quantity
            )
            db.add(bom_row)
            new_items.append(bom_row)

        await db.commit()

        # Re-fetch with eager load
        result = await db.execute(
            select(BOM)
            .options(selectinload(BOM.child_product))
            .where(BOM.parent_product_id == product_id)
        )
        return result.scalars().all()

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"BOM ????ㅽ뙣: {str(e)}")


@router.delete("/products/{product_id}/bom/{bom_id}")
async def delete_bom_item(
    product_id: int,
    bom_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    BOM ?⑥씪 ??ぉ ??젣
    """
    result = await db.execute(
        select(BOM).where(BOM.id == bom_id, BOM.parent_product_id == product_id)
    )
    bom_item = result.scalar_one_or_none()
    if not bom_item:
        raise HTTPException(status_code=404, detail="BOM ??ぉ??李얠쓣 ???놁뒿?덈떎.")

    try:
        await db.delete(bom_item)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"BOM ??젣 ?ㅽ뙣: {str(e)}")

    return {"message": "BOM item deleted successfully"}
