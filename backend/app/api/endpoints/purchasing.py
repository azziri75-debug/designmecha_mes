from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, func, or_, cast, String
from sqlalchemy.orm import selectinload, joinedload, noload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, date

from app.api import deps
from app.core.timezone import now_kst
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


async def _sync_material_requirement_status(db: AsyncSession, req_id: Optional[int]):
    if not req_id:
        return
    req = await db.get(MaterialRequirement, req_id)
    if not req:
        return
    product_id = req.product_id

    completed_plan_subq = select(ProductionPlan.id).where(
        cast(ProductionPlan.status, String).in_([ProductionStatus.COMPLETED.value, ProductionStatus.CANCELED.value])
    )
    active_mr_stmt = select(MaterialRequirement).where(
        MaterialRequirement.product_id == product_id,
        MaterialRequirement.status.in_(['PENDING', 'ORDERED']),
        or_(
            MaterialRequirement.plan_id.is_(None),
            MaterialRequirement.plan_id.notin_(completed_plan_subq)
        )
    )
    active_mrs = (await db.execute(active_mr_stmt)).scalars().all()
    if not active_mrs:
        active_mrs = [req]

    mr_ids = [m.id for m in active_mrs]
    total_required = sum(int(m.required_quantity or 0) for m in active_mrs)

    stmt = (
        select(PurchaseOrderItem, PurchaseOrder.status)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrderItem.material_requirement_id.in_(mr_ids),
            PurchaseOrder.status != PurchaseStatus.CANCELED
        )
    )
    rows = (await db.execute(stmt)).all()
    linked_ordered = sum(int(pi.quantity or 0) for pi, _ in rows)
    linked_completed = sum(
        int(pi.quantity or 0)
        for pi, st in rows
        if st == PurchaseStatus.COMPLETED or str(st) == 'COMPLETED'
    )

    stock_val = (await db.execute(
        select(func.sum(Stock.current_quantity)).where(Stock.product_id == product_id)
    )).scalar() or 0
    open_po_val = (await db.execute(
        select(func.sum(PurchaseOrderItem.quantity - PurchaseOrderItem.received_quantity))
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrderItem.product_id == product_id,
            PurchaseOrder.status.in_([PurchaseStatus.PENDING, PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL])
        )
    )).scalar() or 0

    covered_qty = max(int(stock_val) + int(open_po_val), int(linked_ordered))
    remaining_shortage = max(0, total_required - covered_qty)

    for m in active_mrs:
        if remaining_shortage <= 0 and total_required > 0:
            if linked_ordered > 0 and linked_completed >= linked_ordered:
                m.status = 'COMPLETED'
            else:
                m.status = 'ORDERED'
        else:
            m.status = 'PENDING'
        db.add(m)


async def _sync_consumable_wait_status(db: AsyncSession, wait_id: Optional[int]):
    if not wait_id:
        return
    wait_req = await db.get(ConsumablePurchaseWait, wait_id)
    if not wait_req:
        return
    stmt = (
        select(PurchaseOrderItem, PurchaseOrder.status)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrderItem.consumable_purchase_wait_id == wait_id,
            PurchaseOrder.status != PurchaseStatus.CANCELED
        )
    )
    rows = (await db.execute(stmt)).all()
    total_ordered = sum(int(pi.quantity or 0) for pi, _ in rows)
    completed_qty = sum(
        int(pi.quantity or 0)
        for pi, st in rows
        if st == PurchaseStatus.COMPLETED or str(st) == 'COMPLETED'
    )
    target_qty = int(wait_req.quantity or 0)
    if target_qty > 0 and completed_qty >= target_qty:
        wait_req.status = 'COMPLETED'
    elif target_qty > 0 and total_ordered >= target_qty:
        wait_req.status = 'ORDERED'
    else:
        wait_req.status = 'PENDING'
    db.add(wait_req)


async def _sync_plan_item_from_purchases(db: AsyncSession, plan_item_id: Optional[int]):
    """
    Syncs ProductionPlanItem.cost and status across all split PurchaseOrderItems.
    Returns (is_fully_completed, total_completed_qty).
    """
    if not plan_item_id:
        return False, 0
    plan_item = await db.get(ProductionPlanItem, plan_item_id)
    if not plan_item:
        return False, 0
    stmt = (
        select(PurchaseOrderItem, PurchaseOrder.status)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrderItem.production_plan_item_id == plan_item_id,
            PurchaseOrder.status != PurchaseStatus.CANCELED
        )
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        plan_item.cost = 0.0
        if plan_item.status == ProductionStatus.COMPLETED:
            from app.api.utils.status_cascade import revert_production_item_completed
            await revert_production_item_completed(db, plan_item, reference="PO Deleted")
        plan_item.status = ProductionStatus.PLANNED
        db.add(plan_item)
        plan = await db.get(ProductionPlan, plan_item.plan_id)
        if plan and plan.status == ProductionStatus.COMPLETED:
            plan.status = ProductionStatus.IN_PROGRESS
            plan.actual_completion_date = None
            db.add(plan)
        return False, 0

    plan_item.cost = sum(float(pi.unit_price or 0) * int(pi.quantity or 0) for pi, _ in rows)
    completed_qty = sum(
        int(pi.quantity or 0)
        for pi, st in rows
        if st == PurchaseStatus.COMPLETED or str(st) == 'COMPLETED'
    )
    all_completed = all(
        st == PurchaseStatus.COMPLETED or str(st) == 'COMPLETED'
        for _, st in rows
    )
    any_progressed = any(
        st in (PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL, PurchaseStatus.COMPLETED)
        or str(st) in ('ORDERED', 'PARTIAL', 'COMPLETED')
        for _, st in rows
    )
    target_qty = int(plan_item.quantity or 0)
    is_fully_completed = (target_qty > 0 and completed_qty >= target_qty and all_completed)

    if not is_fully_completed:
        if plan_item.status == ProductionStatus.COMPLETED:
            from app.api.utils.status_cascade import revert_production_item_completed
            await revert_production_item_completed(db, plan_item, reference="PO Updated/Deleted")
            plan_item.status = ProductionStatus.IN_PROGRESS if any_progressed else ProductionStatus.PLANNED
        elif any_progressed and plan_item.status == ProductionStatus.PLANNED:
            plan_item.status = ProductionStatus.IN_PROGRESS
        plan = await db.get(ProductionPlan, plan_item.plan_id)
        if plan and plan.status == ProductionStatus.COMPLETED:
            plan.status = ProductionStatus.IN_PROGRESS
            plan.actual_completion_date = None
            db.add(plan)
    db.add(plan_item)
    return is_fully_completed, completed_qty


