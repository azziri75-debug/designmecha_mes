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
    
    query = select(Stock).join(Product).options(
        selectinload(Stock.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process)
    )

    if item_type:
        query = query.where(Product.item_type == item_type)
    if partner_id:
        query = query.where(Product.partner_id == partner_id)
    if product_name:
        query = query.where(Product.name.ilike(f"%{product_name}%"))

    # Bug 2 Fix: Exclude CONSUMABLE items from inventory list
    query = query.where(Product.item_type != 'CONSUMABLE')

    result = await db.execute(query)
    stocks = result.scalars().all()
    
    # Calculate production breakdown for each stock
    for stock in stocks:
        # 1. Producing SO (Sales Order driven)
        # We need to sum the quantity per UNIQUE ProductionPlanItem group (plan_id)
        # to avoid double-counting multiple processes for the same production.
        
        subq = select(
            ProductionPlanItem.plan_id,
            func.max(ProductionPlanItem.quantity).label("qty")
        ).join(ProductionPlan)\
         .where(ProductionPlanItem.product_id == stock.product_id)\
         .where(ProductionPlan.order_id.is_not(None))\
         .where(ProductionPlanItem.status != 'COMPLETED')\
         .group_by(ProductionPlanItem.plan_id).subquery()
        
        so_query = select(func.sum(subq.c.qty))
        
        # 2. Producing SP (Stock Production driven)
        sp_query = select(func.sum(StockProduction.quantity))\
            .where(StockProduction.product_id == stock.product_id)\
            .where(StockProduction.status != 'COMPLETED')
            
        res_so = await db.execute(so_query)
        res_sp = await db.execute(sp_query)
        
        stock.producing_so = res_so.scalar() or 0
        stock.producing_sp = res_sp.scalar() or 0
        stock.producing_total = stock.producing_so + stock.producing_sp
        
    return stocks

@router.get("/stocks/{product_id}", response_model=StockResponse)
async def read_stock_by_product(product_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Stock).where(Stock.product_id == product_id).options(
        selectinload(Stock.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process)
    )
    result = await db.execute(query)
    stock = result.scalar_one_or_none()
    if not stock:
        # If not exists, return zero stock (or create)
        return Stock(product_id=product_id, current_quantity=0, in_production_quantity=0)
    return stock

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
        
    stock = Stock(
        product_id=product_id,
        current_quantity=stock_in.current_quantity or 0,
        in_production_quantity=stock_in.in_production_quantity or 0,
        location=stock_in.location
    )
    db.add(stock)
    await db.commit()
    await db.refresh(stock)
    
    # Reload with product and its standard processes
    query = select(Stock).where(Stock.id == stock.id).options(
        selectinload(Stock.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process)
    )
    result = await db.execute(query)
    return result.scalar_one()

@router.put("/stocks/{product_id}", response_model=StockResponse)
async def update_stock(product_id: int, stock_in: StockUpdate, db: AsyncSession = Depends(get_db)):
    # 품목 타입 확인 (소모품 차단)
    product = await db.get(Product, product_id)
    if product and product.item_type == 'CONSUMABLE':
        raise HTTPException(status_code=400, detail="소모품은 재고를 관리하지 않습니다.")

    query = select(Stock).where(Stock.product_id == product_id)
    result = await db.execute(query)
    stock = result.scalar_one_or_none()
    
    if not stock:
        stock = Stock(product_id=product_id, **stock_in.model_dump(exclude_unset=True))
        db.add(stock)
    else:
        for field, value in stock_in.model_dump(exclude_unset=True).items():
            setattr(stock, field, value)
            
    await db.commit()
    await db.refresh(stock)
    
    # Reload with product and its standard processes
    query = select(Stock).where(Stock.id == stock.id).options(
        selectinload(Stock.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process)
    )
    result = await db.execute(query)
    return result.scalar_one()

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
    db: AsyncSession = Depends(get_db)
):
    query = select(StockProduction).join(Product).options(
        selectinload(StockProduction.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
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
        selectinload(StockProduction.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
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
        selectinload(StockProduction.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
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
