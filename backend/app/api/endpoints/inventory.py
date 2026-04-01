from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, insert, func, desc, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import date

from app.api.deps import get_db
from app.models.inventory import Stock, StockProduction, StockProductionStatus
from app.models.product import Product, ProductProcess
from app.schemas.inventory import (
    StockResponse, StockUpdate,
    StockProductionResponse, StockProductionCreate, StockProductionUpdate
)

router = APIRouter()

# --- Stock Endpoints ---

@router.get("/stocks", response_model=List[StockResponse])
async def read_stocks(
    item_type: Optional[str] = None,
    partner_id: Optional[int] = None,
    product_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    from app.models.production import ProductionPlan, ProductionPlanItem
    from app.models.inventory import StockProduction
    
    # Correct initialization will happen below to avoid variable shadowing and filter loss.
    pass

    # Refactored: Efficient single query with subqueries to avoid N+1 and MissingGreenlet
    # Refactored: Master WIP Calculation Strategy (Non-overlapping)
    # Part 1: Confirmed Orders that don't have a plan yet
    # Part 2: Pending Stock Productions that don't have a plan yet
    # Part 3: All active Production Plans (sum unique plan quantities via sequence=1)
    
    # Refactored: Ultimate 4-Part WIP Calculation Strategy (Non-overlapping)
    # Part 1: SO Wait (Confirmed SO with NO plan)
    # Part 2: SO Active (Plans linked to SO)
    # Part 3: SP Wait (Pending SP with NO plan)
    # Part 4: SP Active (Plans linked to SP)
    
    from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
    from app.models.production import ProductionStatus, ProductionPlan, ProductionPlanItem

    # Define statuses that represent 'Finished/Inactive' states to exclude from WIP
    # Using both spellings 'CANCELLED' and 'CANCELED' just in case, based on Enum inconsistencies
    finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
    finished_plan_statuses = ['COMPLETED', 'CANCELED'] # ProductionStatus uses one L
    finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]

    active_order_products_subq = select(ProductionPlanItem.product_id)\
        .join(ProductionPlan)\
        .where(ProductionPlan.order_id == SalesOrder.id)

    # 1. SO Wait (Confirmed or Pending SO where THIS SPECIFIC PRODUCT is NOT yet planned for this order)
    so_wait_subq = select(func.coalesce(func.sum(SalesOrderItem.quantity), 0))\
        .join(SalesOrder)\
        .where(SalesOrderItem.product_id == Product.id)\
        .where(SalesOrder.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED]))\
        .where(~SalesOrderItem.product_id.in_(active_order_products_subq))\
        .scalar_subquery()

    # We need to sum ProductionPlanItem.quantity. BUT a single product in a plan might have MULTIPLE processes (rows), 
    # and they all have the same target quantity. To avoid double/triple counting, 
    # we take the max quantity per (plan_id, product_id) first, then sum those maxes.
    active_plan_product_qty = select(
        ProductionPlanItem.plan_id,
        ProductionPlanItem.product_id,
        ProductionPlan.order_id,
        ProductionPlan.stock_production_id,
        func.max(ProductionPlanItem.quantity).label('qty')
    )\
    .join(ProductionPlan)\
    .where(ProductionPlanItem.status.not_in(finished_plan_statuses))\
    .group_by(ProductionPlanItem.plan_id, ProductionPlanItem.product_id, ProductionPlan.order_id, ProductionPlan.stock_production_id)\
    .subquery()

    # 2. SO Active (Sum unique quantites for active plans tied to SO)
    so_active_subq = select(func.coalesce(func.sum(active_plan_product_qty.c.qty), 0))\
        .where(active_plan_product_qty.c.product_id == Product.id)\
        .where(active_plan_product_qty.c.order_id.is_not(None))\
        .scalar_subquery()

    active_sp_products_subq = select(ProductionPlanItem.product_id)\
        .join(ProductionPlan)\
        .where(ProductionPlan.stock_production_id == StockProduction.id)

    # 3. SP Wait
    sp_wait_subq = select(func.coalesce(func.sum(StockProduction.quantity), 0))\
        .where(StockProduction.product_id == Product.id)\
        .where(StockProduction.status.not_in(finished_sp_statuses))\
        .where(~StockProduction.product_id.in_(active_sp_products_subq))\
        .scalar_subquery()

    # 4. SP Active (Sum unique quantites for active plans tied to SP)
    sp_active_subq = select(func.coalesce(func.sum(active_plan_product_qty.c.qty), 0))\
        .where(active_plan_product_qty.c.product_id == Product.id)\
        .where(active_plan_product_qty.c.stock_production_id.is_not(None))\
        .scalar_subquery()

    from sqlalchemy import or_
    # Final query: Start from Product to include items with NO stock record yet (9 items vs 6 items bug fix)
    query = select(
        Product,
        Stock,
        so_wait_subq.label("so_wait"),
        so_active_subq.label("so_active"),
        sp_wait_subq.label("sp_wait"),
        sp_active_subq.label("sp_active")
    ).outerjoin(Stock, Stock.product_id == Product.id)

    # Apply Filters to the Unified Query
    if item_type:
        query = query.where(Product.item_type == item_type)
    if partner_id:
        query = query.where(Product.partner_id == partner_id)
    if product_name:
        query = query.where(
            or_(
                Product.name.ilike(f"%{product_name}%"),
                Product.specification.ilike(f"%{product_name}%")
            )
        )

    # Bug 2 Fix: Exclude CONSUMABLE items but handle NULL item_type safely
    query = query.where(or_(Product.item_type != 'CONSUMABLE', Product.item_type.is_(None)))

    result = await db.execute(query)
    rows = result.all()

    final_stocks = []
    for row in rows:
        product = row[0]
        stock_obj = row[1]
        
        # Calculate computed fields
        producing_so = row[2] + row[3] # Wait SO + Active SO Plans
        producing_sp = row[4] + row[5] # Wait SP + Active SP Plans
        producing_total = producing_so + producing_sp
        
        # Build dictionary to match StockResponse schema
        stock_data = {
            "id": stock_obj.id if stock_obj else 0,
            "product_id": product.id,
            "current_quantity": stock_obj.current_quantity if stock_obj else 0,
            "in_production_quantity": producing_total,
            "location": stock_obj.location if stock_obj else None,
            "updated_at": stock_obj.updated_at if stock_obj else None,
            "product": product, # Product object serializes to ProductSimple correctly
            "producing_total": producing_total,
            "producing_so": producing_so,
            "producing_sp": producing_sp
        }
        final_stocks.append(stock_data)
        
    return final_stocks