async def _sync_plan_item_from_outsourcing(db: AsyncSession, plan_item_id: Optional[int]):
    """
    Syncs ProductionPlanItem.cost and status across all split OutsourcingOrderItems.
    Returns (is_fully_completed, total_completed_qty).
    """
    if not plan_item_id:
        return False, 0
    plan_item = await db.get(ProductionPlanItem, plan_item_id)
    if not plan_item:
        return False, 0
    stmt = (
        select(OutsourcingOrderItem, OutsourcingOrder.status)
        .join(OutsourcingOrder, OutsourcingOrderItem.outsourcing_order_id == OutsourcingOrder.id)
        .where(
            OutsourcingOrderItem.production_plan_item_id == plan_item_id,
            OutsourcingOrder.status != OutsourcingStatus.CANCELED
        )
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        plan_item.cost = 0.0
        if plan_item.status == ProductionStatus.COMPLETED:
            from app.api.utils.status_cascade import revert_production_item_completed
            await revert_production_item_completed(db, plan_item, reference="OO Deleted")
        plan_item.status = ProductionStatus.PLANNED
        db.add(plan_item)
        plan = await db.get(ProductionPlan, plan_item.plan_id)
        if plan and plan.status == ProductionStatus.COMPLETED:
            plan.status = ProductionStatus.IN_PROGRESS
            plan.actual_completion_date = None
            db.add(plan)
        return False, 0

    plan_item.cost = sum(float(oi.unit_price or 0) * int(oi.quantity or 0) for oi, _ in rows)
    completed_qty = sum(
        int(oi.quantity or 0)
        for oi, st in rows
        if st == OutsourcingStatus.COMPLETED or str(st) == 'COMPLETED'
    )
    all_completed = all(
        st in (OutsourcingStatus.COMPLETED, OutsourcingStatus.QUOTATION, OutsourcingStatus.QUOTATION_COMPLETE)
        or str(st) in ('COMPLETED', 'QUOTATION', 'QUOTATION_COMPLETE')
        for _, st in rows
    )
    any_progressed = any(
        st in (OutsourcingStatus.ORDERED, OutsourcingStatus.COMPLETED)
        or str(st) in ('ORDERED', 'COMPLETED')
        for _, st in rows
    )
    target_qty = int(plan_item.quantity or 0)
    is_fully_completed = (target_qty > 0 and completed_qty >= target_qty and all_completed)

    if not is_fully_completed:
        if plan_item.status == ProductionStatus.COMPLETED:
            from app.api.utils.status_cascade import revert_production_item_completed
            await revert_production_item_completed(db, plan_item, reference="OO Updated/Deleted")
            plan_item.status = ProductionStatus.IN_PROGRESS if any_progressed else ProductionStatus.PLANNED
        elif any_progressed and plan_item.status == ProductionStatus.PLANNED:
            plan_item.status = ProductionStatus.IN_PROGRESS
        plan = await db.get(ProductionPlan, plan_item.plan_id)
        if plan and plan.status == ProductionStatus.COMPLETED:
            plan.status = ProductionStatus.IN_PROGRESS
            plan.actual_completion_date = None
            db.add(plan)
    db.add(plan_item)
    return is_fully_completed, completed_qty


async def _auto_heal_pending_plan_items(db: AsyncSession):
    """
    1) 이미 납품완료(DELIVERY_COMPLETED/DELIVERED)된 수주의 생산계획/세부공정이
       이전 보정 로직에 의해 미완료(IN_PROGRESS/PLANNED)로 풀린 경우 완료(COMPLETED)로 복원합니다.
    2) 수주가 확정(CONFIRMED/PENDING)으로 복원되었고 하위 세부공정이 미완료인데
       상위 ProductionPlan.status가 COMPLETED로 잘못 남아 있는 경우 IN_PROGRESS로 보정합니다.
    3) 미완료 공정에 남아 있는 자동생성 발주(AOS-/APO-) 잔재를 정리합니다.
    """
    from app.models.sales import OrderStatus
    healed = False

    # 1) 이미 납품완료(DELIVERY_COMPLETED/DELIVERED)된 수주의 생산계획 및 하위 공정은 모두 COMPLETED로 복원
    delivered_plans_stmt = (
        select(ProductionPlan)
        .join(SalesOrder, ProductionPlan.order_id == SalesOrder.id)
        .options(selectinload(ProductionPlan.items), selectinload(ProductionPlan.order))
        .where(
            cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value,
            cast(SalesOrder.status, String).in_([
                OrderStatus.DELIVERY_COMPLETED.value,
                OrderStatus.DELIVERED.value,
                "DELIVERY_COMPLETED",
                "DELIVERED",
            ]),
        )
    )
    delivered_plans = (await db.execute(delivered_plans_stmt)).scalars().all()
    for d_plan in delivered_plans:
        if d_plan.status != ProductionStatus.COMPLETED and getattr(d_plan.status, 'value', str(d_plan.status)) != "COMPLETED":
            d_plan.status = ProductionStatus.COMPLETED
            if not d_plan.actual_completion_date:
                d_plan.actual_completion_date = (
                    (d_plan.order.actual_delivery_date if d_plan.order else None)
                    or (d_plan.order.delivery_date if d_plan.order else None)
                    or d_plan.plan_date
                    or now_kst().date()
                )
            db.add(d_plan)
            healed = True
        for it in (d_plan.items or []):
            if it.status != ProductionStatus.COMPLETED and getattr(it.status, 'value', str(it.status)) != "COMPLETED":
                it.status = ProductionStatus.COMPLETED
                db.add(it)
                healed = True

    # 2) 수주가 CONFIRMED/PENDING으로 복원되었고 하위 공정이 미완료인데 계획 헤더만 COMPLETED인 건 보정
    mismatch_plans_stmt = (
        select(ProductionPlan)
        .options(selectinload(ProductionPlan.items), selectinload(ProductionPlan.order))
        .where(cast(ProductionPlan.status, String) == ProductionStatus.COMPLETED.value)
    )
    completed_plans = (await db.execute(mismatch_plans_stmt)).scalars().all()
    for c_plan in completed_plans:
        has_incomplete_item = any(
            it.status != ProductionStatus.COMPLETED and getattr(it.status, 'value', str(it.status)) != "COMPLETED"
            for it in (c_plan.items or [])
        )
        order_reverted = (
            c_plan.order is not None
            and getattr(c_plan.order.status, 'value', str(c_plan.order.status)) in ("PENDING", "CONFIRMED")
            and has_incomplete_item
        )
        if order_reverted:
            c_plan.status = ProductionStatus.IN_PROGRESS
            c_plan.actual_completion_date = None
            db.add(c_plan)
            healed = True

    if healed:
        await db.flush()

    # 3) 미완료(PLANNED/IN_PROGRESS) 공정에 남아있는 자동생성 완료발주(AOS-/APO-) 잔재 자동 정리
    stale_aos_stmt = (
        select(OutsourcingOrderItem)
        .join(OutsourcingOrder, OutsourcingOrderItem.outsourcing_order_id == OutsourcingOrder.id)
        .join(ProductionPlanItem, OutsourcingOrderItem.production_plan_item_id == ProductionPlanItem.id)
        .where(
            OutsourcingOrder.order_no.like("AOS-%"),
            cast(ProductionPlanItem.status, String) != ProductionStatus.COMPLETED.value,
        )
    )
    stale_aos_items = (await db.execute(stale_aos_stmt)).scalars().all()
    stale_oo_ids = set()
    for s_oi in stale_aos_items:
        stale_oo_ids.add(s_oi.outsourcing_order_id)
        await db.delete(s_oi)
        healed = True
    if stale_oo_ids:
        await db.flush()
        for oo_id in stale_oo_ids:
            rem_c = (await db.execute(
                select(func.count(OutsourcingOrderItem.id)).where(OutsourcingOrderItem.outsourcing_order_id == oo_id)
            )).scalar() or 0
            if rem_c == 0:
                oo_obj = await db.get(OutsourcingOrder, oo_id)
                if oo_obj:
                    await db.delete(oo_obj)

    stale_apo_stmt = (
        select(PurchaseOrderItem)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .join(ProductionPlanItem, PurchaseOrderItem.production_plan_item_id == ProductionPlanItem.id)
        .where(
            PurchaseOrder.order_no.like("APO-%"),
            cast(ProductionPlanItem.status, String) != ProductionStatus.COMPLETED.value,
        )
    )
    stale_apo_items = (await db.execute(stale_apo_stmt)).scalars().all()
    stale_po_ids = set()
    for s_pi in stale_apo_items:
        stale_po_ids.add(s_pi.purchase_order_id)
        if s_pi.material_requirement_id:
            mr_obj = await db.get(MaterialRequirement, s_pi.material_requirement_id)
            if mr_obj and mr_obj.status == "COMPLETED":
                mr_obj.status = "PENDING"
                db.add(mr_obj)
        await db.delete(s_pi)
        healed = True
    if stale_po_ids:
        await db.flush()
        for po_id in stale_po_ids:
            rem_c = (await db.execute(
                select(func.count(PurchaseOrderItem.id)).where(PurchaseOrderItem.purchase_order_id == po_id)
            )).scalar() or 0
            if rem_c == 0:
                po_obj = await db.get(PurchaseOrder, po_id)
                if po_obj:
                    await db.delete(po_obj)

    if healed:
        await db.commit()

# --- MRP (Material Requirements Planning) ---

@router.get("/mrp/unordered-requirements", response_model=List[schemas.MaterialRequirementResponse])
async def get_unordered_requirements(
    major_group_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(deps.get_db),
    status: str = "PENDING"
):
    """
    기록된 미발주 소요량(MRP) 리스트 조회 API (품목별 합산 및 실시간 재고 반영)
    """
    # 1. 실시간 발주 잔량(Open PO Qty) 서브쿼리
    po_subq = select(
        PurchaseOrderItem.product_id,
        func.sum(PurchaseOrderItem.quantity - PurchaseOrderItem.received_quantity).label("open_qty")
    ).join(PurchaseOrder).where(
        PurchaseOrder.status.in_([PurchaseStatus.PENDING, PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL])
    ).group_by(PurchaseOrderItem.product_id).subquery()

    # 2. 실시간 현재고(Live Stock) 서브쿼리
    stock_subq = select(
        Stock.product_id,
        func.sum(Stock.current_quantity).label("live_stock")
    ).group_by(Stock.product_id).subquery()

    # 3. 메인 쿼리: 품목별 집계 및 실시간 정보 조인
    query = select(
        Product,
        func.sum(MaterialRequirement.required_quantity).label("total_required"),
        func.min(MaterialRequirement.id).label("min_mr_id"),
        func.max(MaterialRequirement.created_at).label("latest_created"),
        po_subq.c.open_qty,
        stock_subq.c.live_stock
    ).join(MaterialRequirement, MaterialRequirement.product_id == Product.id)\
     .outerjoin(po_subq, Product.id == po_subq.c.product_id)\
     .outerjoin(stock_subq, Product.id == stock_subq.c.product_id)\
     .where(MaterialRequirement.status == status)\
     .group_by(Product.id, po_subq.c.open_qty, stock_subq.c.live_stock)\
     .options(
         noload(Product.standard_processes),
         noload(Product.bom_items),
         noload(Product.price_history)
     )

    if major_group_id and str(major_group_id).isdigit():
        major_group_id_int = int(major_group_id)
        from app.models.product import ProductGroup
        subquery = select(Product.id).join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id_int, ProductGroup.parent_id == major_group_id_int))
        query = query.where(Product.id.in_(subquery))

    # 생산완료(COMPLETED)된 생산계획에 연결된 소요량 제외
    completed_plan_subq = select(ProductionPlan.id).where(
        cast(ProductionPlan.status, String) == ProductionStatus.COMPLETED.value
    )
    query = query.where(
        or_(
            MaterialRequirement.plan_id.is_(None),
            MaterialRequirement.plan_id.notin_(completed_plan_subq)
        )
    )


    result = await db.execute(query)
    rows = result.all()

    # Batch-fetch related sales order numbers for all products in one query
    product_ids = [r[0].id for r in rows]
    so_map = {}
    if product_ids:
        so_stmt = (
            select(MaterialRequirement.product_id, SalesOrder.order_no)
            .join(SalesOrder, MaterialRequirement.order_id == SalesOrder.id)
            .where(MaterialRequirement.product_id.in_(product_ids), MaterialRequirement.status == status)
            .distinct()
        )
        for pid, order_no in (await db.execute(so_stmt)).all():
            if order_no:
                so_map.setdefault(pid, []).append(order_no)

    linked_po_map = {}
    if product_ids:
        linked_stmt = (
            select(
                MaterialRequirement.product_id,
                func.sum(PurchaseOrderItem.quantity)
            )
            .join(PurchaseOrderItem, PurchaseOrderItem.material_requirement_id == MaterialRequirement.id)
            .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
            .where(
                MaterialRequirement.product_id.in_(product_ids),
                MaterialRequirement.status == status,
                PurchaseOrder.status != PurchaseStatus.CANCELED
            )
            .group_by(MaterialRequirement.product_id)
        )
        for pid, l_qty in (await db.execute(linked_stmt)).all():
            linked_po_map[pid] = int(l_qty or 0)

    final_results = []
    for product, total_required, min_mr_id, latest_created, open_qty, live_stock in rows:
        so_numbers = so_map.get(product.id, [])
        linked_qty = linked_po_map.get(product.id, 0)
        effective_open_qty = max(int(open_qty or 0), linked_qty)
        covered = max(int(live_stock or 0) + int(open_qty or 0), linked_qty)
        shortage = max(0, int(total_required or 0) - covered)

        # 합산된 데이터 구성
        res = schemas.MaterialRequirementResponse(
            id=min_mr_id, # 대표 ID 하나 사용
            product_id=product.id,
            required_quantity=int(total_required or 0),
            current_stock=int(live_stock or 0), # 실시간 재고 반영
            open_purchase_qty=effective_open_qty, # 실시간 발주 잔량 반영
            shortage_quantity=shortage, # 실질 부족분 계산
            created_at=latest_created,
            product_name=product.name,
            specification=product.specification,
            item_type=product.item_type,
            sales_order_number=", ".join(so_numbers) if so_numbers else "-"
        )
        final_results.append(res)
            
    return final_results

