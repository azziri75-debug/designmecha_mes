from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, insert, func, desc, or_, exists
from sqlalchemy.orm import selectinload, noload
from typing import List, Optional
from datetime import date

from app.api.deps import get_db
from app.models.inventory import Stock, StockProduction, StockProductionStatus, StockProductionOrder
from app.models.product import Product, ProductProcess, BOM
from app.schemas.inventory import (
    StockResponse, StockUpdate,
    StockProductionResponse, StockProductionCreate, StockProductionUpdate,
    StockProductionOrderCreate, StockProductionOrderUpdate, StockProductionOrderResponse
)

# SSE 브로드캐스터 임포트 (실시간 업데이트용)
try:
    from app.main import sse_broadcaster
except ImportError:
    sse_broadcaster = None

from app.utils.push import notify_production_manager
import asyncio

router = APIRouter()

# --- Stock Endpoints & Unified WIP/Reservation Helpers ---

def _build_wip_and_reservation_subqueries(target_product_col):
    """
    품목(Product.id 또는 특정 product_id 값) 기준으로
    1) 수주 대기(so_wait): 미계획 수주의 잔여 미납 수량
    2) 수주 생산중(so_active): 진행중인 수주 생산계획의 품목별 순생산량(max quantity per plan_id, product_id)
    3) 재고생산 대기(sp_wait): 미계획 재고생산 요청 수량 (단건 + StockProductionOrder 다건 통합)
    4) 재고생산 진행중(sp_active): 진행중인 재고생산 계획의 품목별 생산량 (단건 + StockProductionOrder 다건 통합)
    5) 수주 예약/선점 수량(reserved_qty): 미납 수주 생산계획에 설정된 stock_use_quantity 합계
    를 반환합니다.
    """
    from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
    from app.models.production import ProductionPlan, ProductionPlanItem

    finished_so_statuses = [OrderStatus.DELIVERED, OrderStatus.DELIVERY_COMPLETED, OrderStatus.CANCELLED]
    finished_plan_statuses = ['COMPLETED', 'CANCELED']
    finished_sp_statuses = [StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED]

    # 1. SO Wait: 취소되지 않은 생산계획이 아직 수립되지 않은 수주 품목의 미납 잔량 합계
    planned_order_products_subq = (
        select(ProductionPlanItem.product_id)
        .join(ProductionPlan, ProductionPlanItem.plan_id == ProductionPlan.id)
        .where(
            ProductionPlan.order_id == SalesOrder.id,
            ProductionPlan.status != 'CANCELED'
        )
    )

    so_wait_subq = (
        select(
            func.coalesce(
                func.sum(
                    func.greatest(0, SalesOrderItem.quantity - func.coalesce(SalesOrderItem.delivered_quantity, 0))
                ),
                0
            )
        )
        .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)
        .where(
            SalesOrderItem.product_id == target_product_col,
            SalesOrder.status.in_([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PARTIALLY_DELIVERED]),
            ~SalesOrderItem.product_id.in_(planned_order_products_subq)
        )
        .scalar_subquery()
    )

    # 공통: 진행중인 생산계획의 (plan_id, product_id)별 순생산 목표수량 (다공정 중복 합산 방지)
    active_plan_product_qty = (
        select(
            ProductionPlanItem.plan_id,
            ProductionPlanItem.product_id,
            ProductionPlan.order_id,
            ProductionPlan.stock_production_id,
            ProductionPlan.stock_production_order_id,
            func.max(ProductionPlanItem.quantity).label('qty')
        )
        .join(ProductionPlan, ProductionPlanItem.plan_id == ProductionPlan.id)
        .outerjoin(SalesOrder, ProductionPlan.order_id == SalesOrder.id)
        .where(
            ProductionPlan.status.not_in(finished_plan_statuses),
            ProductionPlanItem.status.not_in(finished_plan_statuses),
            or_(
                ProductionPlan.order_id.is_(None),
                SalesOrder.status.not_in(finished_so_statuses)
            )
        )
        .group_by(
            ProductionPlanItem.plan_id,
            ProductionPlanItem.product_id,
            ProductionPlan.order_id,
            ProductionPlan.stock_production_id,
            ProductionPlan.stock_production_order_id
        )
        .subquery()
    )

    # 2. SO Active: 진행중인 수주 생산계획 수량
    so_active_subq = (
        select(func.coalesce(func.sum(active_plan_product_qty.c.qty), 0))
        .where(
            active_plan_product_qty.c.product_id == target_product_col,
            active_plan_product_qty.c.order_id.is_not(None)
        )
        .scalar_subquery()
    )

    # 3. SP Wait: 취소되지 않은 생산계획(단건 stock_production_id 또는 다건 stock_production_order_id)이 아직 없는 재고생산 요청 수량
    planned_sp_exists = (
        select(ProductionPlanItem.id)
        .join(ProductionPlan, ProductionPlanItem.plan_id == ProductionPlan.id)
        .where(
            ProductionPlan.status != 'CANCELED',
            ProductionPlanItem.product_id == StockProduction.product_id,
            or_(
                ProductionPlan.stock_production_id == StockProduction.id,
                (StockProduction.order_id.is_not(None)) & (ProductionPlan.stock_production_order_id == StockProduction.order_id)
            )
        )
        .exists()
    )

    sp_wait_subq = (
        select(func.coalesce(func.sum(StockProduction.quantity), 0))
        .where(
            StockProduction.product_id == target_product_col,
            StockProduction.status.not_in(finished_sp_statuses),
            ~planned_sp_exists
        )
        .scalar_subquery()
    )

    # 4. SP Active: 진행중인 재고생산 계획 수량 (단건 + 다건 주문 모두 포함)
    sp_active_subq = (
        select(func.coalesce(func.sum(active_plan_product_qty.c.qty), 0))
        .where(
            active_plan_product_qty.c.product_id == target_product_col,
            or_(
                active_plan_product_qty.c.stock_production_id.is_not(None),
                active_plan_product_qty.c.stock_production_order_id.is_not(None)
            )
        )
        .scalar_subquery()
    )

    # 5. Reserved Quantity: 미납 수주의 생산계획에서 잡아둔 재고/재고생산 선점 수량(stock_use_quantity)
    reserved_plan_product_qty = (
        select(
            ProductionPlanItem.plan_id,
            ProductionPlanItem.product_id,
            func.least(
                func.max(func.coalesce(ProductionPlanItem.stock_use_quantity, 0)),
                func.coalesce(
                    func.max(SalesOrderItem.quantity - func.coalesce(SalesOrderItem.delivered_quantity, 0)),
                    func.max(func.coalesce(ProductionPlanItem.stock_use_quantity, 0))
                )
            ).label("res_qty")
        )
        .join(ProductionPlan, ProductionPlanItem.plan_id == ProductionPlan.id)
        .join(SalesOrder, ProductionPlan.order_id == SalesOrder.id)
        .outerjoin(
            SalesOrderItem,
            (SalesOrderItem.order_id == SalesOrder.id) & (SalesOrderItem.product_id == ProductionPlanItem.product_id)
        )
        .where(
            ProductionPlan.status != 'CANCELED',
            SalesOrder.status.not_in(finished_so_statuses),
            func.coalesce(ProductionPlanItem.stock_use_quantity, 0) > 0
        )
        .group_by(ProductionPlanItem.plan_id, ProductionPlanItem.product_id)
        .subquery()
    )

    reserved_subq = (
        select(func.coalesce(func.sum(func.greatest(0, reserved_plan_product_qty.c.res_qty)), 0))
        .where(reserved_plan_product_qty.c.product_id == target_product_col)
        .scalar_subquery()
    )

    return so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, reserved_subq