@router.get("/stocks/{product_id}", response_model=StockResponse)
async def read_stock_by_product(product_id: int, db: AsyncSession = Depends(get_db)):
    from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
    from app.models.production import ProductionStatus, ProductionPlan, ProductionPlanItem

    finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
    finished_plan_statuses = ['COMPLETED', 'CANCELED']
    finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]

    # 1. SO Wait
    so_wait_subq = select(func.coalesce(func.sum(SalesOrderItem.quantity), 0))\
        .join(SalesOrder)\
        .outerjoin(ProductionPlan, ProductionPlan.order_id == SalesOrder.id)\
        .where(SalesOrderItem.product_id == product_id)\
        .where(SalesOrder.status.not_in(finished_so_statuses))\
        .where(ProductionPlan.id.is_(None))\
        .scalar_subquery()

    # 2. SO Active
    so_active_subq = select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0))\
        .join(ProductionPlan)\
        .where(ProductionPlanItem.product_id == product_id)\
        .where(ProductionPlanItem.status.not_in(finished_plan_statuses))\
        .where(ProductionPlanItem.sequence == 1)\
        .where(ProductionPlan.order_id.is_not(None))\
        .scalar_subquery()

    # 3. SP Wait
    sp_wait_subq = select(func.coalesce(func.sum(StockProduction.quantity), 0))\
        .outerjoin(ProductionPlan, ProductionPlan.stock_production_id == StockProduction.id)\
        .where(StockProduction.product_id == product_id)\
        .where(StockProduction.status.not_in(finished_sp_statuses))\
        .where(ProductionPlan.id.is_(None))\
        .scalar_subquery()

    # 4. SP Active
    sp_active_subq = select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0))\
        .join(ProductionPlan)\
        .where(ProductionPlanItem.product_id == product_id)\
        .where(ProductionPlanItem.status.not_in(finished_plan_statuses))\
        .where(ProductionPlanItem.sequence == 1)\
        .where(ProductionPlan.stock_production_id.is_not(None))\
        .scalar_subquery()

    query = select(
        Stock,
        so_wait_subq,
        so_active_subq,
        sp_wait_subq,
        sp_active_subq
    ).where(Stock.product_id == product_id).options(
        selectinload(Stock.product)
    )
    
    result = await db.execute(query)
    row = result.first()
    
    if not row:
        return {
            "id": 0,
            "product_id": product_id,
            "current_quantity": 0,
            "in_production_quantity": 0,
            "producing_total": 0,
            "producing_so": 0,
            "producing_sp": 0,
            "product": await db.get(Product, product_id)
        }
    
    stock_obj = row[0]
    producing_so = (row[1] or 0) + (row[2] or 0)
    producing_sp = (row[3] or 0) + (row[4] or 0)
    producing_total = producing_so + producing_sp
    
    return {
        "id": stock_obj.id,
        "product_id": stock_obj.product_id,
        "current_quantity": stock_obj.current_quantity,
        "in_production_quantity": producing_total,
        "location": stock_obj.location,
        "updated_at": stock_obj.updated_at,
        "product": stock_obj.product,
        "producing_total": producing_total,
        "producing_so": producing_so,
        "producing_sp": producing_sp
    }

