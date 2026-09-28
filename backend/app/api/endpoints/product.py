from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, or_
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional, Any

from app.api.deps import get_db
from app.models.product import Product, Process, ProductProcess, ProductGroup, BOM, ProductPriceHistory as ProductPriceHistoryModel
from app.models.sales import Estimate, EstimateItem, SalesOrder, SalesOrderItem
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, OutsourcingOrder, OutsourcingOrderItem
from app.models.basics import Partner
from app.schemas.product import (
    ProductCreate, ProductResponse, ProcessCreate, ProcessResponse, 
    ProductUpdate, ProcessUpdate, ProductGroupCreate, ProductGroupResponse, 
    ProductGroupUpdate, ProductPriceHistory, ProcessCostHistory, ProcessQuickCreate,
    BOMItemCreate, BOMItemResponse, CloneToTargetsRequest
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
    major_group_id: Optional[int] = None,
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
    프론트엔드 제품 수정 화면에서 즉시 새 공정을 등록하기 위한 API
    """
    new_process = Process(
        name=process_in.name,
        course_type=process_in.course_type,
        group_id=process_in.group_id,
        # major_group_id는 ProductGroup 테이블에는 별도 필드가 있으나 Process 테이블에는 group_id(소그룹)만 연결되어 있어
        # 필요시 Process 모델을 확인해야 하지만 현재 스키마상 group_id(minor)만 받음.
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

    # 1.1 Record initial Price History if provided
    if product.recent_price and product.recent_price > 0:
        price_rec = ProductPriceHistoryModel(
            product_id=new_product.id,
            price=product.recent_price,
            type="MANUAL",
            note="초기 등록"
        )
        db.add(price_rec)

    # Auto-initialize Stock with 0 quantity
    from app.models.inventory import Stock
    new_stock = Stock(product_id=new_product.id, current_quantity=0, location="기본창고")
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
    limit: int = 9999,
    item_type: Optional[str] = None,
    partner_id: Optional[int] = None,
    group_id: Optional[int] = None,
    major_group_id: Optional[int] = None,
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
        # 해당 거래처 제품 + 공용 제품(partner_id 없음) 모두 포함
        query = query.where(
            or_(Product.partner_id == partner_id, Product.partner_id == None)
        )
    
    if item_type:
        # 지원하는 경우 콤마로 구분된 여러 타입을 받을 수 있도록 처리
        if "," in item_type:
            types = [t.strip() for t in item_type.split(",")]
            query = query.where(Product.item_type.in_(types))
        else:
            query = query.where(Product.item_type == item_type)
        
    
    result = await db.execute(query.offset(skip).limit(limit))
    products = result.unique().scalars().all()
    
    # Enrich with latest_price
    enriched_products = []
    for p in products:
        # [Fix] 품목 유형에 따라 적절한 단가 이력 함수 호출
        if p.item_type in ["PART", "CONSUMABLE", "RAW_MATERIAL"]:
            p_history = await get_product_purchase_history(p.id, db)
        else:
            p_history = await get_product_price_history(p.id, db)
            
        latest_price = p_history[0].unit_price if p_history else 0.0
        p.latest_price = latest_price
        p.partner_name = p.partner.name if p.partner else None
        enriched_products.append(p)
        
    return enriched_products

@router.get("/products/{product_id}", response_model=ProductResponse)
async def read_product(
    product_id: int,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Get a single product by ID.
    """
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items).selectinload(BOM.child_product),
            joinedload(Product.partner)
        )
        .where(Product.id == product_id)
    )
    product = result.unique().scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Enrich with latest_price and partner_name
    # [Fix] 품목 유형에 따라 적절한 단가 이력 함수 호출
    if product.item_type in ["PART", "CONSUMABLE", "RAW_MATERIAL"]:
        p_history = await get_product_purchase_history(product.id, db)
    else:
        p_history = await get_product_price_history(product.id, db)
        
    product.latest_price = p_history[0].unit_price if p_history else 0.0
    product.partner_name = product.partner.name if product.partner else None
    
    return product

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
            
    # Update other fields and check price change
    price_changed = False
    if "recent_price" in update_data:
        new_price = update_data.get("recent_price")
        if new_price != product.recent_price:
            price_changed = True
            
    for key, value in update_data.items():
        setattr(product, key, value)
        
    if price_changed:
        price_rec = ProductPriceHistoryModel(
            product_id=product.id,
            price=product.recent_price,
            type="MANUAL",
            note="수동 수정"
        )
        db.add(price_rec)

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
    특정 제품의 과거 구매(발주) 내역 조회
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
            total_amount=(item.quantity or 0) * (item.unit_price or 0),
            order_no=order.order_no
        ))
    
    # [NEW] Add Manual History
    try:
        manual_stmt = select(ProductPriceHistoryModel).where(ProductPriceHistoryModel.product_id == product_id).order_by(ProductPriceHistoryModel.date.desc())
        m_res = await db.execute(manual_stmt)
        for m in m_res.scalars().all():
            history.append(ProductPriceHistory(
                date=m.date.strftime("%Y-%m-%d") if m.date else "-",
                type="MANUAL",
                partner_name="-",
                quantity=0,
                unit_price=m.price,
                total_amount=0,
                order_no=m.note or "수동 입력"
            ))
    except Exception as e:
        # If table is missing, just log and continue without manual history
        print(f"⚠️ Warning: Failed to fetch manual price history (table might be missing): {e}")
        await db.rollback()

    history.sort(key=lambda x: x.date, reverse=True)

    return history