def _format_stock_dict(product, stock_obj, so_wait, so_active, sp_wait, sp_active, reserved_val, has_bom=False):
    current_qty = stock_obj.current_quantity if stock_obj else 0
    producing_so = (so_wait or 0) + (so_active or 0)
    producing_sp = (sp_wait or 0) + (sp_active or 0)
    producing_total = producing_so + producing_sp
    reserved_qty = max(0, reserved_val or 0)

    # 가용 현재고 = max(0, 현재고 - 수주예약수량)
    avail_qty = max(0, current_qty - reserved_qty)
    # 현재고로 충당되지 않는 예약분은 제작중인 재고생산(producing_sp)을 선점한 수량으로 계산
    reserved_from_sp = max(0, reserved_qty - max(0, current_qty))
    avail_sp_qty = max(0, producing_sp - reserved_from_sp)
    total_allocatable = avail_qty + avail_sp_qty

    return {
        "id": stock_obj.id if stock_obj else 0,
        "product_id": product.id if product else (stock_obj.product_id if stock_obj else 0),
        "current_quantity": current_qty,
        "in_production_quantity": producing_total,
        "location": stock_obj.location if stock_obj else None,
        "updated_at": stock_obj.updated_at if stock_obj else None,
        "product": product,
        "producing_total": producing_total,
        "producing_so": producing_so,
        "producing_sp": producing_sp,
        "reserved_quantity": reserved_qty,
        "available_quantity": avail_qty,
        "available_sp_quantity": avail_sp_qty,
        "total_allocatable": total_allocatable,
        "has_bom": bool(has_bom),
    }