@router.post("/stocks/init", response_model=StockResponse)
async def init_stock(stock_in: StockUpdate, product_id: int, db: AsyncSession = Depends(get_db)):
    """수동 재고 초기화 API"""
    # 품목 타입 확인 (소모품 차단)
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")
    if product.item_type == 'CONSUMABLE':
        raise HTTPException(status_code=400, detail="소모품은 재고를 관리하지 않습니다.")

    query = select(Stock).where(Stock.product_id == product_id)
    result = await db.execute(query)
    stock = result.scalar_one_or_none()
    
    if stock:
        raise HTTPException(status_code=400, detail="이미 해당 품목의 재고 레코드가 존재합니다.")
        
    # [CRITICAL] Recalculate WIP perfectly for the initial record and SYNC TO DB COLUMN
    from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
    from app.models.production import ProductionStatus, ProductionPlan, ProductionPlanItem
    
    finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
    finished_plan_statuses = ['COMPLETED', 'CANCELED']
    finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]

    so_wait_subq = select(func.coalesce(func.sum(SalesOrderItem.quantity), 0))\
        .join(SalesOrder).outerjoin(ProductionPlan, ProductionPlan.order_id == SalesOrder.id)\
        .where(SalesOrderItem.product_id == product_id).where(SalesOrder.status.not_in(finished_so_statuses))\
        .where(ProductionPlan.id.is_(None)).scalar_subquery()

    so_active_subq = select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0))\
        .join(ProductionPlan).where(ProductionPlanItem.product_id == product_id)\
        .where(ProductionPlanItem.status.not_in(finished_plan_statuses)).where(ProductionPlanItem.sequence == 1)\
        .where(ProductionPlan.order_id.is_not(None)).scalar_subquery()

    sp_wait_subq = select(func.coalesce(func.sum(StockProduction.quantity), 0))\
        .outerjoin(ProductionPlan, ProductionPlan.stock_production_id == StockProduction.id)\
        .where(StockProduction.product_id == product_id).where(StockProduction.status.not_in(finished_sp_statuses))\
        .where(ProductionPlan.id.is_(None)).scalar_subquery()

    sp_active_subq = select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0))\
        .join(ProductionPlan).where(ProductionPlanItem.product_id == product_id)\
        .where(ProductionPlanItem.status.not_in(finished_plan_statuses)).where(ProductionPlanItem.sequence == 1)\
        .where(ProductionPlan.stock_production_id.is_not(None)).scalar_subquery()

    # Get the calculated totals
    calc_res = await db.execute(select(so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq))
    row = calc_res.first()
    producing_so = (row[0] or 0) + (row[1] or 0)
    producing_sp = (row[2] or 0) + (row[3] or 0)
    producing_total = producing_so + producing_sp

    stock = Stock(
        product_id=product_id,
        current_quantity=stock_in.current_quantity or 0,
        in_production_quantity=producing_total, # SAVE IT TO DB
        location=stock_in.location
    )
    db.add(stock)
    await db.commit()
    await db.refresh(stock)
    
    # Reload with product for Response
    q = select(Stock).where(Stock.id == stock.id).options(selectinload(Stock.product))
    res = await db.execute(q)
    stock_obj = res.scalar_one()
    
    return {
        "id": stock_obj.id,
        "product_id": stock_obj.product_id,
        "current_quantity": stock_obj.current_quantity,
        "in_production_quantity": producing_total,
        "location": stock_obj.location,
        "updated_at": stock_obj.updated_at,
        "product": stock_obj.product,
        "producing_total": producing_total,
        "producing_so": producing_so,
        "producing_sp": producing_sp
    }

