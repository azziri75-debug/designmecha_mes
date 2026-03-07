from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc, func, or_, cast, String
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.api import deps
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus, MaterialRequirement
from app.models.production import ProductionPlanItem, ProductionPlan, ProductionStatus
from app.models.inventory import StockProduction
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.product import Product, ProductProcess, Process, BOM
from app.models.inventory import Stock, TransactionType
from app.models.purchasing import ConsumablePurchaseWait
from app.schemas import purchasing as schemas
from app.schemas import production as prod_schemas
from app.api.utils.inventory import handle_stock_movement

router = APIRouter()

# --- MRP (Material Requirements Planning) ---

@router.get("/mrp/unordered-requirements", response_model=List[schemas.MaterialRequirementResponse])
async def get_unordered_requirements(
    db: AsyncSession = Depends(deps.get_db),
    status: str = "PENDING"
):
    """
    기록된 미발주 소요량(MRP) 리스트 조회 API
    """
    """
    기록된 미발주 소요량(MRP) 리스트 조회 API
    """
    query = select(MaterialRequirement).where(MaterialRequirement.status == status)\
        .options(
            selectinload(MaterialRequirement.product),
            selectinload(MaterialRequirement.order).selectinload(SalesOrder.partner),
            selectinload(MaterialRequirement.plan)
        )
    
    result = await db.execute(query)
    requirements = result.scalars().all()
    
    # Flatten metadata for response
    for req in requirements:
        if req.product:
            req.product_name = req.product.name
            req.specification = req.product.specification
            req.item_type = req.product.item_type
        
        # Add linkage info for UI
        req.linkage_info = "-"
        req.sales_order_number = None
        if req.plan:
            if req.plan.order:
                req.linkage_info = f"생산계획({req.plan.order.order_no})"
                req.sales_order_number = req.plan.order.order_no
            elif req.plan.stock_production:
                req.linkage_info = f"생산계획({req.plan.stock_production.production_no})"
            else:
                req.linkage_info = f"생산계획(ID:{req.plan.id})"
        elif req.order:
            req.linkage_info = f"수주({req.order.order_no})"
            req.sales_order_number = req.order.order_no
            
    return requirements

@router.get("/purchase/consumable-waits", response_model=List[schemas.ConsumablePurchaseWaitResponse])
async def get_consumable_waits(
    db: AsyncSession = Depends(deps.get_db),
    status: str = "PENDING"
):
    """
    결재 승인된 소모품 발주 대기열 조회
    """
    from app.models.approval import ApprovalDocument
    from app.models.basics import Staff
    
    query = select(ConsumablePurchaseWait)\
        .where(ConsumablePurchaseWait.status == status)\
        .options(
            selectinload(ConsumablePurchaseWait.product),
            selectinload(ConsumablePurchaseWait.approval_document)
        )
    
    result = await db.execute(query)
    waits = result.scalars().all()
    
    for wait in waits:
        if wait.approval_document:
            wait.approval_title = wait.approval_document.title
            # Retrieve Author
            staff_res = await db.execute(select(Staff).where(Staff.id == wait.approval_document.author_id))
            staff = staff_res.scalar_one_or_none()
            if staff:
                wait.author_name = staff.name
                
    return waits

    # 2. 총 소요량(Demand) 계산 (부품별 합계)
    total_demand = {} # product_id -> quantity
    product_map = {} # product_id -> Product object (for metadata)

    for so in sales_orders:
        for item in so.items:
            product = item.product
            if not product:
                continue
                
            # BOM 전개
            bom_query = select(BOM).where(BOM.parent_product_id == product.id).options(selectinload(BOM.child_product))
            bom_result = await db.execute(bom_query)
            bom_items = bom_result.scalars().all()

            if not bom_items:
                # BOM이 없으면 완제품 자체가 원자재/부품인 경우이거나, 신제품이라 누락된 경우
                # 요구사항에 따라 BOM이 없으면 하위 소요량 0 처리 (단, 완제품 자체가 PART인 경우도 있을 수 있음)
                # 여기서는 완제품 자체는 소요량에 넣지 않고, 오직 '부품/원자재' 레벨의 소요량만 산출함
                # 만약 완제품이 RAW_MATERIAL이나 PART라면 요구사항에 포함될 수 있음
                if product.item_type in ["RAW_MATERIAL", "PART"]:
                    pid = product.id
                    total_demand[pid] = total_demand.get(pid, 0) + item.quantity
                    product_map[pid] = product
                continue

            for bi in bom_items:
                child = bi.child_product
                if not child:
                    continue
                
                # 하위 부품의 총 소요량 누적
                demand_qty = int(item.quantity * bi.required_quantity)
                pid = child.id
                total_demand[pid] = total_demand.get(pid, 0) + demand_qty
                product_map[pid] = child

    # 3. 각 부품별 현재고 및 미입고 발주 잔량 산출하여 최종 필요 수량 도출
    mrp_results = []
    
    for pid, demand in total_demand.items():
        product = product_map[pid]
        
        # 3-1. 현재고 조회
        stock_query = select(Stock).where(Stock.product_id == pid)
        s_res = await db.execute(stock_query)
        stock = s_res.scalar_one_or_none()
        current_stock = stock.current_quantity if stock else 0
        
        # 3-2. 미입고 발주 잔량(Open Purchase Qty) 조회
        # PENDING, ORDERED, PARTIAL 상태의 PO 아이템들 중 (수량 - 입고수량) 합계
        po_query = select(func.sum(PurchaseOrderItem.quantity - PurchaseOrderItem.received_quantity))\
            .join(PurchaseOrder)\
            .where(PurchaseOrderItem.product_id == pid)\
            .where(PurchaseOrder.status.in_([PurchaseStatus.PENDING, PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL]))
        
        po_res = await db.execute(po_query)
        open_purchase_qty = po_res.scalar() or 0
        
        # 3-3. 최종 필요 수량 계산 공식: (총 소요량) - (현재고) - (발주 잔량)
        required_qty = demand - current_stock - open_purchase_qty
        
        if required_qty > 0:
            mrp_results.append(schemas.MRPRequirement(
                product_id=pid,
                product_name=product.name,
                product_code=product.product_code,
                item_type=product.item_type,
                total_demand=demand,
                current_stock=current_stock,
                open_purchase_qty=open_purchase_qty,
                required_purchase_qty=required_qty
            ))

    return mrp_results