@router.get("/stocks", response_model=List[StockResponse])
async def read_stocks(
    item_type: Optional[str] = None,
    partner_id: Optional[int] = None,
    product_name: Optional[str] = None,
    major_group_id: Optional[int] = None,
    product_ids: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, reserved_subq = (
        _build_wip_and_reservation_subqueries(Product.id)
    )
    has_bom_subq = exists().where(BOM.parent_product_id == Product.id)

    query = select(
        Product,
        Stock,
        so_wait_subq.label("so_wait"),
        so_active_subq.label("so_active"),
        sp_wait_subq.label("sp_wait"),
        sp_active_subq.label("sp_active"),
        has_bom_subq.label("has_bom"),
        reserved_subq.label("reserved_qty")
    ).outerjoin(Stock, Stock.product_id == Product.id).options(
        noload(Product.standard_processes),
        noload(Product.bom_items),
        noload(Product.price_history)
    )

    if product_ids:
        try:
            id_list = [int(pid.strip()) for pid in product_ids.split(",") if pid.strip().isdigit()]
            if id_list:
                query = query.where(Product.id.in_(id_list))
        except Exception:
            pass
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
    if major_group_id:
        from app.models.product import ProductGroup
        subquery = select(Product.id).join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id, ProductGroup.parent_id == major_group_id))
        query = query.where(Product.id.in_(subquery))

    query = query.where(or_(Product.item_type != 'CONSUMABLE', Product.item_type.is_(None)))

    result = await db.execute(query)
    rows = result.all()

    final_stocks = []
    for row in rows:
        stock_data = _format_stock_dict(
            product=row[0],
            stock_obj=row[1],
            so_wait=row[2],
            so_active=row[3],
            sp_wait=row[4],
            sp_active=row[5],
            has_bom=row[6],
            reserved_val=row[7],
        )
        final_stocks.append(stock_data)
        
    return final_stocks


@router.get("/stocks/{product_id}", response_model=StockResponse)
async def read_stock_by_product(product_id: int, db: AsyncSession = Depends(get_db)):
    so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, reserved_subq = (
        _build_wip_and_reservation_subqueries(Product.id)
    )
    has_bom_subq = exists().where(BOM.parent_product_id == Product.id)

    query = select(
        Product,
        Stock,
        so_wait_subq,
        so_active_subq,
        sp_wait_subq,
        sp_active_subq,
        has_bom_subq,
        reserved_subq
    ).outerjoin(Stock, Stock.product_id == Product.id).where(Product.id == product_id).options(
        noload(Product.standard_processes),
        noload(Product.bom_items),
        noload(Product.price_history)
    )
    
    result = await db.execute(query)
    row = result.first()
    
    if not row:
        return _format_stock_dict(await db.get(Product, product_id), None, 0, 0, 0, 0, 0, False)
    
    return _format_stock_dict(
        product=row[0],
        stock_obj=row[1],
        so_wait=row[2],
        so_active=row[3],
        sp_wait=row[4],
        sp_active=row[5],
        has_bom=row[6],
        reserved_val=row[7],
    )


@router.post("/stocks/init", response_model=StockResponse)
async def init_stock(stock_in: StockUpdate, product_id: int, db: AsyncSession = Depends(get_db)):
    """수동 재고 초기화 API"""
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
        
    so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, reserved_subq = (
        _build_wip_and_reservation_subqueries(product_id)
    )
    calc_res = await db.execute(select(so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, reserved_subq))
    row = calc_res.first()
    producing_so = (row[0] or 0) + (row[1] or 0)
    producing_sp = (row[2] or 0) + (row[3] or 0)
    producing_total = producing_so + producing_sp

    stock = Stock(
        product_id=product_id,
        current_quantity=stock_in.current_quantity or 0,
        in_production_quantity=producing_total,
        location=stock_in.location
    )
    db.add(stock)
    await db.commit()
    await db.refresh(stock)
    
    q = select(Stock).where(Stock.id == stock.id).options(selectinload(Stock.product))
    res = await db.execute(q)
    stock_obj = res.scalar_one()
    
    return _format_stock_dict(
        product=stock_obj.product,
        stock_obj=stock_obj,
        so_wait=row[0],
        so_active=row[1],
        sp_wait=row[2],
        sp_active=row[3],
        reserved_val=row[4],
        has_bom=False
    )