@router.put("/stocks/{product_id}", response_model=StockResponse)
async def update_stock(product_id: int, stock_in: StockUpdate, db: AsyncSession = Depends(get_db)):
    # 품목 타입 확인 (소모품 차단)
    product = await db.get(Product, product_id)
    if product and product.item_type == 'CONSUMABLE':
        raise HTTPException(status_code=400, detail="소모품은 재고를 관리하지 않습니다.")

    query = select(Stock).where(Stock.product_id == product_id)
    result = await db.execute(query)
    stock = result.scalar_one_or_none()
    
    # [IMPORTANT] Prevent manual overwrite of in_production_quantity
    payload = stock_in.model_dump(exclude_unset=True)
    if "in_production_quantity" in payload:
        del payload["in_production_quantity"]

    if not stock:
        stock = Stock(product_id=product_id, **payload)
        db.add(stock)
    else:
        for field, value in payload.items():
            setattr(stock, field, value)
            
    await db.commit()
    await db.refresh(stock)
    
    # [CRITICAL] Recalculate WIP perfectly for the response and SYNC TO DB COLUMN
    from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
    from app.models.production import ProductionStatus, ProductionPlan, ProductionPlanItem
    
    finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
    finished_plan_statuses = ['COMPLETED', 'CANCELED']
    finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]

    so_wait_subq = select(func.coalesce(func.sum(SalesOrderItem.quantity), 0))\
        .join(SalesOrder).outerjoin(ProductionPlan, ProductionPlan.order_id == SalesOrder.id)\
        .where(SalesOrderItem.product_id == product_id).where(SalesOrder.status.not_in(finished_so_statuses))\
        .where(ProductionPlan.id.is_(None)).scalar_subquery()

    so_active_subq = select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0))\
        .join(ProductionPlan).where(ProductionPlanItem.product_id == product_id)\
        .where(ProductionPlanItem.status.not_in(finished_plan_statuses)).where(ProductionPlanItem.sequence == 1)\
        .where(ProductionPlan.order_id.is_not(None)).scalar_subquery()

    sp_wait_subq = select(func.coalesce(func.sum(StockProduction.quantity), 0))\
        .outerjoin(ProductionPlan, ProductionPlan.stock_production_id == StockProduction.id)\
        .where(StockProduction.product_id == product_id).where(StockProduction.status.not_in(finished_sp_statuses))\
        .where(ProductionPlan.id.is_(None)).scalar_subquery()

    sp_active_subq = select(func.coalesce(func.sum(ProductionPlanItem.quantity), 0))\
        .join(ProductionPlan).where(ProductionPlanItem.product_id == product_id)\
        .where(ProductionPlanItem.status.not_in(finished_plan_statuses)).where(ProductionPlanItem.sequence == 1)\
        .where(ProductionPlan.stock_production_id.is_not(None)).scalar_subquery()

    # Get the calculated totals
    calc_res = await db.execute(select(so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq))
    row = calc_res.first()
    producing_so = (row[0] or 0) + (row[1] or 0)
    producing_sp = (row[2] or 0) + (row[3] or 0)
    producing_total = producing_so + producing_sp

    # Sync to DB column
    stock.in_production_quantity = producing_total
    await db.commit()
    await db.refresh(stock)
    
    # Reload with product for Response
    q = select(Stock).where(Stock.id == stock.id).options(selectinload(Stock.product))
    res = await db.execute(q)
    stock_obj = res.scalar_one()
    
    return {
        "id": stock_obj.id,
        "product_id": stock_obj.product_id,
        "current_quantity": stock_obj.current_quantity,
        "in_production_quantity": producing_total,
        "location": stock_obj.location,
        "updated_at": stock_obj.updated_at,
        "product": stock_obj.product,
        "producing_total": producing_total,
        "producing_so": producing_so,
        "producing_sp": producing_sp
    }