@router.get("/price-history")
async def get_price_history(
    product_id: int,
    partner_id: Optional[int] = None,
    purchase_type: Optional[str] = None,
    db: AsyncSession = Depends(deps.get_db)
) -> List[Any]:
    """
    Get past price history for a specific product.
    Includes both Material Purchase and Outsourcing history.
    """
    history = []
    
    # 1. Material Purchase History
    purchase_query = select(PurchaseOrderItem).join(PurchaseOrder)\
        .options(joinedload(PurchaseOrderItem.purchase_order).joinedload(PurchaseOrder.partner))\
        .where(PurchaseOrderItem.product_id == product_id)\
        .where(PurchaseOrder.status.in_([PurchaseStatus.ORDERED, PurchaseStatus.COMPLETED]))
    
    if partner_id:
        purchase_query = purchase_query.where(PurchaseOrder.partner_id == partner_id)
    if purchase_type:
        purchase_query = purchase_query.where(PurchaseOrder.purchase_type == purchase_type)
        
    purchase_query = purchase_query.order_by(desc(PurchaseOrder.order_date)).limit(10)
    
    res_p = await db.execute(purchase_query)
    for item in res_p.scalars().all():
        history.append({
            "type": "PURCHASE",
            "order_date": item.purchase_order.order_date,
            "partner_name": item.purchase_order.partner.name if item.purchase_order.partner else "-",
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "order_no": item.purchase_order.order_no
        })
        
    # 2. Outsourcing History
    out_query = select(OutsourcingOrderItem).join(OutsourcingOrder)\
        .options(joinedload(OutsourcingOrderItem.outsourcing_order).joinedload(OutsourcingOrder.partner))\
        .where(OutsourcingOrderItem.product_id == product_id)\
        .where(OutsourcingOrder.status.in_([OutsourcingStatus.ORDERED, OutsourcingStatus.COMPLETED]))
        
    if partner_id:
        out_query = out_query.where(OutsourcingOrder.partner_id == partner_id)
        
    out_query = out_query.order_by(desc(OutsourcingOrder.order_date)).limit(10)
    
    res_o = await db.execute(out_query)
    for item in res_o.scalars().all():
        history.append({
            "type": "OUTSOURCING",
            "order_date": item.outsourcing_order.order_date,
            "partner_name": item.outsourcing_order.partner.name if item.outsourcing_order.partner else "-",
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "order_no": item.outsourcing_order.order_no
        })
        
    # Sort merged history by date DESC
    history.sort(key=lambda x: str(x["order_date"]), reverse=True)
    
    return history[:10]