@router.put("/stocks/{product_id}", response_model=StockResponse)
async def update_stock(product_id: int, stock_in: StockUpdate, db: AsyncSession = Depends(get_db)):
    product = await db.get(Product, product_id)
    if product and product.item_type == 'CONSUMABLE':
        raise HTTPException(status_code=400, detail="소모품은 재고를 관리하지 않습니다.")

    query = select(Stock).where(Stock.product_id == product_id)
    result = await db.execute(query)
    stock = result.scalar_one_or_none()
    
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
    
    so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, reserved_subq = (
        _build_wip_and_reservation_subqueries(product_id)
    )
    calc_res = await db.execute(select(so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, reserved_subq))
    row = calc_res.first()
    producing_so = (row[0] or 0) + (row[1] or 0)
    producing_sp = (row[2] or 0) + (row[3] or 0)
    producing_total = producing_so + producing_sp

    stock.in_production_quantity = producing_total
    await db.commit()
    await db.refresh(stock)
    
    q = select(Stock).where(Stock.id == stock.id).options(selectinload(Stock.product))
    res = await db.execute(q)
    stock_obj = res.scalar_one()
    
    if sse_broadcaster:
        import json as _json
        await sse_broadcaster.broadcast(
            "inventory_updated",
            _json.dumps({"type": "stock_updated", "product_id": product_id})
        )

    return _format_stock_dict(
        product=stock_obj.product,
        stock_obj=stock_obj,
        so_wait=row[0],
        so_active=row[1],
        sp_wait=row[2],
        sp_active=row[3],
        reserved_val=row[4],
        has_bom=False
    )


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
    MAX_RETRIES = 5
    for attempt in range(MAX_RETRIES):
        try:
            # Generate production number if not provided
            if not prod_in.production_no:
                today = date.today().strftime("%Y%m%d")
                # 매 시도마다 DB에서 최신 번호를 다시 조회
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

            # batch_no: 제공되지 않은 경우 production_no를 그대로 사용 (단건 = 자기 자신이 그룹)
            batch_no = prod_in.batch_no or prod_in.production_no
            req_date = prod_in.request_date or date.today()

            dump = prod_in.model_dump()
            dump['batch_no'] = batch_no
            dump['request_date'] = req_date

            new_prod = StockProduction(**dump)
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
            break  # 성공 시 루프 종료

        except Exception as e:
            await db.rollback()
            # 중복 production_no 에러인 경우 재시도
            if "unique" in str(e).lower() and "production_no" in str(e).lower() and attempt < MAX_RETRIES - 1:
                prod_in.production_no = None  # 번호 초기화하여 다음 루프에서 재채번
                continue
            raise  # 다른 에러이거나 재시도 횟수 초과 시 그대로 예외 발생

    # 생산부 부장 알림 발송 (비동기)
    asyncio.create_task(notify_production_manager(
        title="[생산] 신규 재고생산 요청",
        body=f"신규 재고생산 요청({new_prod.production_no})이 등록되어 생산 대기 리스트에 추가되었습니다.",
        url="/production/waiting"
    ))
    
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

    # 생산부 부장 알림 발송 (수정 시 알림 추가)
    asyncio.create_task(notify_production_manager(
        title="[생산] 재고생산 요청 수정",
        body=f"재고생산 요청({db_prod.production_no})이 수정되었습니다. 생산 대기 리스트를 확인해 주세요.",
        url="/production/waiting"
    ))
    
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
async def recalculate_inventory(
    mode: Optional[str] = "all",
    db: AsyncSession = Depends(get_db)
):
    """
    모든 품목의 재고 및 생산중(WIP) 정합성을 전수 재계산하고 누락된 상태값을 복구합니다.
    - mode="all": 생산완료(품목별 최종공정 1회), 부품 구매입고, BOM 백플러시, 납품출고를 기반으로 현재고(current_quantity)와 생산중(in_production_quantity) 모두 재계산
    - mode="wip_only": 현재고(수동조정 포함)는 유지하고, 재고생산 상태 동기화 및 생산중(in_production_quantity) 수량만 정합성 복구
    """
    from app.models.production import ProductionStatus, ProductionPlan, ProductionPlanItem
    from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus, DeliveryHistoryItem
    from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus
    from app.models.inventory import Stock, StockProduction, StockProductionStatus
    from app.models.product import BOM, Product

    # 1. 모든 비소모품 품목 ID 조회
    products_res = await db.execute(
        select(Product.id).where(or_(Product.item_type != 'CONSUMABLE', Product.item_type.is_(None)))
    )
    product_ids = list(products_res.scalars().all())
    stock_map = {pid: {"current": 0, "producing": 0} for pid in product_ids}

    # 2. 모든 생산계획 조회 및 StockProduction 상태 / stock_deducted 플래그 정합성 복구
    plans_query = select(ProductionPlan).options(
        selectinload(ProductionPlan.items),
        selectinload(ProductionPlan.stock_production),
    )
    plans = (await db.execute(plans_query)).scalars().all()

    # BOM 전체 캐싱 (반복 쿼리 방지)
    bom_all_res = await db.execute(select(BOM))
    bom_by_parent = {}
    for b in bom_all_res.scalars().all():
        bom_by_parent.setdefault(b.parent_product_id, []).append(b)

    for plan in plans:
        if plan.status == ProductionStatus.CANCELED:
            continue

        # 품목(product_id)별 마지막 공정(max sequence) 추출
        last_items_by_prod = {}
        all_items_by_prod = {}
        for pi in (plan.items or []):
            pid = pi.product_id
            all_items_by_prod.setdefault(pid, []).append(pi)
            if pid not in last_items_by_prod or (pi.sequence or 0) > (last_items_by_prod[pid].sequence or 0):
                last_items_by_prod[pid] = pi

        for pid, last_item in last_items_by_prod.items():
            prod_items = all_items_by_prod.get(pid, [])
            is_prod_completed = (
                plan.status == ProductionStatus.COMPLETED
                or last_item.status == ProductionStatus.COMPLETED
                or (prod_items and all(i.status == ProductionStatus.COMPLETED for i in prod_items))
            )
            if is_prod_completed:
                if not last_item.stock_deducted:
                    last_item.stock_deducted = True
                    db.add(last_item)

                net_qty = last_item.quantity or 0
                if net_qty > 0 and pid in stock_map:
                    stock_map[pid]["current"] += net_qty
                    for bom in bom_by_parent.get(pid, []):
                        if bom.child_product_id in stock_map:
                            stock_map[bom.child_product_id]["current"] -= int(bom.required_quantity * net_qty)

                # 연결된 재고생산(단건 및 다건 주문) 상태를 COMPLETED로 동기화
                if plan.stock_production and plan.stock_production.product_id == pid:
                    if plan.stock_production.status != StockProductionStatus.COMPLETED:
                        plan.stock_production.status = StockProductionStatus.COMPLETED
                        db.add(plan.stock_production)
                if plan.stock_production_order_id:
                    sp_stmt = select(StockProduction).where(
                        StockProduction.order_id == plan.stock_production_order_id,
                        StockProduction.product_id == pid
                    )
                    for sp_item in (await db.execute(sp_stmt)).scalars().all():
                        if sp_item.status != StockProductionStatus.COMPLETED:
                            sp_item.status = StockProductionStatus.COMPLETED
                            db.add(sp_item)
            else:
                # 미완료 생산계획에 연결된 재고생산이 PENDING이면 IN_PROGRESS로 동기화
                if plan.stock_production and plan.stock_production.product_id == pid:
                    if plan.stock_production.status == StockProductionStatus.PENDING:
                        plan.stock_production.status = StockProductionStatus.IN_PROGRESS
                        db.add(plan.stock_production)
                if plan.stock_production_order_id:
                    sp_stmt = select(StockProduction).where(
                        StockProduction.order_id == plan.stock_production_order_id,
                        StockProduction.product_id == pid
                    )
                    for sp_item in (await db.execute(sp_stmt)).scalars().all():
                        if sp_item.status == StockProductionStatus.PENDING:
                            sp_item.status = StockProductionStatus.IN_PROGRESS
                            db.add(sp_item)

    if mode != "wip_only":
        # 3. 부품/원자재 구매발주 입고분 합산 (생산계획 공정 자체 발주분 제외)
        po_items_res = await db.execute(
            select(PurchaseOrderItem)
            .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
            .where(
                PurchaseOrder.status == PurchaseStatus.COMPLETED,
                PurchaseOrderItem.production_plan_item_id.is_(None)
            )
        )
        for poi in po_items_res.scalars().all():
            if poi.product_id in stock_map:
                rec_qty = poi.received_quantity if (poi.received_quantity is not None and poi.received_quantity > 0) else (poi.quantity or 0)
                stock_map[poi.product_id]["current"] += rec_qty

        # 4. 단독 외주발주 입고분 합산 (생산계획 공정 외주분 제외)
        os_items_res = await db.execute(
            select(OutsourcingOrderItem)
            .join(OutsourcingOrder, OutsourcingOrderItem.outsourcing_order_id == OutsourcingOrder.id)
            .where(
                OutsourcingOrder.status == OutsourcingStatus.COMPLETED,
                OutsourcingOrderItem.production_plan_item_id.is_(None)
            )
        )
        for osi in os_items_res.scalars().all():
            if osi.product_id in stock_map:
                stock_map[osi.product_id]["current"] += (osi.quantity or 0)

        # 5. 납품 완료 출고분 차감
        del_query = select(DeliveryHistoryItem).options(selectinload(DeliveryHistoryItem.order_item))
        del_res = await db.execute(del_query)
        for delivery in del_res.scalars().all():
            if delivery.order_item and delivery.order_item.product_id in stock_map:
                stock_map[delivery.order_item.product_id]["current"] -= (delivery.quantity or 0)

    await db.flush()

    # 6. 통합 4-Part WIP 서브쿼리로 모든 품목의 정확한 생산중(producing_total) 계산
    so_wait_subq, so_active_subq, sp_wait_subq, sp_active_subq, _ = (
        _build_wip_and_reservation_subqueries(Product.id)
    )
    wip_rows = (
        await db.execute(
            select(
                Product.id,
                so_wait_subq,
                so_active_subq,
                sp_wait_subq,
                sp_active_subq
            ).where(Product.id.in_(product_ids))
        )
    ).all()

    for pid, so_w, so_a, sp_w, sp_a in wip_rows:
        if pid in stock_map:
            stock_map[pid]["producing"] = (so_w or 0) + (so_a or 0) + (sp_w or 0) + (sp_a or 0)

    # 7. Stock 테이블 반영
    existing_stocks_res = await db.execute(select(Stock))
    existing_stocks = {s.product_id: s for s in existing_stocks_res.scalars().all()}

    updated_count = 0
    for pid, vals in stock_map.items():
        stock = existing_stocks.get(pid)
        if not stock:
            stock = Stock(
                product_id=pid,
                current_quantity=vals["current"] if mode != "wip_only" else 0,
                in_production_quantity=vals["producing"]
            )
            db.add(stock)
        else:
            if mode != "wip_only":
                stock.current_quantity = vals["current"]
            stock.in_production_quantity = vals["producing"]
            db.add(stock)
        updated_count += 1

    await db.commit()

    if sse_broadcaster:
        import json as _json
        await sse_broadcaster.broadcast(
            "inventory_updated",
            _json.dumps({"type": "recalculated", "mode": mode})
        )

    return {"status": "success", "message": f"{updated_count}개 품목의 재고 및 생산중 수량이 정합성 동기화되었습니다."}