@router.delete("/stocks/{product_id}")
async def delete_stock(product_id: int, db: AsyncSession = Depends(get_db)):
    """재고 레코드 개별 삭제 (관리자용 청소 도구)"""
    query = select(Stock).where(Stock.product_id == product_id)
    result = await db.execute(query)
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="재고 정보를 찾을 수 없습니다.")
    
    await db.delete(stock)
    await db.commit()
    return {"status": "success"}


# --- Stock Production Endpoints ---

@router.get("/productions", response_model=List[StockProductionResponse])
async def read_stock_productions(
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    partner_id: Optional[int] = None,
    product_name: Optional[str] = None,
    major_group_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(StockProduction).join(Product).options(
        selectinload(StockProduction.product),
        selectinload(StockProduction.partner)
    )
    if status:
        query = query.where(StockProduction.status == status)
    if start_date:
        query = query.where(StockProduction.request_date >= start_date)
    if end_date:
        query = query.where(StockProduction.request_date <= end_date)
    if partner_id:
        query = query.where(StockProduction.partner_id == partner_id)
    if product_name:
        query = query.where(Product.name.ilike(f"%{product_name}%"))
        
    if major_group_id:
        from app.models.product import ProductGroup
        subquery = select(StockProduction.id).join(Product).join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id, ProductGroup.parent_id == major_group_id))
        query = query.where(StockProduction.id.in_(subquery))

    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/productions", response_model=StockProductionResponse)
async def create_stock_production(
    prod_in: StockProductionCreate,
    db: AsyncSession = Depends(get_db)
) :
    # Generate production number if not provided
    if not prod_in.production_no:
        today = date.today().strftime("%Y%m%d")
        # Robust numbering: get the max production_no for today and increment its sequence
        query = select(StockProduction.production_no).filter(StockProduction.production_no.like(f"SP-{today}-%")).order_by(desc(StockProduction.production_no)).limit(1)
        result = await db.execute(query)
        last_prod_no = result.scalar()
        
        if last_prod_no:
            try:
                last_seq = int(last_prod_no.split("-")[-1])
                new_seq = last_seq + 1
            except (ValueError, IndexError):
                new_seq = 1
        else:
            new_seq = 1
            
        prod_in.production_no = f"SP-{today}-{new_seq:03d}"
        
    new_prod = StockProduction(**prod_in.model_dump())
    db.add(new_prod)
    
    # Update in_production_quantity in Stock
    stock_query = select(Stock).where(Stock.product_id == prod_in.product_id)
    res = await db.execute(stock_query)
    stock = res.scalar_one_or_none()
    if not stock:
        stock = Stock(product_id=prod_in.product_id, in_production_quantity=prod_in.quantity)
        db.add(stock)
    else:
        stock.in_production_quantity += prod_in.quantity
        
    await db.commit()
    await db.refresh(new_prod)
    
    # Reload with product and its relations to avoid MissingGreenlet
    query = select(StockProduction).where(StockProduction.id == new_prod.id).options(
        selectinload(StockProduction.product),
        selectinload(StockProduction.partner)
    )
    result = await db.execute(query)
    return result.scalar_one()