# --- Pending Items (Waiting List) ---

@router.get("/purchase/pending-items", response_model=List[prod_schemas.ProductionPlanItem])
async def read_pending_purchase_items(
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Get Production Plan Items that need purchasing and are not yet ordered.
    Includes items from PLANNED and IN_PROGRESS plans.
    """
    # Local import restored to avoid circular dependency
    from app.models.production import ProductionPlan, ProductionStatus, ProductionPlanItem
    from app.models.inventory import StockProduction

    query = select(ProductionPlanItem).join(ProductionPlanItem.plan)\
        .options(
            selectinload(ProductionPlanItem.product).options(
                selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                selectinload(Product.bom_items)
            ),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
            selectinload(ProductionPlanItem.purchase_items),
            selectinload(ProductionPlanItem.outsourcing_items)
        )\
        .where(or_(
            ProductionPlanItem.course_type.ilike('%PURCHASE%'),
            ProductionPlanItem.course_type.like('%구매%')
        ))\
        .where(
            ~ProductionPlanItem.purchase_items.any(
                PurchaseOrderItem.purchase_order.has(PurchaseOrder.status != PurchaseStatus.CANCELED)
            )
        )\
        .where(cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value)
        
    # Debug: Print Query
    # print(f"[DEBUG] Query: {query}")
        
    result = await db.execute(query)
    items = result.scalars().all()
    print(f"[DEBUG] Pending Purchase Items: Found {len(items)} items.")
    for i in items:
        print(f"  - Item {i.id}: {i.process_name} ({i.course_type}) PlanID: {i.plan_id}")
    return items

@router.get("/outsourcing/pending-items", response_model=List[prod_schemas.ProductionPlanItem])
async def read_pending_outsourcing_items(
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Get Production Plan Items that need outsourcing and are not yet ordered.
    """
    # Local import restored
    from app.models.production import ProductionPlan, ProductionStatus, ProductionPlanItem
    from app.models.inventory import StockProduction

    query = select(ProductionPlanItem).join(ProductionPlanItem.plan)\
        .options(
            selectinload(ProductionPlanItem.product).options(
                selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                selectinload(Product.bom_items)
            ),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
            selectinload(ProductionPlanItem.purchase_items),
            selectinload(ProductionPlanItem.outsourcing_items)
        )\
        .where(or_(
            ProductionPlanItem.course_type.ilike('%OUTSOURCING%'),
            ProductionPlanItem.course_type.like('%외주%')
        ))\
        .where(
            ~ProductionPlanItem.outsourcing_items.any(
                OutsourcingOrderItem.outsourcing_order.has(OutsourcingOrder.status != OutsourcingStatus.CANCELED)
            )
        )\
        .where(cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value)
        
    result = await db.execute(query)
    items = result.scalars().all()
    print(f"[DEBUG] Pending Outsourcing Items: Found {len(items)} items.")
    for i in items:
        print(f"  - Item {i.id}: {i.process_name} ({i.course_type}) PlanID: {i.plan_id}")
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
    from app.models.production import ProductionPlan, ProductionStatus, ProductionPlanItem # Import here to avoid circular dependency
    
    # Robust numbering: get the max order_no for today and increment its sequence
    query = select(PurchaseOrder.order_no).filter(PurchaseOrder.order_no.like(f"PO-{date_str}-%")).order_by(desc(PurchaseOrder.order_no)).limit(1)
    result = await db.execute(query)
    last_order_no = result.scalar()
    
    if last_order_no:
        try:
            last_seq = int(last_order_no.split("-")[-1])
            new_seq = last_seq + 1
        except (ValueError, IndexError):
            new_seq = 1
    else:
        new_seq = 1
        
    order_no = f"PO-{date_str}-{new_seq:03d}"

    try:
        # Get raw data and exclude unset to prevent default 0 passing instead of Null when not provided
        if hasattr(order_in, "model_dump"):
            order_data = order_in.model_dump(exclude_unset=True, exclude={"items"})
        else:
            order_data = order_in.dict(exclude_unset=True, exclude={"items"})
            
        # Ensure only columns that exist in the DB model are included
        valid_keys = {c.name for c in PurchaseOrder.__table__.columns}
        filtered_data = {k: v for k, v in order_data.items() if k in valid_keys}
        
        # Override guaranteed fields
        filtered_data["order_no"] = order_no
        filtered_data["status"] = PurchaseStatus.PENDING
        if not filtered_data.get("purchase_type"):
            filtered_data["purchase_type"] = "PART"

        db_order = PurchaseOrder(**filtered_data)
        db.add(db_order)
        await db.flush()

        for item in order_in.items:
            db_item = PurchaseOrderItem(
                purchase_order_id=db_order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                note=item.note,
                material_requirement_id=item.material_requirement_id,
                consumable_purchase_wait_id=item.consumable_purchase_wait_id
            )
            db.add(db_item)
            
        # Ensure all purchase order items are explicitly flushed to avoid autoflush issues
        await db.flush()
        
        for item in order_in.items:
            # Update MaterialRequirement status if linked
            if item.material_requirement_id:
                req = await db.get(MaterialRequirement, item.material_requirement_id)
                if req:
                    req.status = "ORDERED"
                    db.add(req)
                    
            # Update ConsumablePurchaseWait status if linked
            if item.consumable_purchase_wait_id:
                wait_req = await db.get(ConsumablePurchaseWait, item.consumable_purchase_wait_id)
                if wait_req:
                    wait_req.status = "ORDERED"
                    db.add(wait_req)
            
            # Update ProductionPlanItem status if linked
            if item.production_plan_item_id:
                from app.models.production import ProductionStatus, ProductionPlanItem
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item:
                    plan_item.cost = item.unit_price * item.quantity
                    db.add(plan_item)

        await db.commit()
        await db.refresh(db_order)

        # Re-fetch with eager load
        query = select(PurchaseOrder).options(
            selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product).options(
                selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                selectinload(Product.bom_items)
            ),
            selectinload(PurchaseOrder.partner),
            selectinload(PurchaseOrder.order).selectinload(SalesOrder.partner),
            # Load related SO/SP info
            selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.production_plan_item).selectinload(ProductionPlanItem.plan).options(
                selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
            ),
            selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.material_requirement).options(
                selectinload(MaterialRequirement.order).selectinload(SalesOrder.partner),
                selectinload(MaterialRequirement.plan).options(
                    selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                    selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
                )
            )
        ).where(PurchaseOrder.id == db_order.id)
        result = await db.execute(query)
        return result.scalar_one()

    except Exception as e:
        await db.rollback()
        import traceback
        import logging
        logger = logging.getLogger(__name__)
        error_msg = traceback.format_exc()
        logger.error(f"Failed to create purchase order: {error_msg}")
        raise HTTPException(status_code=500, detail=f"발주 등록 중 오류 발생 (DB 제약조건 혹은 스키마 충돌): {str(e)}")