@router.get("/bom-stock/{product_id}")
async def read_bom_stock(product_id: int, db: AsyncSession = Depends(get_db)):
    """
    특정 제품의 BOM 구성 요소별 현재고 현황을 조회합니다.
    """
    from app.models.product import BOM, Product
    from app.models.inventory import Stock
    
    # 1. BOM 데이터 조회 (자식 제품 정보 및 재고 정보 포함)
    query = select(BOM).where(BOM.parent_product_id == product_id).options(
        selectinload(BOM.child_product).selectinload(Product.inventory)
    )
    # Note: Product.inventory was found in product.py which links to 'stocks' table.
    
    result = await db.execute(query)
    bom_items = result.scalars().all()
    
    res_data = []
    for bi in bom_items:
        child = bi.child_product
        if not child: continue
        
        # Stock 객체 직접 조회 (relationship이 복잡할 경우 대비)
        # 이미 selectinload로 가져오려 했으나, 안전을 위해 Product.inventory 또는 별도 쿼리 확인
        stock_qty = 0
        stock_query = select(Stock).where(Stock.product_id == child.id)
        stock_res = await db.execute(stock_query)
        stock_obj = stock_res.scalar_one_or_none()
        if stock_obj:
            stock_qty = stock_obj.current_quantity
            
        res_data.append({
            "child_product_id": child.id,
            "child_name": child.name,
            "child_spec": child.specification,
            "child_type": child.item_type,
            "required_quantity": bi.required_quantity,
            "current_stock": stock_qty,
            "unit": child.unit or "EA"
        })
        
    return res_data