@router.get("/purchase/consumable-waits", response_model=List[schemas.ConsumablePurchaseWaitResponse])
async def get_consumable_waits(
    major_group_id: Optional[str] = Query(None),
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
            selectinload(ConsumablePurchaseWait.product).options(
                selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                selectinload(Product.bom_items)
            ),
            selectinload(ConsumablePurchaseWait.approval_document)
        )
    
    if major_group_id and str(major_group_id).isdigit():
        major_group_id_int = int(major_group_id)
        from app.models.product import ProductGroup
        subquery = select(ConsumablePurchaseWait.id).join(Product).join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id_int, ProductGroup.parent_id == major_group_id_int))
        query = query.where(ConsumablePurchaseWait.id.in_(subquery))
    
    result = await db.execute(query)
    waits = result.scalars().all()
    
    author_ids = {w.approval_document.author_id for w in waits if w.approval_document and w.approval_document.author_id}
    author_map = {}
    if author_ids:
        staff_res = await db.execute(select(Staff.id, Staff.name).where(Staff.id.in_(author_ids)))
        author_map = {sid: sname for sid, sname in staff_res.all()}

    wait_ids = [w.id for w in waits]
    ordered_map = {}
    if wait_ids:
        po_stmt = (
            select(
                PurchaseOrderItem.consumable_purchase_wait_id,
                func.sum(PurchaseOrderItem.quantity)
            )
            .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
            .where(
                PurchaseOrderItem.consumable_purchase_wait_id.in_(wait_ids),
                PurchaseOrder.status != PurchaseStatus.CANCELED
            )
            .group_by(PurchaseOrderItem.consumable_purchase_wait_id)
        )
        for wid, q_sum in (await db.execute(po_stmt)).all():
            ordered_map[wid] = int(q_sum or 0)

    filtered_waits = []
    for wait in waits:
        if wait.approval_document:
            wait.approval_title = wait.approval_document.title
            if wait.approval_document.author_id in author_map:
                wait.author_name = author_map[wait.approval_document.author_id]
        orig_qty = int(wait.quantity or 0)
        ordered_qty = ordered_map.get(wait.id, 0)
        if status == "PENDING":
            remaining_qty = orig_qty - ordered_qty
            if remaining_qty <= 0:
                continue
            wait.original_quantity = orig_qty
            wait.ordered_quantity = ordered_qty
            wait_out = schemas.ConsumablePurchaseWait.model_validate(wait)
            wait_out.quantity = remaining_qty
            filtered_waits.append(wait_out)
        else:
            wait.original_quantity = orig_qty
            wait.ordered_quantity = ordered_qty
            wait_out = schemas.ConsumablePurchaseWait.model_validate(wait)
            filtered_waits.append(wait_out)

    return filtered_waits