@router.get("/purchase/orders", response_model=List[schemas.PurchaseOrder])
async def read_purchase_orders(
    skip: int = 0,
    limit: int = 100,
    status: str = None, 
    purchase_type: Optional[str] = None,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve purchase orders.
    """
    # Local import for deep loading
    from app.models.production import ProductionPlanItem, ProductionPlan

    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product).options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items)
        ),
        selectinload(PurchaseOrder.partner),
        selectinload(PurchaseOrder.order).selectinload(SalesOrder.partner),
        # Load related SO/SP info
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.production_plan_item).selectinload(ProductionPlanItem.plan).options(
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
        ),
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.material_requirement).options(
            selectinload(MaterialRequirement.order).selectinload(SalesOrder.partner),
            selectinload(MaterialRequirement.plan).options(
                selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
            )
        )
    )
    if status:
        query = query.where(PurchaseOrder.status == status)
    if purchase_type:
        query = query.where(PurchaseOrder.purchase_type == purchase_type)

    query = query.order_by(desc(PurchaseOrder.order_date)).offset(skip).limit(limit)
    result = await db.execute(query)
    pos = result.scalars().all()
    
    # Calculate related info and process names
    for po in pos:
        for item in po.items:
            if item.production_plan_item:
                plan_item = item.production_plan_item
                item.process_name = plan_item.process_name
    
    return pos

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

    old_status = db_order.status

    # Update Header
    update_data = order_in.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)

    # Handle attachment_file JSON serialization
    if "attachment_file" in update_data and update_data["attachment_file"] is not None:
        import json
        update_data["attachment_file"] = json.dumps(update_data["attachment_file"], ensure_ascii=False)

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

         # Sync cost to Plan Items
         from app.models.production import ProductionPlanItem
         for item_in in order_in.items:
             if item_in.production_plan_item_id:
                 plan_item = await db.get(ProductionPlanItem, item_in.production_plan_item_id)
                 if plan_item:
                     plan_item.cost = item_in.unit_price * item_in.quantity
                     db.add(plan_item)

    # --- Process Sync Logic ---
    if db_order.status == PurchaseStatus.ORDERED:
        from app.models.production import ProductionPlanItem, ProductionStatus
        for item in db_order.items:
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item and plan_item.status == ProductionStatus.PLANNED:
                    plan_item.status = ProductionStatus.IN_PROGRESS
                    db.add(plan_item)

    if db_order.status == PurchaseStatus.COMPLETED:
        from app.models.production import ProductionPlanItem, ProductionStatus
        for item in db_order.items:
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item and plan_item.status != ProductionStatus.COMPLETED:
                    plan_item.status = ProductionStatus.COMPLETED
                    db.add(plan_item)
        
        # --- Stock Movement Hook ---
        if old_status != PurchaseStatus.COMPLETED:
            for item in db_order.items:
                item.received_quantity = item.quantity # Set received quantity automatically
                await handle_stock_movement(
                    db=db,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    transaction_type=TransactionType.IN,
                    reference=db_order.order_no
                )

    await db.commit()
    await db.refresh(db_order)
    
    # Re-fetch with full eager loading for related_sales_order_info/related_customer_names
    from app.models.production import ProductionPlanItem, ProductionPlan
    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product).options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items)
        ),
        selectinload(PurchaseOrder.partner),
        selectinload(PurchaseOrder.order).selectinload(SalesOrder.partner),
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.production_plan_item).selectinload(ProductionPlanItem.plan).options(
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
        )
    ).where(PurchaseOrder.id == order_id)
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/purchase/orders/{order_id}", status_code=204)
async def delete_purchase_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db),
):
    query = select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    # Revert ProductionPlanItem status if linked
    if db_order.items:
        from app.models.production import ProductionPlanItem, ProductionStatus
        for item in db_order.items:
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item:
                    plan_item.status = ProductionStatus.PLANNED
                    db.add(plan_item)
        
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
    from app.models.production import ProductionPlan, ProductionStatus, ProductionPlanItem # Import here
    
    # Robust numbering: get the max order_no for today and increment its sequence
    query = select(OutsourcingOrder.order_no).filter(OutsourcingOrder.order_no.like(f"OS-{date_str}-%")).order_by(desc(OutsourcingOrder.order_no)).limit(1)
    result = await db.execute(query)
    last_order_no = result.scalar()
    
    if last_order_no:
        try:
            last_seq = int(last_order_no.split("-")[-1])
            new_seq = last_seq + 1
        except (ValueError, IndexError):
            new_seq = 1
    else:
        new_seq = 1
        
    order_no = f"OS-{date_str}-{new_seq:03d}"

    db_order = OutsourcingOrder(
        order_no=order_no,
        partner_id=order_in.partner_id,
        order_id=order_in.order_id,
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
            from app.models.production import ProductionStatus, ProductionPlanItem
            plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
            if plan_item:
                # Do not set status here
                plan_item.cost = item.unit_price * item.quantity
                db.add(plan_item)
    
    await db.commit()
    await db.refresh(db_order)

    # Re-fetch
    query = select(OutsourcingOrder).options(
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.product).options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items)
        ),
        selectinload(OutsourcingOrder.partner),
        selectinload(OutsourcingOrder.order).selectinload(SalesOrder.partner),
        # Load related SO/SP info
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.production_plan_item).selectinload(ProductionPlanItem.plan).options(
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
        )
    ).where(OutsourcingOrder.id == db_order.id)
    result = await db.execute(query)
    return result.scalar_one()

@router.get("/outsourcing/orders", response_model=List[schemas.OutsourcingOrder])
async def read_outsourcing_orders(
    skip: int = 0,
    limit: int = 100,
    status: str = None,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve outsourcing orders.
    """
    # Local import
    from app.models.production import ProductionPlanItem, ProductionPlan

    query = select(OutsourcingOrder).options(
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.product).options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items)
        ),
        selectinload(OutsourcingOrder.partner),
        selectinload(OutsourcingOrder.order).selectinload(SalesOrder.partner),
        # Load related SO/SP info
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.production_plan_item).selectinload(ProductionPlanItem.plan).options(
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
        )
    )
    if status:
        query = query.where(OutsourcingOrder.status == status)

    query = query.order_by(desc(OutsourcingOrder.order_date)).offset(skip).limit(limit)
    result = await db.execute(query)
    oos = result.scalars().all()
    
    for oo in oos:
        for item in oo.items:
            if item.production_plan_item:
                plan_item = item.production_plan_item
                item.process_name = plan_item.process_name
    
    return oos