# ─── Stock Production Orders (헤더 CRUD) ──────────────────────────────────────

async def _generate_order_no(db: AsyncSession) -> str:
    """재고생산 주문번호 채번 (SP-YYYYMMDD-XXX), 재시도 로직 포함"""
    from datetime import date as dt_date
    today = dt_date.today().strftime("%Y%m%d")
    query = select(StockProductionOrder.order_no)\
        .filter(StockProductionOrder.order_no.like(f"SP-{today}-%"))\
        .order_by(desc(StockProductionOrder.order_no)).limit(1)
    result = await db.execute(query)
    last_no = result.scalar()
    if last_no:
        try:
            new_seq = int(last_no.split("-")[-1]) + 1
        except (ValueError, IndexError):
            new_seq = 1
    else:
        new_seq = 1
    return f"SP-{today}-{new_seq:03d}"


async def _generate_item_production_no(db: AsyncSession) -> str:
    """품목별 내부 production_no 채번"""
    from datetime import date as dt_date
    today = dt_date.today().strftime("%Y%m%d")
    query = select(StockProduction.production_no)\
        .filter(StockProduction.production_no.like(f"SP-{today}-%"))\
        .order_by(desc(StockProduction.production_no)).limit(1)
    result = await db.execute(query)
    last_no = result.scalar()
    if last_no:
        try:
            new_seq = int(last_no.split("-")[-1]) + 1
        except (ValueError, IndexError):
            new_seq = 1
    else:
        new_seq = 1
    return f"SP-{today}-{new_seq:03d}"