@router.get("/purchase/consumables/match", response_model=List[schemas.Product])
async def match_consumables(
    name: str,
    db: AsyncSession = Depends(deps.get_db)
):
    """유사 소모품/부품 자동 매칭 API"""
    if not name or len(name.strip()) < 2:
        return []
        
    query = select(Product).where(
        Product.item_type.in_(["CONSUMABLE", "PART", "RAW_MATERIAL"]),
        Product.name.ilike(f"%{name.strip()}%")
    ).limit(5)
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/purchase/consumables/order")
async def register_consumable_order(
    req: schemas.ConsumableOrderRequest,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_user)
):
    """소모품 발주 등록 (기존 매핑 or 신규 등록 후 발주서 발행)"""
    # 1. Get wait item
    wait_res = await db.execute(select(ConsumablePurchaseWait).where(ConsumablePurchaseWait.id == req.wait_id))
    wait_item = wait_res.scalars().first()
    if not wait_item:
        raise HTTPException(status_code=404, detail="대기 항목을 찾을 수 없습니다.")
    if wait_item.status != "PENDING":
        raise HTTPException(status_code=400, detail="이미 처리된 항목입니다.")
        
    # 2. Handle Product
    product_id = req.product_id
    if not product_id:
        if not req.new_product_name:
            raise HTTPException(status_code=400, detail="기존 품목을 선택하거나 신규 품목명을 입력해야 합니다.")
        
        new_product = Product(
            name=req.new_product_name,
            item_type="CONSUMABLE",
            specification=req.new_product_spec or "",
            unit=req.new_product_unit or "EA",
            note=f"소모품발주등록(대기ID:{req.wait_id})"
        )
        db.add(new_product)
        await db.flush()
        product_id = new_product.id
        
    # Update wait item product mapping
    wait_item.product_id = product_id
    db.add(wait_item)
    
    # 3. Create Purchase Order
    from datetime import date
    today_str = date.today().strftime("%Y%m%d")
    
    stmt_no = select(PurchaseOrder).where(PurchaseOrder.order_no.like(f"PO-{today_str}-%")).order_by(desc(PurchaseOrder.order_no))
    res_no = await db.execute(stmt_no)
    latest_po = res_no.scalars().first()
    next_seq = 1
    if latest_po:
        try:
            next_seq = int(latest_po.order_no.split("-")[-1]) + 1
        except ValueError:
            next_seq = 1
    order_no = f"PO-{today_str}-{next_seq:03d}"
    
    new_po = PurchaseOrder(
        order_no=order_no,
        partner_id=req.partner_id,
        order_date=date.today(),
        status=PurchaseStatus.PENDING,
        purchase_type="CONSUMABLE",
        note=req.note
    )
    db.add(new_po)
    await db.flush()
    
    # 4. Create Purchase Order Item (support split quantity)
    order_qty = int(req.quantity) if (req.quantity and int(req.quantity) > 0) else int(wait_item.quantity or 0)
    po_item = PurchaseOrderItem(
        purchase_order_id=new_po.id,
        product_id=product_id,
        quantity=order_qty,
        unit_price=req.unit_price,
        manufacturer=req.manufacturer or wait_item.requested_manufacturer,
        consumable_purchase_wait_id=wait_item.id
    )
    db.add(po_item)
    await db.flush()
    await _sync_consumable_wait_status(db, wait_item.id)

    await db.commit()
    return {"message": "발주가 성공적으로 등록되었습니다.", "id": new_po.id, "order_no": order_no}


@router.delete("/purchase/consumable-waits/{wait_id}")
async def delete_consumable_wait(
    wait_id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_user)
):
    """소모품 발주 대기 항목 삭제 (시스템관리자 전용)"""
    if getattr(current_user, 'user_type', None) != 'ADMIN':
        raise HTTPException(status_code=403, detail="시스템 관리자만 삭제할 수 있습니다.")

    wait_res = await db.execute(
        select(ConsumablePurchaseWait).where(ConsumablePurchaseWait.id == wait_id)
    )
    wait_item = wait_res.scalars().first()
    if not wait_item:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다.")

    await db.delete(wait_item)
    await db.commit()
    return {"message": "소모품 발주 대기 항목이 삭제되었습니다."}


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
    process_name: Optional[str] = None,
    db: AsyncSession = Depends(deps.get_db)
) -> List[Any]:
    """
    Get past price history for a specific product.
    - purchase_type='OUTSOURCING': returns only outsourcing history (skips material purchase)
    - process_name: filters outsourcing history by note field (process name)
    """
    history = []

    # 1. Material Purchase History — skip when querying outsourcing-only
    if purchase_type != 'OUTSOURCING':
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
    if process_name:
        # 공정명이 note 필드에 저장됨 — 유사 일치 허용
        out_query = out_query.where(OutsourcingOrderItem.note.ilike(f'%{process_name}%'))

    out_query = out_query.order_by(desc(OutsourcingOrder.order_date)).limit(10)

    res_o = await db.execute(out_query)
    for item in res_o.scalars().all():
        history.append({
            "type": "OUTSOURCING",
            "order_date": item.outsourcing_order.order_date,
            "partner_name": item.outsourcing_order.partner.name if item.outsourcing_order.partner else "-",
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "order_no": item.outsourcing_order.order_no,
            "process_name": item.note or ''
        })

    # Sort merged history by date DESC
    history.sort(key=lambda x: str(x["order_date"]), reverse=True)

    return history[:10]

# --- Pending Items (Waiting List) ---