@router.put("/productions/{prod_id}", response_model=StockProductionResponse)
async def update_stock_production(
    prod_id: int,
    prod_in: StockProductionUpdate,
    db: AsyncSession = Depends(get_db)
):
    query = select(StockProduction).where(StockProduction.id == prod_id)
    res = await db.execute(query)
    db_prod = res.scalar_one_or_none()
    
    if not db_prod:
        raise HTTPException(status_code=404, detail="Production request not found")
        
    old_qty = db_prod.quantity
    old_status = db_prod.status
    
    update_data = prod_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_prod, field, value)
        
    # Handle quantity change effect on stock.in_production_quantity
    if "quantity" in update_data and old_status != "COMPLETED":
        qty_diff = db_prod.quantity - old_qty
        stock_query = select(Stock).where(Stock.product_id == db_prod.product_id)
        s_res = await db.execute(stock_query)
        stock = s_res.scalar_one_or_none()
        if stock:
            stock.in_production_quantity += qty_diff

    # Handle completion status change
    if "status" in update_data and update_data["status"] == "COMPLETED" and old_status != "COMPLETED":
        # Finalize stock
        stock_query = select(Stock).where(Stock.product_id == db_prod.product_id)
        s_res = await db.execute(stock_query)
        stock = s_res.scalar_one_or_none()
        if stock:
            stock.in_production_quantity -= db_prod.quantity
            stock.current_quantity += db_prod.quantity

    await db.commit()
    await db.refresh(db_prod)
    
    query = select(StockProduction).where(StockProduction.id == prod_id).options(
        selectinload(StockProduction.product),
        selectinload(StockProduction.partner)
    )
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/productions/{prod_id}")
async def delete_stock_production(prod_id: int, db: AsyncSession = Depends(get_db)):
    query = select(StockProduction).where(StockProduction.id == prod_id)
    res = await db.execute(query)
    db_prod = res.scalar_one_or_none()
    
    if not db_prod:
        raise HTTPException(status_code=404, detail="Not found")
    
    # 1. Manual Cleanup for linked ProductionPlans and their items
    from app.models.production import ProductionPlan, ProductionPlanItem, WorkOrder
    from app.models.quality import QualityDefect
    
    # Find linked plans
    plan_stmt = select(ProductionPlan).where(ProductionPlan.stock_production_id == prod_id)
    plan_res = await db.execute(plan_stmt)
    plans = plan_res.scalars().all()
    
    for plan in plans:
        # Delete Quality Defects linked to this plan
        await db.execute(
            select(QualityDefect).where(QualityDefect.plan_id == plan.id)
        )
        # We need to explicitly delete them to satisfy FK constraints if CASCADE isn't enough in asyncpg
        qd_result = await db.execute(select(QualityDefect).where(QualityDefect.plan_id == plan.id))
        for qd in qd_result.scalars().all():
            await db.delete(qd)
            
        # Delete Work Orders linked to this plan's items
        wo_result = await db.execute(
            select(WorkOrder).join(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan.id)
        )
        for wo in wo_result.scalars().all():
            await db.delete(wo)
            
        # Delete the plan itself
        await db.delete(plan)
    
    # 2. Stock Recovery
    if db_prod.status != "CANCELLED":
        stock_query = select(Stock).where(Stock.product_id == db_prod.product_id)
        s_res = await db.execute(stock_query)
        stock = s_res.scalar_one_or_none()
        
        if stock:
            if db_prod.status == "COMPLETED":
                # If completed, recovery means subtracting from current stock
                stock.current_quantity -= db_prod.quantity
            else:
                # If pending/in_progress, recovery means subtracting from production stock
                stock.in_production_quantity -= db_prod.quantity

    await db.delete(db_prod)
    await db.commit()
    return {"status": "success"}