@router.get("/production-orders", response_model=List[StockProductionOrderResponse])
async def read_production_orders(
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    partner_id: Optional[int] = None,
    product_name: Optional[str] = None,
    major_group_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """재고생산 주문 목록 (헤더 + 품목 포함)"""
    query = select(StockProductionOrder).options(
        selectinload(StockProductionOrder.partner),
        selectinload(StockProductionOrder.items).selectinload(StockProduction.product),
        selectinload(StockProductionOrder.items).selectinload(StockProduction.partner),
    ).order_by(desc(StockProductionOrder.created_at))

    if partner_id:
        query = query.where(StockProductionOrder.partner_id == partner_id)
    if start_date:
        query = query.where(StockProductionOrder.request_date >= start_date)
    if end_date:
        query = query.where(StockProductionOrder.request_date <= end_date)
    if status:
        # 헤더 상태 필터 — 품목 중 하나라도 해당 상태이면 포함
        status_subq = select(StockProduction.order_id).where(
            StockProduction.status == status,
            StockProduction.order_id.is_not(None)
        )
        query = query.where(StockProductionOrder.id.in_(status_subq))

    if product_name:
        name_subq = select(StockProduction.order_id).join(Product)\
            .where(Product.name.ilike(f"%{product_name}%"), StockProduction.order_id.is_not(None))
        query = query.where(StockProductionOrder.id.in_(name_subq))

    if major_group_id:
        from app.models.product import ProductGroup
        grp_subq = select(StockProduction.order_id)\
            .join(Product)\
            .join(ProductGroup, Product.group_id == ProductGroup.id)\
            .where(
                or_(ProductGroup.id == major_group_id, ProductGroup.parent_id == major_group_id),
                StockProduction.order_id.is_not(None)
            )
        query = query.where(StockProductionOrder.id.in_(grp_subq))


    result = await db.execute(query)
    return result.scalars().all()



@router.post("/production-orders", response_model=StockProductionOrderResponse)
async def create_production_order(
    order_in: StockProductionOrderCreate,
    db: AsyncSession = Depends(get_db)
):
    """재고생산 주문 등록 (헤더 + 품목 일괄 생성)"""
    MAX_RETRIES = 5
    for attempt in range(MAX_RETRIES):
        try:
            req_date = order_in.request_date or date.today()
            order_no = await _generate_order_no(db)

            new_order = StockProductionOrder(
                order_no=order_no,
                partner_id=order_in.partner_id,
                request_date=req_date,
                note=order_in.note,
            )
            db.add(new_order)
            await db.flush()  # order.id 확보

            for item_in in order_in.items:
                item_no = await _generate_item_production_no(db)
                new_item = StockProduction(
                    order_id=new_order.id,
                    production_no=item_no,
                    batch_no=order_no,  # 하위호환용
                    product_id=item_in.product_id,
                    partner_id=order_in.partner_id,
                    quantity=item_in.quantity,
                    request_date=req_date,
                    target_date=item_in.target_date,
                    note=item_in.note,
                )
                db.add(new_item)
                await db.flush()

                # 재고 생산중 수량 갱신
                stock_q = select(Stock).where(Stock.product_id == item_in.product_id)
                stock_res = await db.execute(stock_q)
                stock = stock_res.scalar_one_or_none()
                if not stock:
                    db.add(Stock(product_id=item_in.product_id, in_production_quantity=item_in.quantity))
                else:
                    stock.in_production_quantity = (stock.in_production_quantity or 0) + item_in.quantity

            await db.commit()

            # 알림 전송
            asyncio.create_task(notify_production_manager(
                title="[생산] 신규 재고생산 요청",
                body=f"신규 재고생산 요청({order_no}, {len(order_in.items)}건)이 등록되었습니다.",
                url="/production/waiting"
            ))

            # 완전한 관계 포함해서 재조회
            result = await db.execute(
                select(StockProductionOrder).where(StockProductionOrder.id == new_order.id).options(
                    selectinload(StockProductionOrder.partner),
                    selectinload(StockProductionOrder.items).selectinload(StockProduction.product),
                    selectinload(StockProductionOrder.items).selectinload(StockProduction.partner),
                )
            )
            return result.scalar_one()

        except Exception as e:
            await db.rollback()
            if "unique" in str(e).lower() and "order_no" in str(e).lower() and attempt < MAX_RETRIES - 1:
                continue
            raise


@router.get("/production-orders/{order_id}", response_model=StockProductionOrderResponse)
async def read_production_order(
    order_id: int,
    db: AsyncSession = Depends(get_db)
):
    """재고생산 주문 단건 조회"""
    result = await db.execute(
        select(StockProductionOrder).where(StockProductionOrder.id == order_id).options(
            selectinload(StockProductionOrder.partner),
            selectinload(StockProductionOrder.items).selectinload(StockProduction.product),
            selectinload(StockProductionOrder.items).selectinload(StockProduction.partner),
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    return order


@router.put("/production-orders/{order_id}", response_model=StockProductionOrderResponse)
async def update_production_order(
    order_id: int,
    order_in: StockProductionOrderUpdate,
    db: AsyncSession = Depends(get_db)
):
    """재고생산 주문 수정 (헤더 + 품목 교체)"""
    result = await db.execute(
        select(StockProductionOrder).where(StockProductionOrder.id == order_id).options(
            selectinload(StockProductionOrder.items)
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")

    if order_in.partner_id is not None:
        order.partner_id = order_in.partner_id
    if order_in.request_date is not None:
        order.request_date = order_in.request_date
    if order_in.note is not None:
        order.note = order_in.note

    if order_in.items is not None:
        # 기존 품목의 재고 생산중 수량 롤백
        for old_item in order.items:
            stock_q = select(Stock).where(Stock.product_id == old_item.product_id)
            stock_res = await db.execute(stock_q)
            stock = stock_res.scalar_one_or_none()
            if stock:
                stock.in_production_quantity = max(0, (stock.in_production_quantity or 0) - old_item.quantity)
            await db.delete(old_item)
        await db.flush()

        # 새 품목 추가
        req_date = order_in.request_date or order.request_date
        for item_in in order_in.items:
            item_no = await _generate_item_production_no(db)
            new_item = StockProduction(
                order_id=order.id,
                production_no=item_no,
                batch_no=order.order_no,
                product_id=item_in.product_id,
                partner_id=order.partner_id,
                quantity=item_in.quantity,
                request_date=req_date,
                target_date=item_in.target_date,
                note=item_in.note,
            )
            db.add(new_item)
            await db.flush()

            stock_q = select(Stock).where(Stock.product_id == item_in.product_id)
            stock_res = await db.execute(stock_q)
            stock = stock_res.scalar_one_or_none()
            if not stock:
                db.add(Stock(product_id=item_in.product_id, in_production_quantity=item_in.quantity))
            else:
                stock.in_production_quantity = (stock.in_production_quantity or 0) + item_in.quantity

    await db.commit()

    result = await db.execute(
        select(StockProductionOrder).where(StockProductionOrder.id == order_id).options(
            selectinload(StockProductionOrder.partner),
            selectinload(StockProductionOrder.items).selectinload(StockProduction.product),
            selectinload(StockProductionOrder.items).selectinload(StockProduction.partner),
        )
    )
    return result.scalar_one()


@router.delete("/production-orders/{order_id}")
async def delete_production_order(
    order_id: int,
    db: AsyncSession = Depends(get_db)
):
    """재고생산 주문 삭제 (품목 cascade 삭제 + 재고 롤백)"""
    result = await db.execute(
        select(StockProductionOrder).where(StockProductionOrder.id == order_id).options(
            selectinload(StockProductionOrder.items)
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")

    # 재고 생산중 수량 롤백
    for item in order.items:
        if item.status not in (StockProductionStatus.COMPLETED, StockProductionStatus.CANCELLED):
            stock_q = select(Stock).where(Stock.product_id == item.product_id)
            stock_res = await db.execute(stock_q)
            stock = stock_res.scalar_one_or_none()
            if stock:
                stock.in_production_quantity = max(0, (stock.in_production_quantity or 0) - item.quantity)

    await db.delete(order)
    await db.commit()
    return {"status": "success"}