@router.get("/purchase/pending-items", response_model=List[prod_schemas.ProductionPlanItem])
async def read_pending_purchase_items(
    major_group_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Get Production Plan Items that need purchasing and are not yet ordered.
    Includes items from PLANNED and IN_PROGRESS plans.
    """
    from app.models.production import ProductionPlan, ProductionStatus, ProductionPlanItem, WorkLogItem
    from app.models.inventory import StockProduction, StockProductionOrder

    await _auto_heal_pending_plan_items(db)

    query = select(ProductionPlanItem).join(ProductionPlanItem.plan)\
        .options(
            selectinload(ProductionPlanItem.product).options(
                selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                selectinload(Product.bom_items)
            ),
            selectinload(ProductionPlanItem.equipment),
            selectinload(ProductionPlanItem.worker),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production_order).selectinload(StockProductionOrder.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production_order).selectinload(StockProductionOrder.items).selectinload(StockProduction.product),
            selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlanItem.work_log_items).options(
                selectinload(WorkLogItem.work_log),
                selectinload(WorkLogItem.worker)
            )
        )\
        .where(or_(
            ProductionPlanItem.course_type.ilike('%PURCHASE%'),
            ProductionPlanItem.course_type.like('%구매%')
        ))\
        .where(cast(ProductionPlanItem.status, String).notin_([
            ProductionStatus.COMPLETED.value,
            ProductionStatus.CANCELED.value,
            "COMPLETED",
            "CANCELED",
        ]))\
        .where(ProductionPlanItem.quantity > 0)\
        .where(cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value)\
        .where(cast(ProductionPlan.status, String) != ProductionStatus.COMPLETED.value)
        
    if major_group_id and str(major_group_id).isdigit():
        major_group_id_int = int(major_group_id)
        from app.models.product import ProductGroup
        subquery = select(ProductionPlanItem.id).join(Product).join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id_int, ProductGroup.parent_id == major_group_id_int))
        query = query.where(ProductionPlanItem.id.in_(subquery))
        
    result = await db.execute(query)
    items = result.scalars().all()
    
    pending_items = []
    for i in items:
        orig_qty = int(i.quantity or 0)
        ordered_qty = sum(
            int(pi.quantity or 0)
            for pi in (i.purchase_items or [])
            if pi.purchase_order and pi.purchase_order.status != PurchaseStatus.CANCELED and str(pi.purchase_order.status) != "CANCELED"
        )
        remaining_qty = orig_qty - ordered_qty
        if remaining_qty <= 0:
            continue

        if i.plan:
            if i.plan.order:
                i.client_name = i.plan.order.partner.name if i.plan.order.partner else "-"
                if i.plan.order.items:
                    i.product_name_of_plan = i.plan.order.items[0].product.name if i.plan.order.items[0].product else "-"
            else:
                spo = getattr(i.plan, 'stock_production_order', None) or (i.plan.stock_production.order if (getattr(i.plan, 'stock_production', None) and getattr(i.plan.stock_production, 'order', None)) else None)
                sp = getattr(i.plan, 'stock_production', None)
                partner_obj = (spo.partner if (spo and spo.partner) else None) or (sp.partner if (sp and sp.partner) else None)
                i.client_name = partner_obj.name if partner_obj else "사내 생산"
                i.product_name_of_plan = i.product.name if i.product else (sp.product.name if (sp and sp.product) else "-")
        else:
            i.client_name = "-"
            i.product_name_of_plan = i.product.name if i.product else "-"

        i.original_quantity = orig_qty
        i.ordered_quantity = ordered_qty
        item_out = prod_schemas.ProductionPlanItem.model_validate(i)
        if ordered_qty > 0:
            item_out.cost = 0.0
        item_out.quantity = remaining_qty
        pending_items.append(item_out)

    print(f"[DEBUG] Pending Purchase Items: Found {len(pending_items)} items.")
    return pending_items


@router.get("/outsourcing/pending-items", response_model=List[prod_schemas.ProductionPlanItem])
async def read_pending_outsourcing_items(
    major_group_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Get Production Plan Items that need outsourcing and are not yet ordered.
    """
    # Local import restored
    from app.models.production import ProductionPlan, ProductionStatus, ProductionPlanItem, WorkLogItem
    from app.models.inventory import StockProduction, StockProductionOrder

    await _auto_heal_pending_plan_items(db)

    query = select(ProductionPlanItem).join(ProductionPlanItem.plan)\
        .options(
            selectinload(ProductionPlanItem.product).options(
                selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                selectinload(Product.bom_items)
            ),
            selectinload(ProductionPlanItem.equipment),
            selectinload(ProductionPlanItem.worker),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production_order).selectinload(StockProductionOrder.partner),
            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production_order).selectinload(StockProductionOrder.items).selectinload(StockProduction.product),
            selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlanItem.work_log_items).options(
                selectinload(WorkLogItem.work_log),
                selectinload(WorkLogItem.worker)
            )
        )\
        .where(or_(
            ProductionPlanItem.course_type.ilike('%OUTSOURCING%'),
            ProductionPlanItem.course_type.like('%외주%')
        ))\
        .where(cast(ProductionPlanItem.status, String).notin_([
            ProductionStatus.COMPLETED.value,
            ProductionStatus.CANCELED.value,
            "COMPLETED",
            "CANCELED",
        ]))\
        .where(ProductionPlanItem.quantity > 0)\
        .where(cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value)\
        .where(cast(ProductionPlan.status, String) != ProductionStatus.COMPLETED.value)
        
    if major_group_id and str(major_group_id).isdigit():
        major_group_id_int = int(major_group_id)
        from app.models.product import ProductGroup
        subquery = select(ProductionPlanItem.id).join(Product).join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id_int, ProductGroup.parent_id == major_group_id_int))
        query = query.where(ProductionPlanItem.id.in_(subquery))
        
    result = await db.execute(query)
    items = result.scalars().all()

    pending_items = []
    for i in items:
        orig_qty = int(i.quantity or 0)
        ordered_qty = sum(
            int(oi.quantity or 0)
            for oi in (i.outsourcing_items or [])
            if oi.outsourcing_order and oi.outsourcing_order.status != OutsourcingStatus.CANCELED and str(oi.outsourcing_order.status) != "CANCELED"
        )
        remaining_qty = orig_qty - ordered_qty
        if remaining_qty <= 0:
            continue

        if i.plan:
            if i.plan.order:
                i.client_name = i.plan.order.partner.name if i.plan.order.partner else "-"
                if i.plan.order.items:
                    i.product_name_of_plan = i.plan.order.items[0].product.name if i.plan.order.items[0].product else "-"
            else:
                spo = getattr(i.plan, 'stock_production_order', None) or (i.plan.stock_production.order if (getattr(i.plan, 'stock_production', None) and getattr(i.plan.stock_production, 'order', None)) else None)
                sp = getattr(i.plan, 'stock_production', None)
                partner_obj = (spo.partner if (spo and spo.partner) else None) or (sp.partner if (sp and sp.partner) else None)
                i.client_name = partner_obj.name if partner_obj else "사내 생산"
                i.product_name_of_plan = i.product.name if i.product else (sp.product.name if (sp and sp.product) else "-")
        else:
            i.client_name = "-"
            i.product_name_of_plan = i.product.name if i.product else "-"

        i.original_quantity = orig_qty
        i.ordered_quantity = ordered_qty
        item_out = prod_schemas.ProductionPlanItem.model_validate(i)
        if ordered_qty > 0:
            item_out.cost = 0.0
        item_out.quantity = remaining_qty
        pending_items.append(item_out)

    print(f"[DEBUG] Pending Outsourcing Items: Found {len(pending_items)} items.")
    return pending_items


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
    date_str = now_kst().strftime("%Y%m%d")
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
                order_size=item.order_size,
                material=item.material,
                production_plan_item_id=item.production_plan_item_id,
                material_requirement_id=item.material_requirement_id,
                consumable_purchase_wait_id=item.consumable_purchase_wait_id
            )
            db.add(db_item)
            
        # Ensure all purchase order items are explicitly flushed to avoid autoflush issues
        await db.flush()
        
        for item in order_in.items:
            if item.material_requirement_id:
                await _sync_material_requirement_status(db, item.material_requirement_id)
            if item.consumable_purchase_wait_id:
                await _sync_consumable_wait_status(db, item.consumable_purchase_wait_id)
            if item.production_plan_item_id:
                await _sync_plan_item_from_purchases(db, item.production_plan_item_id)

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

@router.post("/purchase/orders/{order_id}/complete")
async def complete_purchase_order(
    order_id: int,
    body: Optional[dict] = None,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_user)
):
    """구매 발주서 완료 처리 (입고 반영)"""
    from fastapi import Body
    query = select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.id == order_id)
    res = await db.execute(query)
    order = res.scalars().first()
    
    if not order:
        raise HTTPException(status_code=404, detail="발주서를 찾을 수 없습니다.")
    if order.status == PurchaseStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="이미 완료(입고)된 발주건입니다.")

    # actual_delivery_date: body로 전달되면 해당 날짜, 없으면 당일
    body = body or {}
    actual_date_str = body.get("actual_delivery_date")
    if actual_date_str:
        from datetime import date as date_type
        try:
            actual_date = date_type.fromisoformat(str(actual_date_str))
        except Exception:
            actual_date = now_kst().date()
    else:
        actual_date = now_kst().date()
        
    order.status = PurchaseStatus.COMPLETED
    order.actual_delivery_date = actual_date
    
    from app.models.production import ProductionPlanItem, ProductionStatus
    from app.api.utils.status_cascade import on_production_item_completed
    from app.api.endpoints.production import check_and_complete_production_plan

    completed_plan_ids = set()
    for item in order.items:
        qty = item.quantity - item.received_quantity
        if qty > 0:
            item.received_quantity += qty

        if item.product_id:
            # [Fix] 발주 완료 시 제품 마스터의 최근 단가 필드 자동 갱신
            product = await db.get(Product, item.product_id)
            if product:
                product.recent_price = item.unit_price
                db.add(product)

        if item.production_plan_item_id:
            plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
            if plan_item:
                await db.flush()
                is_fully_done, _ = await _sync_plan_item_from_purchases(db, item.production_plan_item_id)
                if is_fully_done:
                    if plan_item.status != ProductionStatus.COMPLETED:
                        plan_item.status = ProductionStatus.COMPLETED
                        db.add(plan_item)
                        await on_production_item_completed(db, plan_item, reference=f"PO: {order.order_no}", completion_date=actual_date)
                    completed_plan_ids.add(plan_item.plan_id)
        elif qty > 0 and item.product_id:
            product = await db.get(Product, item.product_id)
            if not product or product.item_type != 'CONSUMABLE':
                await handle_stock_movement(
                    db=db,
                    product_id=item.product_id,
                    quantity=qty,
                    transaction_type=TransactionType.IN,
                    reference=f"PO: {order.order_no}"
                )
        
        if getattr(item, 'consumable_purchase_wait_id', None):
            await db.flush()
            await _sync_consumable_wait_status(db, item.consumable_purchase_wait_id)
        if getattr(item, 'material_requirement_id', None):
            await db.flush()
            await _sync_material_requirement_status(db, item.material_requirement_id)

    await db.commit()
    for pid in completed_plan_ids:
        await check_and_complete_production_plan(db, pid)
    return {"message": "발주 완료 및 정상 입고 처리되었습니다.", "order_no": order.order_no}

