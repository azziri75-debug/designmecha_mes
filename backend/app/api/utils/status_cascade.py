from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
import logging

logger = logging.getLogger(__name__)

async def complete_production_for_order(db: AsyncSession, order_id: int, reference: str = "Delivery"):
    """
    수주가 납품 완료(DELIVERY_COMPLETED)되었을 때, 연관된 모든 생산 계획을 완료 처리합니다.
    """
    from app.models.sales import SalesOrder
    so = await db.get(SalesOrder, order_id)
    delivery_date = so.actual_delivery_date if so else None

    plans_query = select(ProductionPlan).where(
        ProductionPlan.order_id == order_id,
        ProductionPlan.status != ProductionStatus.COMPLETED
    )
    result = await db.execute(plans_query)
    plans = result.scalars().all()
    
    for plan in plans:
        plan.status = ProductionStatus.COMPLETED
        plan.actual_completion_date = delivery_date or now_kst().date()
        db.add(plan)
        
        # 하위 모든 공정 완료 처리
        ppi_query = select(ProductionPlanItem).where(
            ProductionPlanItem.plan_id == plan.id,
            ProductionPlanItem.status != ProductionStatus.COMPLETED
        )
        ppi_res = await db.execute(ppi_query)
        items = ppi_res.scalars().all()
        
        for item in items:
            await on_production_item_completed(
                db, item, 
                reference=f"{reference} (SO#{order_id})", 
                auto_delivery=True,
                completion_date=delivery_date
            )

    await db.flush()

