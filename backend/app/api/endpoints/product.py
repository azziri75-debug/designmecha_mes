from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional

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
    new_process = Process(**process.model_dump())
    db.add(new_process)
    await db.commit()
    await db.refresh(new_process)
    return new_process

@router.get("/processes/", response_model=List[ProcessResponse])
async def read_processes(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Process).offset(skip).limit(limit))
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
    limit: int = 100,
    partner_id: int = None,
    item_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    # Eager loading needed for standard_processes AND its nested process relationship
    query = select(Product).options(
        selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(Product.bom_items).selectinload(BOM.child_product),
        joinedload(Product.partner)
    )
    
    if partner_id:
        query = query.where(Product.partner_id == partner_id)
    
    if item_type:
        # 지원하는 경우 콤마로 구분된 여러 타입을 받을 수 있도록 처리
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
    
    # Re-fetch with eager load
    result = await db.execute(
        select(Product)
        .select_from(Product)
        .options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items).selectinload(BOM.child_product),
            joinedload(Product.partner)
        )
        .where(Product.id == product_id)
    )
    updated_product = result.scalar_one()
    updated_product.partner_name = updated_product.partner.name if updated_product.partner else None
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
    
    # Bug 1 Fix: Explicitly delete related Stock records
    from app.models.inventory import Stock
    await db.execute(delete(Stock).where(Stock.product_id == product_id))
    
    await db.delete(product)
    await db.commit()
    return {"message": "Product deleted successfully"}

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