@router.post("/outsourcing/orders/{order_id}/complete")
async def complete_outsourcing_order(
    order_id: int,
    body: Optional[dict] = None,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_user)
):
    """외주 발주서 완료 처리 (입고 반영)"""
    from app.models.purchasing import OutsourcingOrder, OutsourcingStatus, OutsourcingOrderItem
    from app.models.inventory import TransactionType
    from app.api.utils.inventory import handle_stock_movement
    from app.models.production import ProductionPlanItem, ProductionStatus
    from app.api.utils.status_cascade import on_production_item_completed
    from app.api.endpoints.production import check_and_complete_production_plan

    query = select(OutsourcingOrder).options(selectinload(OutsourcingOrder.items)).where(OutsourcingOrder.id == order_id)
    res = await db.execute(query)
    order = res.scalars().first()
    
    if not order:
        raise HTTPException(status_code=404, detail="외주 발주서를 찾을 수 없습니다.")
    if order.status == OutsourcingStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="이미 완료된 외주건입니다.")

    # actual_delivery_date: body로 전달되면 해당 날짜, 없으면 당일
    body = body or {}
    actual_date_str = body.get("actual_delivery_date")
    if actual_date_str:
        from datetime import date as date_type
        try:
            actual_date = date_type.fromisoformat(str(actual_date_str))
        except Exception:
            actual_date = now_kst().date()
    else:
        actual_date = now_kst().date()
        
    order.status = OutsourcingStatus.COMPLETED
    order.actual_delivery_date = actual_date
    
    completed_plan_ids = set()
    for item in order.items:
        item.status = OutsourcingStatus.COMPLETED
        db.add(item)
        # 1. Update related production plan item if exists (완제품 입고는 마지막 공정일 때만 on_production_item_completed에서 수행)
        if item.production_plan_item_id:
            plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
            if plan_item:
                await db.flush()
                is_fully_done, _ = await _sync_plan_item_from_outsourcing(db, item.production_plan_item_id)
                if is_fully_done:
                    if plan_item.status != ProductionStatus.COMPLETED:
                        plan_item.status = ProductionStatus.COMPLETED
                        db.add(plan_item)
                        await on_production_item_completed(db, plan_item, reference=f"OS: {order.order_no}", completion_date=actual_date)
                    completed_plan_ids.add(plan_item.plan_id)
        elif item.product_id:
            # 생산계획 공정과 무관한 단독 외주 발주인 경우에만 직접 입고 처리
            await handle_stock_movement(
                db=db,
                product_id=item.product_id,
                quantity=item.quantity,
                transaction_type=TransactionType.IN,
                reference=f"OS: {order.order_no}"
            )

    await db.commit()
    for pid in completed_plan_ids:
        await check_and_complete_production_plan(db, pid)
    return {"message": "외주 완료 및 정상 입고 처리되었습니다.", "order_no": order.order_no}


@router.post("/outsourcing/orders/{order_id}/quotation-complete")
async def quotation_complete_outsourcing_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_user)
):
    """외주 견적의뢰 완료 처리 (재고 이동 없음 - 견적 접수만 완료)"""
    from app.models.purchasing import OutsourcingOrder

    query = select(OutsourcingOrder).where(OutsourcingOrder.id == order_id)
    res = await db.execute(query)
    order = res.scalars().first()

    if not order:
        raise HTTPException(status_code=404, detail="외주 발주서를 찾을 수 없습니다.")
    if order.status != "QUOTATION":
        raise HTTPException(status_code=400, detail="견적의뢰 상태인 건만 견적완료 처리가 가능합니다.")

    order.status = "QUOTATION_COMPLETE"
    order.actual_delivery_date = now_kst().date()
    if order.note:
        order.note = order.note + f"\n[견적완료: {now_kst().strftime('%Y-%m-%d %H:%M')}]"
    else:
        order.note = f"[견적완료: {now_kst().strftime('%Y-%m-%d %H:%M')}]"

    await db.commit()
    return {"message": "견적완료 처리되었습니다.", "order_no": order.order_no}

@router.get("/fix-consumable-types")
async def trigger_fix_consumable_types(
    db: AsyncSession = Depends(deps.get_db)
) -> Any:
    """
    Emergency endpoint to fix missing purchase_type for consumables.
    Integrated via inner-app utility to avoid module import issues.
    """
    try:
        from app.api.utils.purchasing import fix_purchase_type
        updated_count = await fix_purchase_type(db)
        return {
            "status": "success", 
            "message": f"총 {updated_count}건의 발주서 유형이 '소모품(CONSUMABLE)'으로 보정되었습니다.",
            "updated_count": updated_count
        }
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "trace": traceback.format_exc()}