async def on_production_item_completed(
    db: AsyncSession, 
    item: ProductionPlanItem, 
    reference: str = None, 
    auto_delivery: bool = False,
    completion_date = None
):
    """
    생산 상세 공정(ProductionPlanItem)이 완료되었을 때 실행되는 로직.
    1. 상태를 COMPLETED로 변경.
    2. 연관된 발주/외주가 있다면 자동 완료 처리 및 재고 변동 기록 (입고+소요 상쇄).
    3. 마지막 공정이고 사내 생산인 경우 완제품 입고 및 BOM 차감.
    4. 납품에 의한 완료(auto_delivery)인 경우 완제품 재고는 입고-출고 상쇄 처리.
    """
    from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus
    from app.models.inventory import TransactionType
    from app.api.utils.inventory import handle_stock_movement, handle_backflush

    if item.status != ProductionStatus.COMPLETED:
        item.status = ProductionStatus.COMPLETED
        db.add(item)

    # --- 1. 연관 발주/외주일 경우 자동 완료 처리 및 미발주시 자동 생성 ---
    from app.models.basics import Partner
    from app.core.timezone import now_kst

    # 1-A. 자재 발주 처리 (PURCHASE)
    if "PURCHASE" in (item.course_type or "").upper() or "구매" in (item.course_type or ""):
        po_items_stmt = select(PurchaseOrderItem).where(PurchaseOrderItem.production_plan_item_id == item.id)
        po_items_res = await db.execute(po_items_stmt)
        po_items = po_items_res.scalars().all()
        
        if po_items:
            # 기존 발주서가 있는 경우 완료 처리
            for po_item in po_items:
                po = await db.get(PurchaseOrder, po_item.purchase_order_id)
                if po and po.status != PurchaseStatus.COMPLETED:
                    # [보강] 입고 완료 데이터 세부 기록 (날짜 동기화)
                    po.status = PurchaseStatus.COMPLETED
                    po.actual_delivery_date = completion_date or now_kst().date()
                    # [보강] 발주서 내의 모든 품목에 대해 입고 완료 처리 (UI 리스트 노출용)
                    from sqlalchemy import update
                    item_update_stmt = (
                        update(PurchaseOrderItem)
                        .where(PurchaseOrderItem.purchase_order_id == po.id)
                        .values(received_quantity=PurchaseOrderItem.quantity)
                    )
                    await db.execute(item_update_stmt)
                    
                    # [보강] 상위 수주 연결 및 재고 기록
                    if not po.order_id:
                        plan = await db.get(ProductionPlan, item.plan_id)
                        if plan: po.order_id = plan.order_id
                    
                    await handle_stock_movement(db, po_item.product_id, po_item.quantity, TransactionType.IN, f"Auto-Receipt ({reference or 'Production'})")
                    await handle_stock_movement(db, po_item.product_id, -po_item.quantity, TransactionType.OUT, f"Auto-Consumption ({reference or 'Production'})")
                    db.add(po)
                
                # 소요량/소모품 대기 항목 동기화
                from app.models.purchasing import MaterialRequirement, ConsumablePurchaseWait
                if po_item.material_requirement_id:
                    mr = await db.get(MaterialRequirement, po_item.material_requirement_id)
                    if mr: mr.status = "COMPLETED"; db.add(mr)
                if po_item.consumable_purchase_wait_id:
                    cw = await db.get(ConsumablePurchaseWait, po_item.consumable_purchase_wait_id)
                    if cw: cw.status = "COMPLETED"; db.add(cw)
        else:
            # [NEW] 발주서가 없는 경우 자동 생성 (이력 관리용)
            date_str = now_kst().strftime("%Y%m%d")
            # 자동 채번 (APO-YYYYMMDD-XXX)
            prefix = f"APO-{date_str}-"
            last_stmt = select(PurchaseOrder.order_no).where(PurchaseOrder.order_no.like(f"{prefix}%")).order_by(func.desc(PurchaseOrder.order_no)).limit(1)
            last_res = await db.execute(last_stmt)
            last_no = last_res.scalar()
            new_seq = (int(last_no.split("-")[-1]) + 1) if last_no else 1
            new_order_no = f"{prefix}{new_seq:03d}"
            
            # 파트너 매칭
            partner_id = None
            if item.partner_name:
                p_stmt = select(Partner.id).where(Partner.name == item.partner_name).limit(1)
                p_res = await db.execute(p_stmt)
                partner_id = p_res.scalar()
            
            new_po = PurchaseOrder(
                order_no=new_order_no,
                partner_id=partner_id,
                order_id=order_id,
                order_date=now_kst().date(),
                actual_delivery_date=completion_date or now_kst().date(),
                status=PurchaseStatus.COMPLETED,
                purchase_type="PART",
                note=f"공정 완료에 의한 자동 생성 ({reference or item.id})"
            )
            db.add(new_po)
            await db.flush()
            
            new_po_item = PurchaseOrderItem(
                purchase_order_id=new_po.id,
                product_id=item.product_id,
                quantity=item.quantity,
                received_quantity=item.quantity,
                production_plan_item_id=item.id
            )
            db.add(new_po_item)
            
            # 재고 이력 (입고+투입 상쇄)
            await handle_stock_movement(db, item.product_id, item.quantity, TransactionType.IN, f"Auto-Receipt ({new_order_no})")
            await handle_stock_movement(db, item.product_id, -item.quantity, TransactionType.OUT, f"Auto-Consumption ({new_order_no})")

    # 1-B. 외주 발주 처리 (OUTSOURCING)
    if "OUTSOURCING" in (item.course_type or "").upper() or "외주" in (item.course_type or ""):
        os_items_stmt = select(OutsourcingOrderItem).where(OutsourcingOrderItem.production_plan_item_id == item.id)
        os_items_res = await db.execute(os_items_stmt)
        os_items = os_items_res.scalars().all()
        
        if os_items:
            for os_item in os_items:
                os_order = await db.get(OutsourcingOrder, os_item.outsourcing_order_id)
                if os_order and os_order.status != OutsourcingStatus.COMPLETED:
                    os_order.status = OutsourcingStatus.COMPLETED
                    os_order.actual_delivery_date = completion_date or now_kst().date()
                    
                    # [보강] 외주 발주서 내 모든 품목 상태 완료로 변경
                    from sqlalchemy import update
                    os_item_update_stmt = (
                        update(OutsourcingOrderItem)
                        .where(OutsourcingOrderItem.outsourcing_order_id == os_order.id)
                        .values(status=OutsourcingStatus.COMPLETED)
                    )
                    await db.execute(os_item_update_stmt)

                    # [보강] 상위 수주 연결 연동
                    if not os_order.order_id:
                        plan = await db.get(ProductionPlan, item.plan_id)
                        if plan: os_order.order_id = plan.order_id
                        
                    await handle_stock_movement(db, os_item.product_id, os_item.quantity, TransactionType.IN, f"Auto-OS-Receipt ({reference or 'Production'})")
                    await handle_stock_movement(db, os_item.product_id, -os_item.quantity, TransactionType.OUT, f"Auto-OS-Consumption ({reference or 'Production'})")
                    db.add(os_order)
        else:
            # [NEW] 외주 발주서 자동 생성
            date_str = now_kst().strftime("%Y%m%d")
            prefix = f"AOS-{date_str}-"
            last_stmt = select(OutsourcingOrder.order_no).where(OutsourcingOrder.order_no.like(f"{prefix}%")).order_by(func.desc(OutsourcingOrder.order_no)).limit(1)
            last_res = await db.execute(last_stmt)
            last_no = last_res.scalar()
            new_seq = (int(last_no.split("-")[-1]) + 1) if last_no else 1
            new_order_no = f"{prefix}{new_seq:03d}"
            
            partner_id = None
            if item.partner_name:
                p_stmt = select(Partner.id).where(Partner.name == item.partner_name).limit(1)
                p_res = await db.execute(p_stmt)
                partner_id = p_res.scalar()
                
            new_os = OutsourcingOrder(
                order_no=new_order_no,
                partner_id=partner_id,
                order_id=order_id,
                order_date=now_kst().date(),
                actual_delivery_date=completion_date or now_kst().date(),
                status=OutsourcingStatus.COMPLETED,
                note=f"공정 완료에 의한 자동 생성 ({reference or item.id})"
            )
            db.add(new_os)
            await db.flush()
            
            new_os_item = OutsourcingOrderItem(
                outsourcing_order_id=new_os.id,
                product_id=item.product_id,
                quantity=item.quantity,
                production_plan_item_id=item.id,
                status=OutsourcingStatus.COMPLETED
            )
            db.add(new_os_item)
            
            # 재고 이력
            await handle_stock_movement(db, item.product_id, item.quantity, TransactionType.IN, f"Auto-OS-Receipt ({new_order_no})")
            await handle_stock_movement(db, item.product_id, -item.quantity, TransactionType.OUT, f"Auto-OS-Consumption ({new_order_no})")

    # --- 1-C. [NEW] 헤더 상태 업데이트 및 완료일 기록 ---
    # 상세 공정 완료 시 헤더가 모두 완료되었는지 확인
    plan = await db.get(ProductionPlan, item.plan_id)
    if plan and plan.status != ProductionStatus.COMPLETED:
        pending_stmt = select(func.count(ProductionPlanItem.id)).where(
            ProductionPlanItem.plan_id == plan.id,
            ProductionPlanItem.status != ProductionStatus.COMPLETED
        )
        p_res = await db.execute(pending_stmt)
        if p_res.scalar() == 0:
            plan.status = ProductionStatus.COMPLETED
            plan.actual_completion_date = completion_date or now_kst().date()
            db.add(plan)

    # --- 2. 사내 생산(INTERNAL)이고 마지막 공정일 경우 완제품 입고 및 BOM 차감 ---
    max_seq_stmt = select(func.max(ProductionPlanItem.sequence)).where(ProductionPlanItem.plan_id == item.plan_id)
    max_seq_res = await db.execute(max_seq_stmt)
    max_seq = max_seq_res.scalar()
    is_last = (item.sequence == max_seq)

    if item.course_type == "INTERNAL" and is_last:
        # A. 완제품 입고 (+)
        if auto_delivery:
            # 입고 후 즉시 출고 (FG Net 0)
            await handle_stock_movement(db, item.product_id, item.quantity, TransactionType.IN, f"Auto-Production ({reference})")
            await handle_stock_movement(db, item.product_id, -item.quantity, TransactionType.OUT, f"Auto-Delivery ({reference})")
        else:
            await handle_stock_movement(db, item.product_id, item.quantity, TransactionType.IN, f"Production Done ({reference or item.id})")
        
        # B. BOM 하위 부품 자동 차감 (-)
        await handle_backflush(db, item.product_id, item.quantity, reference=f"Production #{item.plan_id}")

    await db.flush()