@router.get("/{product_id}/sales-history", response_model=List[ProductPriceHistory])
async def get_product_price_history(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    특정 제품의 과거 견적 및 수주 내역 통합 조회
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
    특정 제품-공정 조합의 원가 이력 (구매/외주) 조회
    """
    # Check process type
    proc_stmt = select(Process).where(Process.id == process_id)
    proc_res = await db.execute(proc_stmt)
    process = proc_res.scalar_one_or_none()
    if not process:
        raise HTTPException(status_code=404, detail="Process not found")

    history = []
    
    if process.course_type == "PURCHASE":
        # 자재 구매 내역
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
        # 외주 발주 내역
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
    가장 최근의 실거래가 조회
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
    특정 제품의 BOM(하위 부품 목록) 조회
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
    특정 제품의 BOM 전체 교체 (저장 버튼)
    """
    try:
        # 기존 BOM 전체 삭제
        await db.execute(delete(BOM).where(BOM.parent_product_id == product_id))

        # 새 BOM 항목 일괄 입력
        new_items = []
        for item in items:
            if item.child_product_id == product_id:
                raise HTTPException(status_code=400, detail="자기 자신을 BOM 하위 품목으로 설정할 수 없습니다.")
            bom_row = BOM(
                parent_product_id=product_id,
                child_product_id=item.child_product_id,
                required_quantity=item.required_quantity,
                substitute_product_id=item.substitute_product_id
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
        raise HTTPException(status_code=500, detail=f"BOM 저장 실패: {str(e)}")


@router.delete("/products/{product_id}/bom/{bom_id}")
async def delete_bom_item(
    product_id: int,
    bom_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    BOM 단일 항목 삭제
    """
    result = await db.execute(
        select(BOM).where(BOM.id == bom_id, BOM.parent_product_id == product_id)
    )
    bom_item = result.scalar_one_or_none()
    if not bom_item:
        raise HTTPException(status_code=404, detail="BOM 항목을 찾을 수 없습니다.")

    try:
        await db.delete(bom_item)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"BOM 삭제 실패: {str(e)}")

    return {"message": "BOM item deleted successfully"}

@router.post("/products/{product_id}/clone-to-targets")
async def clone_product_to_targets(
    product_id: int,
    request: CloneToTargetsRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    원본 제품의 공정 및 BOM 정보를 여러 대상 제품에 덮어쓰기
    """
    # 1. Fetch source product
    source_result = await db.execute(
        select(Product)
        .options(selectinload(Product.standard_processes), selectinload(Product.bom_items))
        .where(Product.id == product_id)
    )
    source_product = source_result.scalar_one_or_none()
    if not source_product:
        raise HTTPException(status_code=404, detail="Source product not found")

    if not request.target_product_ids:
        raise HTTPException(status_code=400, detail="No target products specified")

    try:
        # For each target product
        for target_id in request.target_product_ids:
            if target_id == product_id:
                continue # Skip self

            # 2. Delete existing routing processes
            await db.execute(delete(ProductProcess).where(ProductProcess.product_id == target_id))
            
            # 3. Delete existing BOM items
            await db.execute(delete(BOM).where(BOM.parent_product_id == target_id))
            
            # 4. Insert new processes from source
            for pp in source_product.standard_processes:
                new_pp = ProductProcess(
                    product_id=target_id,
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
            
            # 5. Insert new BOM items from source
            for bom in source_product.bom_items:
                if bom.child_product_id == target_id:
                    continue # Prevent self-referencing
                new_bom = BOM(
                    parent_product_id=target_id,
                    child_product_id=bom.child_product_id,
                    required_quantity=bom.required_quantity,
                    substitute_product_id=bom.substitute_product_id
                )
                db.add(new_bom)

        await db.commit()
        return {"message": "Success", "cloned_to": request.target_product_ids}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Clone failed: {str(e)}")


# --- Excel Export Endpoint ---

@router.get("/products/{product_id}/export-excel")
async def export_product_excel(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    특정 생산제품의 공정, 견적/수주 이력, BOM, 마진 분석을 엑셀 파일로 출력
    """
    import io
    from fastapi.responses import StreamingResponse
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    # 1. 제품 정보 조회
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items).selectinload(BOM.child_product),
            joinedload(Product.partner)
        )
        .where(Product.id == product_id)
    )
    product = result.unique().scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 2. 견적/수주 이력 조회
    sales_history = await get_product_price_history(product_id, db)

    # 3. BOM 부품 단가 이력 (최신)
    bom_part_prices = {}
    for bom_item in product.bom_items:
        cid = bom_item.child_product_id
        ph = await get_product_purchase_history(cid, db)
        bom_part_prices[cid] = ph[0].unit_price if ph else 0.0

    # ── 스타일 정의 ──
    header_fill = PatternFill("solid", fgColor="1E3A5F")
    sub_header_fill = PatternFill("solid", fgColor="2D5A8E")
    section_fill = PatternFill("solid", fgColor="0F2744")
    margin_fill = PatternFill("solid", fgColor="1A4731")
    warn_fill = PatternFill("solid", fgColor="6B2C1A")
    alt_fill = PatternFill("solid", fgColor="1A2535")
    white_font = Font(color="FFFFFF", bold=True, name="맑은 고딕", size=10)
    normal_font = Font(color="D1D5DB", name="맑은 고딕", size=9)
    value_font = Font(color="F3F4F6", name="맑은 고딕", size=9)
    green_font = Font(color="4ADE80", bold=True, name="맑은 고딕", size=9)
    red_font = Font(color="F87171", bold=True, name="맑은 고딕", size=9)
    yellow_font = Font(color="FACC15", bold=True, name="맑은 고딕", size=10)
    thin_border = Border(
        left=Side(style='thin', color='374151'),
        right=Side(style='thin', color='374151'),
        top=Side(style='thin', color='374151'),
        bottom=Side(style='thin', color='374151')
    )
    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left_align = Alignment(horizontal='left', vertical='center', wrap_text=True)
    right_align = Alignment(horizontal='right', vertical='center')

    def set_header_row(ws, row, values, fill=None):
        for col, val in enumerate(values, 1):
            cell = ws.cell(row=row, column=col, value=val)
            cell.font = white_font
            cell.fill = fill or sub_header_fill
            cell.alignment = center_align
            cell.border = thin_border

    def set_data_row(ws, row, values, fonts=None, aligns=None, fill=None):
        f = fill or (alt_fill if row % 2 == 0 else PatternFill("solid", fgColor="0D1B2A"))
        for col, val in enumerate(values, 1):
            cell = ws.cell(row=row, column=col, value=val)
            cell.font = (fonts[col-1] if fonts and col-1 < len(fonts) else value_font)
            cell.alignment = (aligns[col-1] if aligns and col-1 < len(aligns) else left_align)
            cell.fill = f
            cell.border = thin_border

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # ══════════════════════════════════════════
    # 시트 1: 제품 요약 + 마진 분석
    # ══════════════════════════════════════════
    ws1 = wb.create_sheet("마진 분석")
    ws1.sheet_view.showGridLines = False
    ws1.column_dimensions['A'].width = 20
    ws1.column_dimensions['B'].width = 30
    ws1.column_dimensions['C'].width = 20
    ws1.column_dimensions['D'].width = 30

    # 제목
    ws1.merge_cells('A1:D1')
    title_cell = ws1['A1']
    title_cell.value = f"생산제품 원가/마진 분석표"
    title_cell.font = Font(color="FFFFFF", bold=True, name="맑은 고딕", size=14)
    title_cell.fill = PatternFill("solid", fgColor="0F2744")
    title_cell.alignment = center_align
    ws1.row_dimensions[1].height = 32

    # 제품 기본정보
    row = 2
    ws1.merge_cells(f'A{row}:D{row}')
    ws1[f'A{row}'].value = "■ 제품 기본 정보"
    ws1[f'A{row}'].font = yellow_font
    ws1[f'A{row}'].fill = section_fill
    ws1[f'A{row}'].alignment = left_align
    ws1.row_dimensions[row].height = 20
    row += 1

    info_rows = [
        ("품명", product.name or "-", "규격", product.specification or "-"),
        ("재질", product.material or "-", "단위", product.unit or "EA"),
        ("거래처", product.partner.name if product.partner else "-", "제품 그룹", ""),
        ("최근 수주단가", f"₩{product.recent_price:,.0f}" if product.recent_price else "-", "", ""),
    ]
    for r in info_rows:
        ws1.cell(row=row, column=1, value=r[0]).font = normal_font
        ws1.cell(row=row, column=1).fill = sub_header_fill
        ws1.cell(row=row, column=1).alignment = center_align
        ws1.cell(row=row, column=1).border = thin_border
        ws1.cell(row=row, column=2, value=r[1]).font = value_font
        ws1.cell(row=row, column=2).fill = alt_fill
        ws1.cell(row=row, column=2).alignment = left_align
        ws1.cell(row=row, column=2).border = thin_border
        ws1.cell(row=row, column=3, value=r[2]).font = normal_font
        ws1.cell(row=row, column=3).fill = sub_header_fill
        ws1.cell(row=row, column=3).alignment = center_align
        ws1.cell(row=row, column=3).border = thin_border
        ws1.cell(row=row, column=4, value=r[3]).font = value_font
        ws1.cell(row=row, column=4).fill = alt_fill
        ws1.cell(row=row, column=4).alignment = left_align
        ws1.cell(row=row, column=4).border = thin_border
        ws1.row_dimensions[row].height = 18
        row += 1

    row += 1

    # 공정비용 분석
    ws1.merge_cells(f'A{row}:D{row}')
    ws1[f'A{row}'].value = "■ 공정별 비용 분석"
    ws1[f'A{row}'].font = yellow_font
    ws1[f'A{row}'].fill = section_fill
    ws1[f'A{row}'].alignment = left_align
    ws1.row_dimensions[row].height = 20
    row += 1

    set_header_row(ws1, row, ["순서", "공정명", "유형", "공정단가 (₩)"])
    ws1.row_dimensions[row].height = 18
    row += 1

    total_process_cost = 0
    for pp in sorted(product.standard_processes, key=lambda x: x.sequence):
        proc_name = pp.process.name if pp.process else f"공정ID:{pp.process_id}"
        course_map = {"INTERNAL": "내부", "OUTSOURCING": "외주", "PURCHASE": "구매"}
        course = course_map.get(pp.process.course_type if pp.process else "", "-")
        cost = pp.cost or 0
        total_process_cost += cost
        set_data_row(ws1, row, [pp.sequence, proc_name, course, cost],
                     fonts=[value_font, value_font, value_font, value_font],
                     aligns=[center_align, left_align, center_align, right_align])
        ws1.row_dimensions[row].height = 17
        row += 1

    # 합계
    set_data_row(ws1, row, ["합계", "", "", total_process_cost],
                 fonts=[white_font, white_font, white_font, white_font],
                 aligns=[center_align, left_align, center_align, right_align],
                 fill=sub_header_fill)
    ws1.row_dimensions[row].height = 18
    row += 2

    # BOM 비용 분석
    ws1.merge_cells(f'A{row}:D{row}')
    ws1[f'A{row}'].value = "■ BOM 부품 비용 분석"
    ws1[f'A{row}'].font = yellow_font
    ws1[f'A{row}'].fill = section_fill
    ws1[f'A{row}'].alignment = left_align
    ws1.row_dimensions[row].height = 20
    row += 1

    set_header_row(ws1, row, ["부품명", "규격", "소요수량", "최근단가 (₩)"])
    ws1.row_dimensions[row].height = 18
    row += 1

    total_bom_cost = 0
    for bom_item in product.bom_items:
        cp = bom_item.child_product
        part_name = cp.name if cp else f"ID:{bom_item.child_product_id}"
        spec = cp.specification if cp else ""
        qty = bom_item.required_quantity or 1
        unit_price = bom_part_prices.get(bom_item.child_product_id, 0)
        line_cost = qty * unit_price
        total_bom_cost += line_cost
        set_data_row(ws1, row, [part_name, spec, qty, unit_price],
                     aligns=[left_align, left_align, center_align, right_align])
        ws1.row_dimensions[row].height = 17
        row += 1

    set_data_row(ws1, row, ["합계", "", "", total_bom_cost],
                 fonts=[white_font, white_font, white_font, white_font],
                 aligns=[center_align, left_align, center_align, right_align],
                 fill=sub_header_fill)
    ws1.row_dimensions[row].height = 18
    row += 2

    # 마진 분석 종합
    ws1.merge_cells(f'A{row}:D{row}')
    ws1[f'A{row}'].value = "■ 마진 분석 종합"
    ws1[f'A{row}'].font = yellow_font
    ws1[f'A{row}'].fill = section_fill
    ws1[f'A{row}'].alignment = left_align
    ws1.row_dimensions[row].height = 20
    row += 1

    recent_price = product.recent_price or 0
    latest_order_price = sales_history[0].unit_price if sales_history else 0
    total_cost = total_process_cost + total_bom_cost
    margin_from_recent = recent_price - total_cost
    margin_pct_recent = (margin_from_recent / recent_price * 100) if recent_price > 0 else 0
    margin_from_order = latest_order_price - total_cost
    margin_pct_order = (margin_from_order / latest_order_price * 100) if latest_order_price > 0 else 0

    margin_rows = [
        ("공정 원가 합계", f"₩{total_process_cost:,.0f}"),
        ("BOM 부품비 합계", f"₩{total_bom_cost:,.0f}"),
        ("총 원가", f"₩{total_cost:,.0f}"),
        ("최근 수주 단가", f"₩{latest_order_price:,.0f}"),
        ("마진 (수주단가 기준)", f"₩{margin_from_order:,.0f}  ({margin_pct_order:.1f}%)"),
        ("등록 단가", f"₩{recent_price:,.0f}"),
        ("마진 (등록단가 기준)", f"₩{margin_from_recent:,.0f}  ({margin_pct_recent:.1f}%)"),
    ]
    for label, value in margin_rows:
        is_margin = "마진" in label
        is_cost = "원가" in label or "부품비" in label
        row_fill = margin_fill if is_margin else (sub_header_fill if is_cost else alt_fill)
        ws1.merge_cells(f'A{row}:B{row}')
        ws1.cell(row=row, column=1, value=label).font = white_font if is_margin or is_cost else normal_font
        ws1.cell(row=row, column=1).fill = row_fill
        ws1.cell(row=row, column=1).alignment = left_align
        ws1.cell(row=row, column=1).border = thin_border
        ws1.merge_cells(f'C{row}:D{row}')
        val_cell = ws1.cell(row=row, column=3, value=value)
        if is_margin:
            m_val = margin_from_order if "수주" in label else margin_from_recent
            val_cell.font = green_font if m_val >= 0 else red_font
        else:
            val_cell.font = value_font
        val_cell.fill = row_fill
        val_cell.alignment = right_align
        val_cell.border = thin_border
        ws1.row_dimensions[row].height = 20
        row += 1

    # ══════════════════════════════════════════
    # 시트 2: 공정 상세
    # ══════════════════════════════════════════
    ws2 = wb.create_sheet("공정 상세")
    ws2.sheet_view.showGridLines = False
    for col, w in zip(['A','B','C','D','E','F','G'], [8,30,12,15,15,15,20]):
        ws2.column_dimensions[col].width = w

    ws2.merge_cells('A1:G1')
    ws2['A1'].value = f"공정 상세 - {product.name}"
    ws2['A1'].font = Font(color="FFFFFF", bold=True, name="맑은 고딕", size=13)
    ws2['A1'].fill = section_fill
    ws2['A1'].alignment = center_align
    ws2.row_dimensions[1].height = 28

    set_header_row(ws2, 2, ["순서", "공정명", "유형", "외주처/설비", "소요시간(h)", "단가(₩)", "비고"])
    ws2.row_dimensions[2].height = 20

    data_row = 3
    for pp in sorted(product.standard_processes, key=lambda x: x.sequence):
        proc_name = pp.process.name if pp.process else f"공정ID:{pp.process_id}"
        course_map = {"INTERNAL": "내부", "OUTSOURCING": "외주", "PURCHASE": "구매"}
        course = course_map.get(pp.process.course_type if pp.process else "", "-")
        partner_equip = pp.partner_name or pp.equipment_name or ""
        set_data_row(ws2, data_row,
                     [pp.sequence, proc_name, course, partner_equip,
                      pp.estimated_time or 0, pp.cost or 0, pp.notes or ""],
                     aligns=[center_align, left_align, center_align, left_align,
                              center_align, right_align, left_align])
        ws2.row_dimensions[data_row].height = 17
        data_row += 1

    # ══════════════════════════════════════════
    # 시트 3: 견적/수주 이력
    # ══════════════════════════════════════════
    ws3 = wb.create_sheet("견적수주 이력")
    ws3.sheet_view.showGridLines = False
    for col, w in zip(['A','B','C','D','E','F'], [14,8,25,15,15,20]):
        ws3.column_dimensions[col].width = w

    ws3.merge_cells('A1:F1')
    ws3['A1'].value = f"견적/수주 이력 - {product.name}"
    ws3['A1'].font = Font(color="FFFFFF", bold=True, name="맑은 고딕", size=13)
    ws3['A1'].fill = section_fill
    ws3['A1'].alignment = center_align
    ws3.row_dimensions[1].height = 28

    set_header_row(ws3, 2, ["일자", "구분", "거래처", "수량", "단가(₩)", "주문번호"])
    ws3.row_dimensions[2].height = 20

    type_map = {"QUOTATION": "견적", "ORDER": "수주"}
    data_row = 3
    for h in sales_history:
        t_label = type_map.get(h.type, h.type)
        set_data_row(ws3, data_row,
                     [h.date, t_label, h.partner_name, h.quantity, h.unit_price, h.order_no or ""],
                     aligns=[center_align, center_align, left_align, center_align, right_align, center_align])
        ws3.row_dimensions[data_row].height = 17
        data_row += 1

    if data_row == 3:
        ws3.cell(row=3, column=1, value="이력 없음").font = normal_font
        ws3.merge_cells('A3:F3')

    # ══════════════════════════════════════════
    # 시트 4: BOM 상세
    # ══════════════════════════════════════════
    ws4 = wb.create_sheet("BOM")
    ws4.sheet_view.showGridLines = False
    for col, w in zip(['A','B','C','D','E','F'], [30,20,12,15,15,20]):
        ws4.column_dimensions[col].width = w

    ws4.merge_cells('A1:F1')
    ws4['A1'].value = f"BOM (자재명세서) - {product.name}"
    ws4['A1'].font = Font(color="FFFFFF", bold=True, name="맑은 고딕", size=13)
    ws4['A1'].fill = section_fill
    ws4['A1'].alignment = center_align
    ws4.row_dimensions[1].height = 28

    set_header_row(ws4, 2, ["부품명", "규격", "소요수량", "최근단가(₩)", "소계(₩)", "비고"])
    ws4.row_dimensions[2].height = 20

    data_row = 3
    for bom_item in product.bom_items:
        cp = bom_item.child_product
        part_name = cp.name if cp else f"ID:{bom_item.child_product_id}"
        spec = cp.specification if cp else ""
        qty = bom_item.required_quantity or 1
        unit_price = bom_part_prices.get(bom_item.child_product_id, 0)
        line_cost = qty * unit_price
        set_data_row(ws4, data_row,
                     [part_name, spec, qty, unit_price, line_cost, ""],
                     aligns=[left_align, left_align, center_align, right_align, right_align, left_align])
        ws4.row_dimensions[data_row].height = 17
        data_row += 1

    if data_row == 3:
        ws4.cell(row=3, column=1, value="BOM 없음").font = normal_font
        ws4.merge_cells('A3:F3')

    # 파일 스트림으로 반환
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    safe_name = product.name.replace("/", "_").replace("\\", "_") if product.name else "product"
    filename = f"제품분석_{safe_name}.xlsx"
    encoded_filename = filename.encode('utf-8').decode('latin-1', errors='replace')

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename.replace(' ', '%20')}"
        }
    )