@router.post("/recalculate")
async def recalculate_inventory(db: AsyncSession = Depends(get_db)):
    """
    모든 품목의 재고를 생산 실적, 납품 이력, BOM 소요량을 기반으로 전수 재계산합니다.
    """
    from app.models.production import ProductionStatus, ProductionPlan, ProductionPlanItem
    from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus, DeliveryHistoryItem
    from app.models.inventory import Stock, StockProduction
    from app.models.product import BOM, Product
    from sqlalchemy import func

    # 1. 모든 재고 데이터를 0으로 초기화 (소모품 제외)
    await db.execute(update(Stock).values(current_quantity=0, in_production_quantity=0))
    await db.flush()

    # 2. 모든 제품 리스트 가져오기
    from sqlalchemy import or_
    products_res = await db.execute(select(Product.id).where(or_(Product.item_type != 'CONSUMABLE', Product.item_type.is_(None))))
    product_ids = [p.id for p in products_res.scalars().all()]
    
    # 임시 저장소
    stock_map = {pid: {"current": 0, "producing": 0} for pid in product_ids}

    # 3. 모든 제품별 수량 합산 loop (Ultimate 4-Part strategy for WIP)
    # [A] current_quantity (Production completion & BOM deduction) AND Active Plan WIP
    plans_query = select(ProductionPlan).options(
        selectinload(ProductionPlan.items), 
        selectinload(ProductionPlan.order).selectinload(SalesOrder.items), 
        selectinload(ProductionPlan.stock_production)
    )
    plans = (await db.execute(plans_query)).scalars().all()
    
    active_statuses = ['PENDING', 'PLANNED', 'CONFIRMED', 'IN_PROGRESS']
    
    for plan in plans:
        qty = 0
        product_id = None
        if plan.stock_production:
            qty = plan.stock_production.quantity
            product_id = plan.stock_production.product_id
        elif plan.order and plan.order.items:
            qty = plan.order.items[0].quantity
            product_id = plan.order.items[0].product_id
            
        if not product_id: continue

        # Current Stock Accumulation
        if plan.status == ProductionStatus.COMPLETED:
            if product_id in stock_map:
                stock_map[product_id]["current"] += qty
            # BOM Deduction
            bom_query = select(BOM).where(BOM.parent_product_id == product_id)
            bom_res = await db.execute(bom_query)
            for bom in bom_res.scalars().all():
                if bom.child_product_id in stock_map:
                    stock_map[bom.child_product_id]["current"] -= int(bom.required_quantity * qty)
        # Producing WIP Accumulation (Active Plan parts)
        finished_plan_statuses = ['COMPLETED', 'CANCELED']
        if plan.status not in finished_plan_statuses:
            if product_id in stock_map:
                stock_map[product_id]["producing"] += qty

    # [B] Producing WIP calculations (Wait SO/Wait SP - NO Plan)
    # Part 1: SO Wait
    finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
    so_wait_query = select(SalesOrderItem.product_id, func.sum(SalesOrderItem.quantity))\
        .join(SalesOrder)\
        .outerjoin(ProductionPlan, ProductionPlan.order_id == SalesOrder.id)\
        .where(SalesOrder.status.not_in(finished_so_statuses))\
        .where(ProductionPlan.id.is_(None))\
        .group_by(SalesOrderItem.product_id)
    so_wait_res = await db.execute(so_wait_query)
    for pid, qty in so_wait_res.all():
        if pid in stock_map:
            stock_map[pid]["producing"] += qty

    # Part 2: SP Wait
    finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]
    sp_wait_query = select(StockProduction.product_id, func.sum(StockProduction.quantity))\
        .outerjoin(ProductionPlan, ProductionPlan.stock_production_id == StockProduction.id)\
        .where(StockProduction.status.not_in(finished_sp_statuses))\
        .where(ProductionPlan.id.is_(None))\
        .group_by(StockProduction.product_id)
    sp_wait_res = await db.execute(sp_wait_query)
    for pid, qty in sp_wait_res.all():
        if pid in stock_map:
            stock_map[pid]["producing"] += qty

    # [C] Delivery Histories (subtract from current)
    del_query = select(DeliveryHistoryItem).options(selectinload(DeliveryHistoryItem.order_item))
    del_res = await db.execute(del_query)
    for delivery in del_res.scalars().all():
        if delivery.order_item and delivery.order_item.product_id in stock_map:
            stock_map[delivery.order_item.product_id]["current"] -= delivery.quantity

    # 4. Final Sync to DB
    updated_count = 0
    for pid, vals in stock_map.items():
        s_query = select(Stock).where(Stock.product_id == pid)
        s_res = await db.execute(s_query)
        stock = s_res.scalar_one_or_none()
        
        if not stock:
            # Create NEW stock record
            stock = Stock(
                product_id=pid,
                current_quantity=vals["current"],
                in_production_quantity=vals["producing"]
            )
            db.add(stock)
        else:
            # Update EXISTING stock record
            stock.current_quantity = vals["current"]
            stock.in_production_quantity = vals["producing"]
        updated_count += 1

    await db.commit()
    return {"status": "success", "message": f"{updated_count} products recalculated and synchronized."}
