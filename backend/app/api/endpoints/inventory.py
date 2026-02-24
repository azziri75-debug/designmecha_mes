from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, insert, func
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
async def read_stocks(db: AsyncSession = Depends(get_db)):
    query = select(Stock).options(selectinload(Stock.product))
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/stocks/{product_id}", response_model=StockResponse)
async def read_stock_by_product(product_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Stock).where(Stock.product_id == product_id).options(selectinload(Stock.product))
    result = await db.execute(query)
    stock = result.scalar_one_or_none()
    if not stock:
        # If not exists, return zero stock (or create)
        return Stock(product_id=product_id, current_quantity=0, in_production_quantity=0)
    return stock

@router.put("/stocks/{product_id}", response_model=StockResponse)
async def update_stock(product_id: int, stock_in: StockUpdate, db: AsyncSession = Depends(get_db)):
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
    
    # Reload with product
    query = select(Stock).where(Stock.id == stock.id).options(selectinload(Stock.product))
    result = await db.execute(query)
    return result.scalar_one()

# --- Stock Production Endpoints ---

@router.get("/productions", response_model=List[StockProductionResponse])
async def read_stock_productions(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(StockProduction).options(
        selectinload(StockProduction.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(StockProduction.partner)
    )
    if status:
        query = query.where(StockProduction.status == status)
    
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
        # Count today's productions for serial
        count_query = select(func.count(StockProduction.id)).where(StockProduction.production_no.like(f"SP-{today}-%"))
        res = await db.execute(count_query)
        cnt = res.scalar() or 0
        prod_in.production_no = f"SP-{today}-{cnt+1:03d}"
        
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
    
    if db_prod.status != "CANCELLED":
        # Rollback in_production_quantity
        stock_query = select(Stock).where(Stock.product_id == db_prod.product_id)
        s_res = await db.execute(stock_query)
        stock = s_res.scalar_one_or_none()
        if stock:
            stock.in_production_quantity -= db_prod.quantity

    await db.delete(db_prod)
    await db.commit()
    return {"status": "success"}