@router.put("/outsourcing/orders/{order_id}", response_model=schemas.OutsourcingOrder)
async def update_outsourcing_order(
    order_id: int,
    order_in: schemas.OutsourcingOrderUpdate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Update an Outsourcing Order.
    """
    query = select(OutsourcingOrder).options(selectinload(OutsourcingOrder.items)).where(OutsourcingOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Outsourcing Order not found")

    old_status = db_order.status

    # Update Header
    update_data = order_in.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)

    # Handle attachment_file JSON serialization
    if "attachment_file" in update_data and update_data["attachment_file"] is not None:
        import json
        update_data["attachment_file"] = json.dumps(update_data["attachment_file"], ensure_ascii=False)

    for field, value in update_data.items():
        setattr(db_order, field, value)

    # Update Items
    if items_data is not None:
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
                 db_item = OutsourcingOrderItem(
                    outsourcing_order_id=db_order.id,
                    production_plan_item_id=item_in.production_plan_item_id,
                    product_id=item_in.product_id,
                    quantity=item_in.quantity,
                    unit_price=item_in.unit_price,
                    note=item_in.note
                 )
                 db.add(db_item)
         
         # Delete missing
         for item_id, item in current_items.items():
             if item_id not in incoming_ids:
                 await db.delete(item)

         # Sync cost to Plan Items
         from app.models.production import ProductionPlanItem
         for item_in in order_in.items:
             if item_in.production_plan_item_id:
                 plan_item = await db.get(ProductionPlanItem, item_in.production_plan_item_id)
                 if plan_item:
                     plan_item.cost = item_in.unit_price * item_in.quantity
                     db.add(plan_item)

    # --- Process Sync Logic ---
    if db_order.status == OutsourcingStatus.ORDERED:
        from app.models.production import ProductionPlanItem, ProductionStatus
        for item in db_order.items:
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item and plan_item.status == ProductionStatus.PLANNED:
                    plan_item.status = ProductionStatus.IN_PROGRESS
                    db.add(plan_item)

                if plan_item and plan_item.status != ProductionStatus.COMPLETED:
                    plan_item.status = ProductionStatus.COMPLETED
                    db.add(plan_item)
        
        # --- Stock Movement Hook ---
        if old_status != OutsourcingStatus.COMPLETED:
            for item in db_order.items:
                await handle_stock_movement(
                    db=db,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    transaction_type=TransactionType.IN,
                    reference=db_order.order_no
                )

    await db.commit()
    await db.refresh(db_order)
    
    # Re-fetch with full eager loading
    from app.models.production import ProductionPlanItem, ProductionPlan
    query = select(OutsourcingOrder).options(
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.product).options(
            selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Product.bom_items)
        ),
        selectinload(OutsourcingOrder.partner),
        selectinload(OutsourcingOrder.order).selectinload(SalesOrder.partner),
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.production_plan_item).selectinload(ProductionPlanItem.plan).options(
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
        )
    ).where(OutsourcingOrder.id == order_id)
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/outsourcing/orders/{order_id}", status_code=204)
async def delete_outsourcing_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db),
):
    query = select(OutsourcingOrder).options(selectinload(OutsourcingOrder.items)).where(OutsourcingOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    # Revert ProductionPlanItem status if linked
    if db_order.items:
        from app.models.production import ProductionPlanItem, ProductionStatus
        for item in db_order.items:
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item:
                    plan_item.status = ProductionStatus.PLANNED
                    db.add(plan_item)

    await db.delete(db_order)
    await db.commit()
    return None