@router.get("/purchase/orders", response_model=List[schemas.PurchaseOrder])
async def read_purchase_orders(
    skip: int = 0,
    limit: int = 5000,
    status: Optional[str] = None,
    purchase_type: Optional[str] = None,
    partner_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer_id: Optional[int] = None,
    major_group_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve purchase orders with advanced filtering.
    """
    # Local import for deep loading
    from app.models.production import ProductionPlanItem, ProductionPlan

    query = select(PurchaseOrder).outerjoin(PurchaseOrder.order).options(
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
    if partner_id:
        query = query.where(PurchaseOrder.partner_id == partner_id)
    if start_date:
        if status == PurchaseStatus.COMPLETED or status == "COMPLETED":
            query = query.where(PurchaseOrder.actual_delivery_date >= start_date)
        else:
            query = query.where(PurchaseOrder.order_date >= start_date)
    if end_date:
        if status == PurchaseStatus.COMPLETED or status == "COMPLETED":
            query = query.where(PurchaseOrder.actual_delivery_date <= end_date)
        else:
            query = query.where(PurchaseOrder.order_date <= end_date)
    if customer_id:
        query = query.where(SalesOrder.partner_id == customer_id)
        
    if major_group_id and str(major_group_id).isdigit():
        major_group_id_int = int(major_group_id)
        from app.models.product import ProductGroup
        from sqlalchemy import or_
        subquery = select(PurchaseOrderItem.purchase_order_id).join(Product).join(ProductGroup, Product.group_id == ProductGroup.id)\
                     .where(or_(ProductGroup.id == major_group_id_int, ProductGroup.parent_id == major_group_id_int))
        query = query.where(PurchaseOrder.id.in_(subquery))

    query = query.order_by(desc(PurchaseOrder.order_date)).offset(skip).limit(limit or 2000)

    result = await db.execute(query)
    pos = result.unique().scalars().all()
    
    # Calculate related info and process names
    for po in pos:
        # Manually extract string to avoid Pydantic serialization of SalesOrder object
        po.sales_order_number = str(po.related_so_info_attr) if po.related_so_info_attr else None
        po.related_customer_names = str(po.related_cust_names_attr) if po.related_cust_names_attr else None
        
        for item in po.items:
            if item.production_plan_item:
                plan_item = item.production_plan_item
                item.process_name = plan_item.process_name
    
    return pos

@router.get("/purchase/orders/{order_id}", response_model=schemas.PurchaseOrder)
async def read_purchase_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Get a single Purchase Order by ID.
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
    ).where(PurchaseOrder.id == order_id)
    
    result = await db.execute(query)
    po = result.unique().scalar_one_or_none()
    
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
        
    # Enrichment logic similar to read_purchase_orders
    po.sales_order_number = str(po.related_so_info_attr) if po.related_so_info_attr else None
    po.related_customer_names = str(po.related_cust_names_attr) if po.related_cust_names_attr else None
    
    for item in po.items:
        if item.production_plan_item:
            item.process_name = item.production_plan_item.process_name
            
    return po

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
                    production_plan_item_id=item_in.production_plan_item_id,
                    material_requirement_id=item_in.material_requirement_id,
                    consumable_purchase_wait_id=getattr(item_in, 'consumable_purchase_wait_id', None)
                 )
                 db.add(db_item)
         
         affected_plan_ids = {item.production_plan_item_id for item in current_items.values() if item.production_plan_item_id}
         affected_mr_ids = {item.material_requirement_id for item in current_items.values() if getattr(item, 'material_requirement_id', None)}
         affected_cw_ids = {item.consumable_purchase_wait_id for item in current_items.values() if getattr(item, 'consumable_purchase_wait_id', None)}

         # Delete missing
         for item_id, item in current_items.items():
             if item_id not in incoming_ids:
                 item.production_plan_item = None
                 item.production_plan_item_id = None
                 await db.delete(item)

         await db.flush()

         for item_in in order_in.items:
             if item_in.production_plan_item_id:
                 affected_plan_ids.add(item_in.production_plan_item_id)
             if getattr(item_in, 'material_requirement_id', None):
                 affected_mr_ids.add(item_in.material_requirement_id)
             if getattr(item_in, 'consumable_purchase_wait_id', None):
                 affected_cw_ids.add(item_in.consumable_purchase_wait_id)

         for pid in affected_plan_ids:
             await _sync_plan_item_from_purchases(db, pid)
         for mrid in affected_mr_ids:
             await _sync_material_requirement_status(db, mrid)
         for cwid in affected_cw_ids:
             await _sync_consumable_wait_status(db, cwid)

    # --- Process Sync Logic ---
    if db_order.status == PurchaseStatus.ORDERED:
        from app.models.production import ProductionPlanItem, ProductionStatus
        for item in db_order.items:
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item and plan_item.status == ProductionStatus.PLANNED:
                    plan_item.status = ProductionStatus.IN_PROGRESS
                    db.add(plan_item)

    completed_po_plan_ids = set()
    if db_order.status == PurchaseStatus.COMPLETED:
        from app.models.production import ProductionPlanItem, ProductionStatus
        from app.api.utils.status_cascade import on_production_item_completed
        from app.api.endpoints.production import check_and_complete_production_plan
        if old_status != PurchaseStatus.COMPLETED:
            db_order.actual_delivery_date = now_kst().date()
        for item in db_order.items:
            item.received_quantity = item.quantity
            product = await db.get(Product, item.product_id) if item.product_id else None
            if product:
                product.recent_price = item.unit_price
                db.add(product)

            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item:
                    await db.flush()
                    is_fully_done, _ = await _sync_plan_item_from_purchases(db, item.production_plan_item_id)
                    if is_fully_done:
                        if plan_item.status != ProductionStatus.COMPLETED:
                            plan_item.status = ProductionStatus.COMPLETED
                            db.add(plan_item)
                            await on_production_item_completed(db, plan_item, reference=db_order.order_no, completion_date=db_order.actual_delivery_date)
                        completed_po_plan_ids.add(plan_item.plan_id)
            elif old_status != PurchaseStatus.COMPLETED and product and product.item_type != 'CONSUMABLE':
                await handle_stock_movement(
                    db=db,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    transaction_type=TransactionType.IN,
                    reference=db_order.order_no
                )

    await db.commit()
    for pid in completed_po_plan_ids:
        from app.api.endpoints.production import check_and_complete_production_plan
        await check_and_complete_production_plan(db, pid)
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
        ),
        selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.material_requirement).options(
            selectinload(MaterialRequirement.order).selectinload(SalesOrder.partner),
            selectinload(MaterialRequirement.plan).options(
                selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
            )
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
        
    affected_plan_ids = {item.production_plan_item_id for item in (db_order.items or []) if item.production_plan_item_id}
    affected_mr_ids = {item.material_requirement_id for item in (db_order.items or []) if getattr(item, 'material_requirement_id', None)}
    affected_cw_ids = {item.consumable_purchase_wait_id for item in (db_order.items or []) if getattr(item, 'consumable_purchase_wait_id', None)}

    for item in (db_order.items or []):
        item.production_plan_item = None
        item.production_plan_item_id = None

    await db.delete(db_order)
    await db.flush()

    for pid in affected_plan_ids:
        await _sync_plan_item_from_purchases(db, pid)
    for mrid in affected_mr_ids:
        await _sync_material_requirement_status(db, mrid)
    for cwid in affected_cw_ids:
        await _sync_consumable_wait_status(db, cwid)

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
    date_str = now_kst().strftime("%Y%m%d")
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
            note=item.note,
            pricing_type=getattr(item, 'pricing_type', None) or 'UNIT',
            total_weight=getattr(item, 'total_weight', None)
        )
        db.add(db_item)

    await db.flush()
    for item in order_in.items:
        if item.production_plan_item_id:
            await _sync_plan_item_from_outsourcing(db, item.production_plan_item_id)
    
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
    limit: int = 5000,
    status: Optional[str] = None,
    partner_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer_id: Optional[int] = None,
    major_group_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve outsourcing orders with advanced filtering.
    """
    # Local import
    from app.models.production import ProductionPlanItem, ProductionPlan

    try:
        query = select(OutsourcingOrder).outerjoin(OutsourcingOrder.order).options(
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
            if status == "COMPLETED" or status == OutsourcingStatus.COMPLETED:
                query = query.where(OutsourcingOrder.status.in_(["COMPLETED", "QUOTATION_COMPLETE"]))
            else:
                query = query.where(OutsourcingOrder.status == status)
        if partner_id:
            query = query.where(OutsourcingOrder.partner_id == partner_id)
        if start_date:
            if status == OutsourcingStatus.COMPLETED or status == "COMPLETED":
                query = query.where(OutsourcingOrder.actual_delivery_date >= start_date)
            else:
                query = query.where(OutsourcingOrder.order_date >= start_date)
        if end_date:
            if status == OutsourcingStatus.COMPLETED or status == "COMPLETED":
                query = query.where(OutsourcingOrder.actual_delivery_date <= end_date)
            else:
                query = query.where(OutsourcingOrder.order_date <= end_date)
        if customer_id:
            query = query.where(SalesOrder.partner_id == customer_id)
            
        if major_group_id and str(major_group_id).isdigit():
            major_group_id_int = int(major_group_id)
            from app.models.product import ProductGroup
            from sqlalchemy import or_
            subquery = select(OutsourcingOrderItem.outsourcing_order_id).join(Product).join(ProductGroup, Product.group_id == ProductGroup.id)\
                         .where(or_(ProductGroup.id == major_group_id_int, ProductGroup.parent_id == major_group_id_int))
            query = query.where(OutsourcingOrder.id.in_(subquery))

        query = query.order_by(desc(OutsourcingOrder.order_date)).offset(skip).limit(limit or 2000)

        result = await db.execute(query)
        oos = result.unique().scalars().all()
        
        for oo in oos:
            # Manually extract string to avoid Pydantic serialization of SalesOrder object
            oo.related_sales_order_info = str(oo.related_so_info_attr) if oo.related_so_info_attr else None
            oo.related_customer_names = str(oo.related_cust_names_attr) if oo.related_cust_names_attr else None
            
            for item in oo.items:
                if item.production_plan_item:
                    plan_item = item.production_plan_item
                    item.process_name = plan_item.process_name
        
        return oos
    except Exception as e:
        import traceback
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to read outsourcing orders: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"외주발주 조회 중 오류 발생: {str(e)}")

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
         
         affected_plan_ids = {item.production_plan_item_id for item in current_items.values() if item.production_plan_item_id}

         # Delete missing
         for item_id, item in current_items.items():
             if item_id not in incoming_ids:
                 item.production_plan_item = None
                 item.production_plan_item_id = None
                 await db.delete(item)

         await db.flush()

         for item_in in order_in.items:
             if item_in.production_plan_item_id:
                 affected_plan_ids.add(item_in.production_plan_item_id)

         for pid in affected_plan_ids:
             await _sync_plan_item_from_outsourcing(db, pid)

    # --- Process Sync Logic ---
    if db_order.status == OutsourcingStatus.ORDERED:
        from app.models.production import ProductionPlanItem, ProductionStatus
        for item in db_order.items:
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item and plan_item.status == ProductionStatus.PLANNED:
                    plan_item.status = ProductionStatus.IN_PROGRESS
                    db.add(plan_item)

    completed_os_plan_ids = set()
    if db_order.status == OutsourcingStatus.COMPLETED:
        from app.models.production import ProductionPlanItem, ProductionStatus
        from app.api.utils.status_cascade import on_production_item_completed
        from app.api.endpoints.production import check_and_complete_production_plan
        if old_status != OutsourcingStatus.COMPLETED:
            db_order.actual_delivery_date = now_kst().date()
        for item in db_order.items:
            item.status = OutsourcingStatus.COMPLETED
            db.add(item)
            if item.production_plan_item_id:
                plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                if plan_item:
                    await db.flush()
                    is_fully_done, _ = await _sync_plan_item_from_outsourcing(db, item.production_plan_item_id)
                    if is_fully_done:
                        if plan_item.status != ProductionStatus.COMPLETED:
                            plan_item.status = ProductionStatus.COMPLETED
                            db.add(plan_item)
                            await on_production_item_completed(db, plan_item, reference=db_order.order_no, completion_date=db_order.actual_delivery_date)
                        completed_os_plan_ids.add(plan_item.plan_id)
            elif old_status != OutsourcingStatus.COMPLETED and item.product_id:
                await handle_stock_movement(
                    db=db,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    transaction_type=TransactionType.IN,
                    reference=db_order.order_no
                )

    await db.commit()
    for pid in completed_os_plan_ids:
        from app.api.endpoints.production import check_and_complete_production_plan
        await check_and_complete_production_plan(db, pid)
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
        
    affected_plan_ids = {item.production_plan_item_id for item in (db_order.items or []) if item.production_plan_item_id}

    for item in (db_order.items or []):
        item.production_plan_item = None
        item.production_plan_item_id = None

    await db.delete(db_order)
    await db.flush()

    for pid in affected_plan_ids:
        await _sync_plan_item_from_outsourcing(db, pid)

    await db.commit()
    return None
@router.delete("/mrp/requirements/{requirement_id}")
async def delete_material_requirement(
    requirement_id: int,
    db: AsyncSession = Depends(deps.get_db),
):
    """
    미발주 소요량(MRP) 레코드 개별 삭제.
    단, 이미 발주(ORDERED) 상태이거나 발주 품목이 연결된 경우 삭제 불가.
    """
    req = await db.get(MaterialRequirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="소요량 데이터를 찾을 수 없습니다.")

    # 1. 상태 체크
    if req.status == "ORDERED":
         raise HTTPException(
             status_code=400, 
             detail="이미 발주가 완료된 소요량 데이터는 삭제할 수 없습니다. 발주를 먼저 취소해 주세요."
         )

    # 2. 발주 품목 연결 체크 (방어적 확인)
    stmt = select(PurchaseOrderItem).where(PurchaseOrderItem.material_requirement_id == requirement_id)
    result = await db.execute(stmt)
    if result.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="이 소요량과 연결된 발주 품목이 존재합니다. 발주 품목을 먼저 삭제해 주세요."
        )

    await db.delete(req)
    await db.commit()
    return {"message": "정상적으로 삭제되었습니다."}


class BulkDeletePendingItemsRequest(schemas.BaseModel):
    item_ids: List[int]


async def _dismiss_pending_plan_items_internal(db: AsyncSession, item_ids: List[int]) -> int:
    """
    미발주 목록(외주/구매 대기)에서 관리자가 선택한 ProductionPlanItem들을
    발주 없이 완료(COMPLETED) 처리하여 미발주 목록에서 제거하고,
    상위 생산계획의 모든 공정이 완료된 경우 생산계획/수주/재고생산 상태도 완료로 복원합니다.
    """
    from app.models.sales import OrderStatus
    from app.models.inventory import StockProductionStatus

    if not item_ids:
        return 0

    stmt = (
        select(ProductionPlanItem)
        .options(selectinload(ProductionPlanItem.plan))
        .where(ProductionPlanItem.id.in_(item_ids))
    )
    items = (await db.execute(stmt)).scalars().all()
    if not items:
        return 0

    affected_plan_ids = set()
    dismissed_count = 0
    for item in items:
        item.status = ProductionStatus.COMPLETED
        db.add(item)
        dismissed_count += 1
        if item.plan_id:
            affected_plan_ids.add(item.plan_id)

    await db.flush()

    for plan_id in affected_plan_ids:
        plan_stmt = (
            select(ProductionPlan)
            .options(
                selectinload(ProductionPlan.items),
                selectinload(ProductionPlan.order),
                selectinload(ProductionPlan.stock_production),
            )
            .where(ProductionPlan.id == plan_id)
        )
        plan = (await db.execute(plan_stmt)).scalar_one_or_none()
        if not plan or not plan.items:
            continue

        all_purch_out_done = all(
            (it.status == ProductionStatus.COMPLETED or getattr(it.status, "value", str(it.status)) == "COMPLETED")
            for it in plan.items
            if any(k in (it.course_type or "").upper() for k in ("PURCHASE", "OUTSOURCING"))
            or any(k in (it.course_type or "") for k in ("구매", "외주"))
        )
        has_in_progress_internal = any(
            getattr(it.status, "value", str(it.status)) == "IN_PROGRESS"
            for it in plan.items
        )
        ord_status = getattr(plan.order.status, "value", str(plan.order.status)) if plan.order else ""
        order_already_completed = ord_status in ("DELIVERED", "DELIVERY_COMPLETED", "PRODUCTION_COMPLETED")

        all_done = all(
            it.status == ProductionStatus.COMPLETED
            or getattr(it.status, "value", str(it.status)) == "COMPLETED"
            for it in plan.items
        )
        if not all_done and all_purch_out_done and (order_already_completed or not has_in_progress_internal):
            for it in plan.items:
                if it.status != ProductionStatus.COMPLETED and getattr(it.status, "value", str(it.status)) != "COMPLETED":
                    it.status = ProductionStatus.COMPLETED
                    db.add(it)
            all_done = True

        if all_done:
            if plan.status != ProductionStatus.COMPLETED:
                plan.status = ProductionStatus.COMPLETED
                if not plan.actual_completion_date:
                    plan.actual_completion_date = (
                        (plan.order.actual_delivery_date if plan.order else None)
                        or plan.plan_date
                        or now_kst().date()
                    )
                db.add(plan)

            if plan.order:
                if ord_status not in ("DELIVERED", "DELIVERY_COMPLETED", "PARTIALLY_DELIVERED", "PRODUCTION_COMPLETED"):
                    plan.order.status = OrderStatus.PRODUCTION_COMPLETED
                    db.add(plan.order)

            if plan.stock_production:
                sp_status = getattr(plan.stock_production.status, "value", str(plan.stock_production.status))
                if sp_status != "COMPLETED":
                    plan.stock_production.status = StockProductionStatus.COMPLETED
                    db.add(plan.stock_production)

    await db.commit()
    return dismissed_count


@router.delete("/pending-items/{item_id}")
async def delete_pending_plan_item(
    item_id: int,
    db: AsyncSession = Depends(deps.get_db),
):
    count = await _dismiss_pending_plan_items_internal(db, [item_id])
    if count == 0:
        raise HTTPException(status_code=404, detail="미발주 항목을 찾을 수 없습니다.")
    await db.commit()
    return {"message": "미발주 목록에서 삭제(완료 처리)되었습니다.", "dismissed_count": count}


@router.post("/pending-items/bulk-delete")
async def bulk_delete_pending_plan_items(
    req: BulkDeletePendingItemsRequest,
    db: AsyncSession = Depends(deps.get_db),
):
    count = await _dismiss_pending_plan_items_internal(db, req.item_ids)
    await db.commit()
    return {"message": f"{count}건이 미발주 목록에서 삭제(완료 처리)되었습니다.", "dismissed_count": count}

