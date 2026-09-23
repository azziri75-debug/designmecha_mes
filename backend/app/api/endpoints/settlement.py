from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, extract, and_, String, case
from typing import List, Optional, Dict, Any
from datetime import date

from app.api.deps import get_db
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus, DeliveryHistory, DeliveryHistoryItem
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, OutsourcingOrder, OutsourcingOrderItem, PurchaseStatus, OutsourcingStatus
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.quality import QualityDefect, CustomerComplaint, DefectStatus
from app.models.product import Product, ProductGroup
from app.models.basics import Partner
from app.models.inventory import StockProduction
from app.models.approval import ApprovalDocument, ApprovalStatus, DocumentType

router = APIRouter()


def get_month_filter(model_attr, year: int, month: Optional[int]):
    if month:
        return and_(
            extract('year', model_attr) == year,
            extract('month', model_attr) == month
        )
    else:
        return extract('year', model_attr) == year

@router.get("/orders")
async def get_settlement_orders(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """1. ?˜ì£¼?´ì—­: ?˜ì£¼ëª©ë¡(?•ì •?íƒœ) ê¸°ì?"""
    query = select(
        Partner.name.label("partner_name"),
        SalesOrder.order_date,
        Product.name.label("product_name"),
        Product.specification,
        SalesOrderItem.quantity,
        SalesOrderItem.unit_price,
        SalesOrderItem.currency,
        (SalesOrderItem.quantity * SalesOrderItem.unit_price).label("total_price")
    ).select_from(SalesOrder)\
     .join(SalesOrderItem, SalesOrder.id == SalesOrderItem.order_id)\
     .join(Partner, SalesOrder.partner_id == Partner.id)\
     .join(Product, SalesOrderItem.product_id == Product.id)\
     .where(
         SalesOrder.status != OrderStatus.CANCELLED,
         get_month_filter(SalesOrder.order_date, year, month)
     )
    
    if major_group_id:
        # Filter by major group (Product -> Group -> Parent Group)
        subq = select(ProductGroup.id).where(and_(ProductGroup.parent_id == major_group_id))
        query = query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))

    result = await db.execute(query)
    return [dict(r._mapping) for r in result]

@router.get("/sales")
async def get_settlement_sales(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """2. ë§¤ì¶œ?´ì—­: ?©í’ˆ?„ë£Œ + ê±°ëž˜ëª…ì„¸?œê? ë°œí–‰??ë¶€ë¶„ë‚©???¬í•¨"""

    # ?€?€ Query 1 [?˜ì •]: DELIVERY_COMPLETED / DELIVERED ?˜ì£¼
    # ë°˜ë“œ??DeliveryHistory ê¸°ì??¼ë¡œ ì§‘ê³„?´ì•¼ ë¶„í• ?©í’ˆ ??ê°??©í’ˆ?¼ì´ ?•í™•??ë°˜ì˜??
    # (SalesOrder.actual_delivery_date ?¬ìš© ??ìµœì¢…?©í’ˆ?¼ë¡œ ëª¨ë“  ë¶„í• ë¶„ì´ ì§‘ê³„?˜ëŠ” ë²„ê·¸ ë°œìƒ)
    q1 = select(
        Partner.name.label("partner_name"),
        SalesOrder.order_date,
        DeliveryHistory.delivery_date.label("delivery_date"),
        Product.name.label("product_name"),
        Product.specification,
        DeliveryHistoryItem.quantity,
        SalesOrderItem.unit_price,
        SalesOrderItem.currency,
        (DeliveryHistoryItem.quantity * SalesOrderItem.unit_price).label("total_price")
    ).select_from(DeliveryHistory)\
     .join(DeliveryHistoryItem, DeliveryHistory.id == DeliveryHistoryItem.delivery_id)\
     .join(SalesOrderItem, DeliveryHistoryItem.order_item_id == SalesOrderItem.id)\
     .join(SalesOrder, DeliveryHistory.order_id == SalesOrder.id)\
     .join(Partner, SalesOrder.partner_id == Partner.id)\
     .join(Product, SalesOrderItem.product_id == Product.id)\
     .where(
         SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED]),
         get_month_filter(DeliveryHistory.delivery_date, year, month)
     )

    # ?€?€ Query 2: ê±°ëž˜ëª…ì„¸??statement_json)ê°€ ë°œí–‰??ë¶€ë¶„ë‚©???˜ì£¼ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
    # PARTIALLY_DELIVERED ?íƒœ?¬ë„ ?´ë‹¹?”ì— statement_json???ˆìœ¼ë©?ë§¤ì¶œ ì§‘ê³„ ?¬í•¨
    # ?˜ëŸ‰: DeliveryHistoryItem.quantity (?¤ì œ ?©í’ˆ ?˜ëŸ‰)
    # ?¨ê?: SalesOrderItem.unit_price (?˜ì£¼ ?¨ê?)
    q2 = select(
        Partner.name.label("partner_name"),
        SalesOrder.order_date,
        DeliveryHistory.delivery_date.label("delivery_date"),
        Product.name.label("product_name"),
        Product.specification,
        DeliveryHistoryItem.quantity,
        SalesOrderItem.unit_price,
        SalesOrderItem.currency,
        (DeliveryHistoryItem.quantity * SalesOrderItem.unit_price).label("total_price")
    ).select_from(DeliveryHistory)\
     .join(DeliveryHistoryItem, DeliveryHistory.id == DeliveryHistoryItem.delivery_id)\
     .join(SalesOrderItem, DeliveryHistoryItem.order_item_id == SalesOrderItem.id)\
     .join(SalesOrder, DeliveryHistory.order_id == SalesOrder.id)\
     .join(Partner, SalesOrder.partner_id == Partner.id)\
     .join(Product, SalesOrderItem.product_id == Product.id)\
     .where(
         SalesOrder.status == OrderStatus.PARTIALLY_DELIVERED,
         DeliveryHistory.statement_json.isnot(None),
         get_month_filter(DeliveryHistory.delivery_date, year, month)
     )

    if major_group_id:
        subq = select(ProductGroup.id).where(ProductGroup.parent_id == major_group_id)
        group_filter = and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id))
        q1 = q1.where(group_filter)
        q2 = q2.where(group_filter)

    res1 = await db.execute(q1)
    res2 = await db.execute(q2)

    return [dict(r._mapping) for r in res1] + [dict(r._mapping) for r in res2]


@router.get("/purchases")
async def get_settlement_purchases(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    major_group_id: Optional[int] = Query(None),
    dept: Optional[str] = Query(None),  # ?¹ìˆ˜ ?„í„°: "?Œëª¨?? ?„ë‹¬ ???Œëª¨?ˆë§Œ ì¡°íšŒ
    db: AsyncSession = Depends(get_db)
):
    """3. ë§¤ìž…?´ì—­: êµ¬ë§¤ë°œì£¼??+ ?¸ì£¼ë°œì£¼??ê¸°ì? (?¤ì œ ?…ê³ ??ê¸°ì?)"""
    data = []
    
    # Material/Consumable Purchases - ?¤ì œ ?…ê³ ??actual_delivery_date) ê¸°ì?
    p_query = select(
        PurchaseOrder.purchase_type.label("category"),
        Partner.name.label("partner_name"),
        PurchaseOrder.order_date,
        PurchaseOrder.actual_delivery_date.label("delivery_date"),
        Product.name.label("product_name"),
        Product.specification,
        PurchaseOrderItem.quantity,
        PurchaseOrderItem.unit_price,
        (PurchaseOrderItem.quantity * PurchaseOrderItem.unit_price).label("total_price"),
        PurchaseOrderItem.currency
    ).select_from(PurchaseOrder)\
     .join(PurchaseOrderItem, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)\
     .join(Partner, PurchaseOrder.partner_id == Partner.id)\
     .join(Product, PurchaseOrderItem.product_id == Product.id)\
     .where(
         PurchaseOrder.status == PurchaseStatus.COMPLETED,
         PurchaseOrder.actual_delivery_date != None,
         get_month_filter(PurchaseOrder.actual_delivery_date, year, month)
     )
    
    # Outsourcing Purchases - ?¤ì œ ?©í’ˆ??actual_delivery_date) ê¸°ì?
    o_query = select(
        func.cast("OUTSOURCING", String).label("category"),
        Partner.name.label("partner_name"),
        OutsourcingOrder.order_date,
        OutsourcingOrder.actual_delivery_date.label("delivery_date"),
        Product.name.label("product_name"),
        Product.specification,
        OutsourcingOrderItem.quantity,
        OutsourcingOrderItem.unit_price,
        (OutsourcingOrderItem.quantity * OutsourcingOrderItem.unit_price).label("total_price"),
        func.cast("KRW", String).label("currency")
    ).select_from(OutsourcingOrder)\
     .join(OutsourcingOrderItem, OutsourcingOrder.id == OutsourcingOrderItem.outsourcing_order_id)\
     .join(Partner, OutsourcingOrder.partner_id == Partner.id)\
     .outerjoin(Product, OutsourcingOrderItem.product_id == Product.id)\
     .where(
         OutsourcingOrder.status == OutsourcingStatus.COMPLETED,
         OutsourcingOrder.actual_delivery_date != None,
         get_month_filter(OutsourcingOrder.actual_delivery_date, year, month)
     )

    # ?Œëª¨???„í„°: dept='?Œëª¨?? ?´ê±°??major_group_id ?†ì´ ?Œëª¨???„ìš© ì¡°íšŒ??ê²½ìš°
    is_consumable_filter = (dept == '?Œëª¨??)

    if is_consumable_filter:
        # ?Œëª¨?ˆë§Œ ì¡°íšŒ: p_query??purchase_type=CONSUMABLEë§? o_query???œì™¸
        p_query = p_query.where(PurchaseOrder.purchase_type == 'CONSUMABLE')
        res_p = await db.execute(p_query)
        data.extend([dict(r._mapping) for r in res_p])
    else:
        if major_group_id:
            subq = select(ProductGroup.id).where(ProductGroup.parent_id == major_group_id)
            # ?Œëª¨??CONSUMABLE) ë°œì£¼??product group ?€??ë³„ë„ ë¶„ë¥˜?´ë?ë¡??œí’ˆê·¸ë£¹ ?„í„°?ì„œ ?œì™¸
            p_query = p_query.where(
                PurchaseOrder.purchase_type != 'CONSUMABLE',
                and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id))
            )
            o_query = o_query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))
        else:
            # ?„ì²´ ì¡°íšŒ: ?Œëª¨??PurchaseOrder??product group ë¬´ê??˜ê²Œ ?¬í•¨
            pass

        res_p = await db.execute(p_query)
        res_o = await db.execute(o_query)
        data.extend([dict(r._mapping) for r in res_p])
        data.extend([dict(r._mapping) for r in res_o])

    # --- ?´ë?ê¸°ì•ˆ ?€ê¸ˆì?ê¸?ê±?ì¶”ê? ì§‘ê³„ ---
    import re as _re
    from datetime import date as _date

    # major_group_idê°€ ? íƒ??ê²½ìš° ?´ë‹¹ ê·¸ë£¹???´ë¦„??ì¡°íšŒ?˜ì—¬ ê¸°ì•ˆë¶€???„í„°ë¡??¬ìš©
    dept_filter_name: Optional[str] = None
    if dept and dept != '?Œëª¨??:
        dept_filter_name = dept
    elif major_group_id:
        grp_res = await db.execute(
            select(ProductGroup.name).where(ProductGroup.id == major_group_id)
        )
        grp_row = grp_res.first()
        if grp_row:
            dept_filter_name = grp_row[0]

    # ?Œëª¨???„í„°ê°€ ?„ë‹ ?Œë§Œ ?€ê¸ˆì?ê¸‰ê¸°??ì§‘ê³„
    if not is_consumable_filter:
        payment_query = select(ApprovalDocument).where(
            ApprovalDocument.doc_type == DocumentType.INTERNAL_DRAFT,
            ApprovalDocument.status == ApprovalStatus.COMPLETED,
            ApprovalDocument.deleted_at == None
        )
        payment_res = await db.execute(payment_query)
        payment_docs = payment_res.scalars().all()
    else:
        payment_docs = []

    for doc in payment_docs:
        content = doc.content or {}
        if content.get('draft_type') != 'PAYMENT':
            continue

        # [FIX] ?¬ì—…ë¶€ ?„í„°: ê¸°ì•ˆë¶€??dept)ê°€ ? íƒ??ê·¸ë£¹ëª…ê³¼ ?¼ì¹˜?˜ëŠ” ê±´ë§Œ ?¬í•¨
        if dept_filter_name:
            doc_dept = (content.get('dept') or '').strip()
            if doc_dept != dept_filter_name:
                continue

        # ê¸°ì•ˆ?¼ìž ?Œì‹± (??ª©ë³?ê±°ëž˜ëª…ì„¸??? ì§œ ?†ìœ¼ë©??´ë°±)
        request_date_str = content.get('request_date')
        try:
            fallback_date = _date.fromisoformat(request_date_str) if request_date_str else None
        except Exception:
            fallback_date = None
        if not fallback_date and doc.created_at:
            fallback_date = doc.created_at.date()

        # ê±°ëž˜ì²˜ëª…: content.partner_for_title ?°ì„  ?¬ìš©, ?†ìœ¼ë©?title?ì„œ ?Œì‹±
        partner_name = content.get('partner_for_title', '').strip()
        if not partner_name:
            import re as _re
            title = doc.title or ''
            m = _re.match(r'^\[(.+?)\]-', title)
            partner_name = m.group(1).strip() if m else title.strip()

        currency = content.get('currency', 'KRW')
        items = content.get('items', [])
        for item in items:
            amount = float(item.get('amount', 0) or 0)
            quantity = float(item.get('quantity', 0) or 0)
            if amount == 0 and quantity == 0:
                continue
            # ??ª©ë³?ê±°ëž˜ëª…ì„¸??? ì§œ ?°ì„ , ?†ìœ¼ë©?ê¸°ì•ˆ?¼ìž ?´ë°±
            trade_date_str = item.get('trade_date', '')
            try:
                item_date = _date.fromisoformat(trade_date_str) if trade_date_str else None
            except Exception:
                item_date = None
            effective_date = item_date or fallback_date
            if not effective_date:
                continue
            if effective_date.year != year or (month and effective_date.month != month):
                continue
            data.append({
                'category': 'PAYMENT',
                'partner_name': partner_name,
                'order_date': effective_date,
                'delivery_date': effective_date,
                'product_name': item.get('name', ''),
                'specification': item.get('spec', ''),
                'quantity': quantity,
                'unit_price': float(item.get('unit_price', 0) or 0),
                'total_price': amount,
                'currency': currency,
                'dept': (content.get('dept') or '').strip(),
            })

    return data

@router.get("/production")
async def get_settlement_production(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """4. ?ì‚°?´ì—­: ?ì‚°ê´€ë¦??ì‚°?„ë£Œ) ê¸°ì? - ?¤ì œ ?„ë£Œ??actual_completion_date) ê¸°ì?
       - ?„ë£Œ???†ëŠ” ê²½ìš° updated_at(ìµœê·¼?˜ì •?????´ë°±?¼ë¡œ ?¬ìš©
       - ?˜ì£¼?ì‚°: SalesOrder ??Partner(ê³ ê°??, SalesOrder.order_date(?˜ì£¼??
       - ?¬ê³ ?ì‚°: StockProduction ??Partner(ê³ ê°??, StockProduction.request_date(?”ì²­??
    """
    # StockProduction ?„ìš© Partner alias
    StockPartner = Partner.__table__.alias("stock_partner")

    # ?ì‚°?„ë£Œ???´ë°±: actual_completion_date ?†ìœ¼ë©?updated_at??? ì§œ ë¶€ë¶??¬ìš©
    effective_end_col = func.coalesce(
        ProductionPlan.actual_completion_date,
        func.date(ProductionPlan.updated_at)
    )

    query = select(
        ProductionPlan.id.label("plan_id"),
        Product.id.label("product_id"),
        func.coalesce(Partner.name, StockPartner.c.name).label("partner_name"),
        func.coalesce(SalesOrder.order_date, StockProduction.request_date).label("order_date"),
        effective_end_col.label("end_date"),
        Product.name.label("product_name"),
        Product.specification,
        func.max(ProductionPlanItem.quantity).label("quantity"),
        # ?˜ì£¼?©ê³„ê¸ˆì•¡: ?˜ì£¼?ˆëª©???˜ëŸ‰ Ã— ?¨ê? (?¬ê³ ?ì‚°?€ NULL)
        func.max(SalesOrderItem.quantity * SalesOrderItem.unit_price).label("order_amount"),
        func.sum(ProductionPlanItem.cost).label("process_cost")
    ).select_from(ProductionPlan)\
     .join(ProductionPlanItem, ProductionPlanItem.plan_id == ProductionPlan.id)\
     .outerjoin(SalesOrder, ProductionPlan.order_id == SalesOrder.id)\
     .outerjoin(Partner, SalesOrder.partner_id == Partner.id)\
     .outerjoin(SalesOrderItem, and_(
         SalesOrderItem.order_id == SalesOrder.id,
         SalesOrderItem.product_id == ProductionPlanItem.product_id
     ))\
     .outerjoin(StockProduction, ProductionPlan.stock_production_id == StockProduction.id)\
     .outerjoin(StockPartner, StockProduction.partner_id == StockPartner.c.id)\
     .join(Product, ProductionPlanItem.product_id == Product.id)\
     .where(
         ProductionPlan.status == ProductionStatus.COMPLETED,
         get_month_filter(effective_end_col, year, month)
     )\
     .group_by(
         ProductionPlan.id,
         Product.id,
         Partner.name,
         StockPartner.c.name,
         SalesOrder.order_date,
         StockProduction.request_date,
         ProductionPlan.actual_completion_date,
         ProductionPlan.updated_at,
         Product.name,
         Product.specification
     )

    if major_group_id:
        subq = select(ProductGroup.id).where(ProductGroup.parent_id == major_group_id)
        query = query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))

    result = await db.execute(query)
    return [dict(r._mapping) for r in result]


@router.get("/production/{plan_id}/processes")
async def get_production_plan_processes(
    plan_id: int,
    product_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """?ì‚°ê³„íš ê³µì •ë³?ê³µì •ë¹„ìš© ?ì„¸ ì¡°íšŒ (?”ë¸”?´ë¦­ ?ì—…??
    - product_id ?„ë‹¬ ???´ë‹¹ ?ˆëª©??ê³µì •ë§?ì¡°íšŒ (?¤í’ˆëª??˜ì£¼ ì§€??
    - completed_quantity??DB ì»¬ëŸ¼???„ë‹ˆë¯€ë¡?WorkLogItem.good_quantity ?©ê³„ë¡?ê³„ì‚°.
    """
    from app.models.production import WorkLogItem

    # ê³µì •ë³??‘ì—…?¤ì  ?©ê³„ ?œë¸Œì¿¼ë¦¬
    completed_subq = (
        select(
            WorkLogItem.plan_item_id,
            func.sum(WorkLogItem.good_quantity).label("completed_qty")
        )
        .group_by(WorkLogItem.plan_item_id)
        .subquery()
    )

    stmt = (
        select(
            ProductionPlanItem.process_name,
            ProductionPlanItem.course_type,
            ProductionPlanItem.status,
            ProductionPlanItem.quantity,
            ProductionPlanItem.cost,
            func.coalesce(completed_subq.c.completed_qty, 0).label("completed_quantity"),
        )
        .outerjoin(completed_subq, completed_subq.c.plan_item_id == ProductionPlanItem.id)
        .where(ProductionPlanItem.plan_id == plan_id)
        .order_by(ProductionPlanItem.sequence)
    )

    # ?ˆëª© ?„í„°: ?¤í’ˆëª??˜ì£¼?ì„œ ?´ë‹¹ ?ˆëª© ê³µì •ë§?ì¡°íšŒ
    if product_id is not None:
        stmt = stmt.where(ProductionPlanItem.product_id == product_id)

    result = await db.execute(stmt)

    rows = []
    for r in result:
        row = dict(r._mapping)
        # PURCHASE/OUTSOURCING ?„ë£Œ ê³µì •?€ ?˜ëŸ‰ = ?„ë£Œ?˜ëŸ‰?¼ë¡œ ì²˜ë¦¬
        if row.get("course_type") in ("PURCHASE", "OUTSOURCING") and str(row.get("status")) in ("COMPLETED", "ProductionStatus.COMPLETED"):
            row["completed_quantity"] = row["quantity"]
        rows.append(row)
    return rows

@router.get("/defects")
async def get_settlement_defects(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """5. ë¶ˆëŸ‰ë°œìƒ?´ì—­: ?ˆì§ˆê´€ë¦?ê¸°ì?"""
    query = select(
        QualityDefect.defect_date,
        ProductionPlanItem.process_name,
        Partner.name.label("partner_name"),
        Product.name.label("product_name"),
        Product.specification,
        QualityDefect.quantity,
        QualityDefect.amount,
        QualityDefect.resolution_date
    ).select_from(QualityDefect)\
     .join(SalesOrder, QualityDefect.order_id == SalesOrder.id)\
     .join(Partner, SalesOrder.partner_id == Partner.id)\
     .join(ProductionPlanItem, QualityDefect.plan_item_id == ProductionPlanItem.id)\
     .join(Product, ProductionPlanItem.product_id == Product.id)\
     .where(
         get_month_filter(QualityDefect.defect_date, year, month)
     )

    if major_group_id:
        subq = select(ProductGroup.id).where(ProductGroup.parent_id == major_group_id)
        query = query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))

    result = await db.execute(query)
    return [dict(r._mapping) for r in result]

@router.get("/complaints")
async def get_settlement_complaints(
    year: int = Query(...),
    month: Optional[int] = Query(None),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """6. ê³ ê°ë¶ˆë§Œ?‘ìˆ˜?´ì—­"""
    query = select(
        CustomerComplaint.receipt_date,
        Partner.name.label("partner_name"),
        CustomerComplaint.content,
        CustomerComplaint.status,
        CustomerComplaint.action_note
    ).select_from(CustomerComplaint)\
     .join(Partner, CustomerComplaint.partner_id == Partner.id)\
     .where(
         get_month_filter(CustomerComplaint.receipt_date, year, month)
     )

    # Note: Complaints link to Partner, but not necessarily to a Product Group directly 
    # unless we join via SalesOrder linked to the complaint.
    # For now, we'll keep it simple or follow the major_group_id IF present in linked order.
    
    if major_group_id:
        # If complaint has an order, filter by order's items' product group
        pass # Optional: Implementation depends on how strict the filter should be for complaints

    result = await db.execute(query)
    return [dict(r._mapping) for r in result]


# ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
# ì°¨íŠ¸ ?”ì•½: ?¬ì—…ë¶€ë³?ì§‘ê³„ + ê±°ëž˜ì²??œìœ„
# ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
@router.get("/chart-summary")
async def get_chart_summary(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    exchange_rate: float = Query(default=1350.0, description="USD?’KRW ?˜ìœ¨"),
    db: AsyncSession = Depends(get_db)
):
    """?¬ì—…ë¶€ë³??˜ì£¼/ë§¤ì¶œ/ë§¤ìž…/?ì‚°/ë¶ˆëŸ‰/ê³ ê°ë¶ˆë§Œ ì§‘ê³„ + ë§¤ì¶œì²˜Â·ë§¤?…ì²˜ Top10 (USD?’KRW ?˜ì‚° ?¬í•¨)"""

    MinorGrp = ProductGroup.__table__.alias("minor_grp")
    MajorGrp = ProductGroup.__table__.alias("major_grp")
    group_expr = func.coalesce(MajorGrp.c.name, MinorGrp.c.name, "ë¯¸ë¶„ë¥?)

    def pd(q, col):
        if year:  q = q.where(extract('year',  col) == year)
        if month: q = q.where(extract('month', col) == month)
        return q

    def with_grp(q):
        return (q
            .outerjoin(MinorGrp, Product.group_id == MinorGrp.c.id)
            .outerjoin(MajorGrp, MinorGrp.c.parent_id == MajorGrp.c.id)
        )

    def row2(res):
        return [{"name": r[0] or "ë¯¸ë¶„ë¥?, "value": float(r[1] or 0)}
                for r in res.fetchall()]

    # USD?’KRW ?˜ì‚° CASE ?œí˜„???ì„± ?¬í¼
    def krw_expr(amount_expr, currency_col):
        return case(
            (currency_col == 'USD', amount_expr * exchange_rate),
            else_=amount_expr
        )

    # ?˜ì£¼ (USD ?˜ì‚°)
    so_amount = SalesOrderItem.quantity * SalesOrderItem.unit_price
    r_orders = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(krw_expr(so_amount, SalesOrderItem.currency)).label("v"))
            .select_from(SalesOrderItem)
            .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)
            .join(Product,    SalesOrderItem.product_id == Product.id)
            .where(SalesOrder.status != OrderStatus.CANCELLED)
            .group_by(group_expr)
        ), SalesOrder.order_date
    ))

    # ë§¤ì¶œ (USD ?˜ì‚°) ???©í’ˆ?„ë£Œ/?„ë‚© ?˜ì£¼ [?˜ì •]
    # ë¶„í• ?©í’ˆ ??ê°??©í’ˆ ê±´ë³„ ?©í’ˆ??ë°??˜ëŸ‰???•í™•??ë°˜ì˜?˜ê¸° ?„í•´ DeliveryHistory ê¸°ì? ì§‘ê³„
    dhi_amount_full = DeliveryHistoryItem.quantity * SalesOrderItem.unit_price
    r_sales = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(krw_expr(dhi_amount_full, SalesOrderItem.currency)).label("v"))
            .select_from(DeliveryHistory)
            .join(DeliveryHistoryItem, DeliveryHistory.id == DeliveryHistoryItem.delivery_id)
            .join(SalesOrderItem, DeliveryHistoryItem.order_item_id == SalesOrderItem.id)
            .join(SalesOrder, DeliveryHistory.order_id == SalesOrder.id)
            .join(Product, SalesOrderItem.product_id == Product.id)
            .where(SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED]))
            .group_by(group_expr)
        ), DeliveryHistory.delivery_date
    ))

    # ë§¤ì¶œ ì¶”ê? ì§‘ê³„ ??ë¶€ë¶„ë‚©??ì¤?ê±°ëž˜ëª…ì„¸??ë°œí–‰ê±?(ë§¤ì¶œ?´ì—­ ??³¼ ?™ì¼ ê¸°ì?)
    dhi_amount = DeliveryHistoryItem.quantity * SalesOrderItem.unit_price
    r_sales_partial = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(krw_expr(dhi_amount, SalesOrderItem.currency)).label("v"))
            .select_from(DeliveryHistory)
            .join(DeliveryHistoryItem, DeliveryHistory.id == DeliveryHistoryItem.delivery_id)
            .join(SalesOrderItem, DeliveryHistoryItem.order_item_id == SalesOrderItem.id)
            .join(SalesOrder, DeliveryHistory.order_id == SalesOrder.id)
            .join(Product, SalesOrderItem.product_id == Product.id)
            .where(
                SalesOrder.status == OrderStatus.PARTIALLY_DELIVERED,
                DeliveryHistory.statement_json.isnot(None)
            )
            .group_by(group_expr)
        ), DeliveryHistory.delivery_date
    ))

    # ??ë§¤ì¶œ ?ŒìŠ¤ ?©ì‚°
    sales_map: dict = {}
    for r in r_sales.fetchall():
        key = r[0] or "ë¯¸ë¶„ë¥?
        sales_map[key] = sales_map.get(key, 0.0) + float(r[1] or 0)
    for r in r_sales_partial.fetchall():
        key = r[0] or "ë¯¸ë¶„ë¥?
        sales_map[key] = sales_map.get(key, 0.0) + float(r[1] or 0)
    sales_data = [{"name": k, "value": v} for k, v in sorted(sales_map.items(), key=lambda x: -x[1])]

    # ë§¤ìž… = êµ¬ë§¤ë°œì£¼(?ìž¬/MRP, ?Œëª¨???œì™¸) + ?¸ì£¼ë°œì£¼ (USD ?˜ì‚°)
    po_amount = PurchaseOrderItem.quantity * PurchaseOrderItem.unit_price
    r_pur_buy = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(krw_expr(po_amount, PurchaseOrderItem.currency)).label("v"))
            .select_from(PurchaseOrderItem)
            .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
            .join(Product,       PurchaseOrderItem.product_id == Product.id)
            .where(
                PurchaseOrder.status == PurchaseStatus.COMPLETED,
                PurchaseOrder.purchase_type != 'CONSUMABLE'  # ?Œëª¨?ˆì? ë³„ë„ ë²„í‚·?¼ë¡œ ë¶„ë¦¬
            )
            .group_by(group_expr)
        ), PurchaseOrder.actual_delivery_date
    ))
    # ?Œëª¨??PurchaseOrder ë³„ë„ ì§‘ê³„ ??"?Œëª¨?? ë²„í‚·
    r_pur_cons = await db.execute(pd(
        select(func.sum(krw_expr(po_amount, PurchaseOrderItem.currency)).label("v"))
        .select_from(PurchaseOrderItem)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .where(
            PurchaseOrder.status == PurchaseStatus.COMPLETED,
            PurchaseOrder.purchase_type == 'CONSUMABLE'
        ),
        PurchaseOrder.actual_delivery_date
    ))
    cons_po_total = float((r_pur_cons.scalar() or 0))

    oo_amount = OutsourcingOrderItem.unit_price * OutsourcingOrderItem.quantity
    r_pur_out = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(oo_amount).label("v"))   # ?¸ì£¼??currency ì»¬ëŸ¼ ?†ìŒ ??KRW ê·¸ë?ë¡?
            .select_from(OutsourcingOrderItem)
            .join(OutsourcingOrder, OutsourcingOrderItem.outsourcing_order_id == OutsourcingOrder.id)
            .outerjoin(Product, OutsourcingOrderItem.product_id == Product.id)
            .where(OutsourcingOrder.status == OutsourcingStatus.COMPLETED)
            .group_by(group_expr)
        ), OutsourcingOrder.actual_delivery_date
    ))
    # ???ŒìŠ¤ ?©ì‚° (ë¹„ì†Œëª¨í’ˆ)
    pur_map: dict = {}
    for r in r_pur_buy.fetchall():
        grp_key = r[0] or "ë¯¸ë¶„ë¥?
        pur_map[grp_key] = pur_map.get(grp_key, 0.0) + float(r[1] or 0)
    for r in r_pur_out.fetchall():
        grp_key = r[0] or "ë¯¸ë¶„ë¥?
        pur_map[grp_key] = pur_map.get(grp_key, 0.0) + float(r[1] or 0)
    # ?Œëª¨??ë°œì£¼ ?©ê³„ë¥?"?Œëª¨?? ë²„í‚·??ì¶”ê?
    if cons_po_total > 0:
        pur_map["?Œëª¨??] = pur_map.get("?Œëª¨??, 0.0) + cons_po_total

    # ?´ë?ê¸°ì•ˆ ?€ê¸ˆì?ê¸?ê±??˜ì§‘ (chart-summary??
    import re as _re_chart
    from datetime import date as _date_chart
    _pay_q = select(ApprovalDocument).where(
        ApprovalDocument.doc_type == DocumentType.INTERNAL_DRAFT,
        ApprovalDocument.status == ApprovalStatus.COMPLETED,
        ApprovalDocument.deleted_at == None
    )
    _pay_docs = (await db.execute(_pay_q)).scalars().all()
    _payment_rows = []  # (partner_name, amount_krw)
    for _doc in _pay_docs:
        _cnt = _doc.content or {}
        if _cnt.get('draft_type') != 'PAYMENT':
            continue
        _date_str = _cnt.get('request_date')
        try:
            _fallback_date = _date_chart.fromisoformat(_date_str) if _date_str else None
        except Exception:
            _fallback_date = None
        if not _fallback_date and _doc.created_at:
            _fallback_date = _doc.created_at.date()
        _pname = (_cnt.get('partner_for_title') or '').strip()
        if not _pname:
            _m = _re_chart.match(r'^\[(.+?)\]-', _doc.title or '')
            _pname = _m.group(1).strip() if _m else (_doc.title or 'ë¯¸ë¶„ë¥?)
        _cur = _cnt.get('currency', 'KRW')
        for _item in (_cnt.get('items') or []):
            _amt = float(_item.get('amount', 0) or 0)
            if _amt == 0:
                continue
            # ??ª©ë³?ê±°ëž˜ëª…ì„¸??? ì§œ ?°ì„ , ?†ìœ¼ë©?ê¸°ì•ˆ?¼ìž ?´ë°±
            _td_str = _item.get('trade_date', '')
            try:
                _item_date = _date_chart.fromisoformat(_td_str) if _td_str else None
            except Exception:
                _item_date = None
            _eff_date = _item_date or _fallback_date
            if not _eff_date:
                continue
            if year and _eff_date.year != year:
                continue
            if month and _eff_date.month != month:
                continue
            _amt_krw = _amt * exchange_rate if _cur == 'USD' else _amt
            _dept = (_cnt.get('dept') or '').strip() or 'ê¸°í?(?€ê¸ˆì?ê¸?'
            _payment_rows.append((_dept, _pname or 'ë¯¸ë¶„ë¥?, _amt_krw))

    # ?€ê¸ˆì?ê¸??©ê³„ë¥?ê¸°ì•ˆë¶€??ë¯¸ìž…?¥ì‹œ "ê¸°í?") ê·¸ë£¹?¼ë¡œ ì¶”ê?
    for _dept, _pname, _amt_krw in _payment_rows:
        pur_map[_dept] = pur_map.get(_dept, 0.0) + _amt_krw

    # ?Œëª¨??êµ¬ë§¤? ì²­??CONSUMABLES_PURCHASE) ?„ë£Œ ê²°ìž¬ ë¬¸ì„œ ??"?Œëª¨?? ë²„í‚·
    from datetime import date as _date_cons
    _cons_q = select(ApprovalDocument).where(
        ApprovalDocument.doc_type == DocumentType.CONSUMABLES_PURCHASE,
        ApprovalDocument.status == ApprovalStatus.COMPLETED,
        ApprovalDocument.deleted_at == None
    )
    _cons_docs = (await db.execute(_cons_q)).scalars().all()
    for _cdoc in _cons_docs:
        _ccnt = _cdoc.content or {}
        _c_date_str = _ccnt.get('request_date')
        try:
            _c_fallback = _date_cons.fromisoformat(_c_date_str) if _c_date_str else None
        except Exception:
            _c_fallback = None
        if not _c_fallback and _cdoc.created_at:
            _c_fallback = _cdoc.created_at.date()
        if not _c_fallback:
            continue
        if year and _c_fallback.year != year:
            continue
        if month and _c_fallback.month != month:
            continue
        # ConsumablesPurchaseForm?ëŠ” unit_priceê°€ ?†ìœ¼ë¯€ë¡?ê¸ˆì•¡ ì§‘ê³„??0 (ê±´ìˆ˜ ?Œì•…??
        # pur_map???Œëª¨??ë²„í‚·????ª© ?˜ë§Œ ?œì‹œ (ê¸ˆì•¡ ?†ìŒ ??ê±´ìˆ˜ * 1???„ì‹œ ì²˜ë¦¬ ?Šê³  ê·¸ëƒ¥ ?„ì )
        # ?¤ì œ ë°œì£¼ê°€ ?ì„±?˜ë©´ cons_po_total???¬í•¨?˜ë?ë¡?ì¤‘ë³µ ë°©ì?ë¥??„í•´ ?¬ê¸°?œëŠ” ?¬í•¨ ????
        pass  # ?Œëª¨??êµ¬ë§¤? ì²­?œëŠ” ê¸ˆì•¡ ?°ì´?°ê? ?†ì–´ chart ì§‘ê³„?ì„œ??PO ê¸°ì??¼ë¡œë§?ë°˜ì˜

    purchases_data = [{"name": k, "value": v} for k, v in sorted(pur_map.items(), key=lambda x: -x[1])]


    # ?ì‚° (?„ë£Œ???´ë°±)
    eff = func.coalesce(
        ProductionPlan.actual_completion_date,
        func.date(ProductionPlan.updated_at)
    )
    prod_q = with_grp(
        select(group_expr.label("g"),
               func.sum(ProductionPlanItem.cost).label("v"))
        .select_from(ProductionPlanItem)
        .join(ProductionPlan, ProductionPlanItem.plan_id == ProductionPlan.id)
        .join(Product,        ProductionPlanItem.product_id == Product.id)
        .where(ProductionPlan.status == ProductionStatus.COMPLETED)
        .group_by(group_expr)
    )
    if year:  prod_q = prod_q.where(extract('year',  eff) == year)
    if month: prod_q = prod_q.where(extract('month', eff) == month)
    r_prod = await db.execute(prod_q)

    # ë¶ˆëŸ‰
    r_defects = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(QualityDefect.amount).label("v"),
                   func.count(QualityDefect.id).label("cnt"))
            .select_from(QualityDefect)
            .join(ProductionPlanItem, QualityDefect.plan_item_id == ProductionPlanItem.id)
            .join(Product, ProductionPlanItem.product_id == Product.id)
            .group_by(group_expr)
        ), QualityDefect.defect_date
    ))

    # ê³ ê°ë¶ˆë§Œ
    r_complaints = await db.execute(pd(
        select(Partner.name.label("g"),
               func.count(CustomerComplaint.id).label("v"))
        .select_from(CustomerComplaint)
        .join(Partner, CustomerComplaint.partner_id == Partner.id)
        .group_by(Partner.name),
        CustomerComplaint.receipt_date
    ))

    # ë§¤ì¶œì²??œìœ„ Top10 (USD ?˜ì‚°)
    so_amount_rank = SalesOrderItem.quantity * SalesOrderItem.unit_price
    sal_sum = func.sum(krw_expr(so_amount_rank, SalesOrderItem.currency))
    r_sales_rank = await db.execute(pd(
        select(Partner.name.label("g"), sal_sum.label("v"))
        .select_from(SalesOrderItem)
        .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)
        .join(Partner,    SalesOrder.partner_id == Partner.id)
        .where(SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED]))
        .group_by(Partner.name)
        .order_by(sal_sum.desc())
        .limit(10),
        SalesOrder.actual_delivery_date
    ))

    # ë§¤ìž…ì²??œìœ„ Top10 = êµ¬ë§¤ë°œì£¼ + ?¸ì£¼ë°œì£¼ ?©ì‚° (USD ?˜ì‚°)
    po_amount_rank = PurchaseOrderItem.quantity * PurchaseOrderItem.unit_price
    pur_sum_b = func.sum(krw_expr(po_amount_rank, PurchaseOrderItem.currency))
    r_pur_rank_buy = await db.execute(pd(
        select(Partner.name.label("g"), pur_sum_b.label("v"))
        .select_from(PurchaseOrderItem)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .join(Partner,       PurchaseOrder.partner_id == Partner.id)
        .where(PurchaseOrder.status == PurchaseStatus.COMPLETED)
        .group_by(Partner.name)
        .order_by(pur_sum_b.desc()),
        PurchaseOrder.actual_delivery_date
    ))
    pur_sum_o = func.sum(OutsourcingOrderItem.unit_price * OutsourcingOrderItem.quantity)
    r_pur_rank_out = await db.execute(pd(
        select(Partner.name.label("g"), pur_sum_o.label("v"))
        .select_from(OutsourcingOrderItem)
        .join(OutsourcingOrder, OutsourcingOrderItem.outsourcing_order_id == OutsourcingOrder.id)
        .join(Partner,          OutsourcingOrder.partner_id == Partner.id)
        .where(OutsourcingOrder.status == OutsourcingStatus.COMPLETED)
        .group_by(Partner.name)
        .order_by(pur_sum_o.desc()),
        OutsourcingOrder.actual_delivery_date
    ))
    pur_rank_map: dict = {}
    for r in r_pur_rank_buy.fetchall():
        pur_rank_map[r[0] or "ë¯¸ë¶„ë¥?] = pur_rank_map.get(r[0] or "ë¯¸ë¶„ë¥?, 0.0) + float(r[1] or 0)
    for r in r_pur_rank_out.fetchall():
        pur_rank_map[r[0] or "ë¯¸ë¶„ë¥?] = pur_rank_map.get(r[0] or "ë¯¸ë¶„ë¥?, 0.0) + float(r[1] or 0)
    # ?€ê¸ˆì?ê¸?ê±?ê±°ëž˜ì²˜ë³„ ?œìœ„ ?©ì‚° (pur_rank_map?€ ê±°ëž˜ì²˜ëª… ê¸°ì?)
    for _dept, _pname, _amt_krw in _payment_rows:
        pur_rank_map[_pname] = pur_rank_map.get(_pname, 0.0) + _amt_krw
    purchase_ranking = [{"name": k, "value": v}
                        for k, v in sorted(pur_rank_map.items(), key=lambda x: -x[1])[:10]]


    return {
        "orders":           row2(r_orders),
        "sales":            sales_data,
        "purchases":        purchases_data,
        "production":       row2(r_prod),
        "defects":          [{"name": r[0] or "ë¯¸ë¶„ë¥?, "value": float(r[1] or 0), "count": int(r[2] or 0)}
                             for r in r_defects.fetchall()],
        "complaints":       row2(r_complaints),
        "sales_ranking":    row2(r_sales_rank),
        "purchase_ranking": purchase_ranking,
    }


# ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
# ?ˆëª©ë³??°ê°„ ?¤ì  (Annual Performance by Item)
# ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

@router.get("/available-years")
async def get_available_years(db: AsyncSession = Depends(get_db)):
    """?©í’ˆ ?¤ì ??ì¡´ìž¬?˜ëŠ” ëª¨ë“  ?°ë„ ì¡°íšŒ"""
    from app.models.sales import DeliveryHistory
    query = select(extract('year', DeliveryHistory.delivery_date).label("year"))\
           .distinct()\
           .order_by(extract('year', DeliveryHistory.delivery_date).desc())
    result = await db.execute(query)
    return [int(r[0]) for r in result if r[0] is not None]

@router.get("/annual-performance")
async def get_annual_performance(
    year: int = Query(...),
    major_group_id: Optional[int] = Query(None),
    exchange_rate: float = Query(default=1350.0),
    db: AsyncSession = Depends(get_db)
):
    """?ˆëª©ë³??°ê°„ ?¤ì : ê³ ê°?¬ë³„ -> ?œí’ˆë³?-> ?”ë³„(1~12) ì§‘ê³„"""
    from app.models.sales import DeliveryHistory, DeliveryHistoryItem, SalesOrderItem, SalesOrder
    
    # CASE expression for currency conversion
    amount_expr = SalesOrderItem.quantity * SalesOrderItem.unit_price # Base item unit price
    # But we need to use the quantity FROM delivery_history_item
    item_amount = DeliveryHistoryItem.quantity * SalesOrderItem.unit_price
    
    krw_amount = case(
        (SalesOrderItem.currency == 'USD', item_amount * exchange_rate),
        else_=item_amount
    )

    query = select(
        Partner.name.label("partner_name"),
        Product.id.label("product_id"),
        Product.name.label("product_name"),
        Product.specification.label("specification"),
        extract('month', DeliveryHistory.delivery_date).label("month"),
        func.sum(DeliveryHistoryItem.quantity).label("total_qty"),
        func.sum(krw_amount).label("total_amount")
    ).select_from(DeliveryHistoryItem)\
     .join(DeliveryHistory, DeliveryHistoryItem.delivery_id == DeliveryHistory.id)\
     .join(SalesOrderItem, DeliveryHistoryItem.order_item_id == SalesOrderItem.id)\
     .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)\
     .join(Partner, SalesOrder.partner_id == Partner.id)\
     .join(Product, SalesOrderItem.product_id == Product.id)\
     .where(
         extract('year', DeliveryHistory.delivery_date) == year
     )\
     .group_by(
         Partner.name,
         Product.id,
         Product.name,
         Product.specification,
         extract('month', DeliveryHistory.delivery_date)
     )

    if major_group_id:
        subq = select(ProductGroup.id).where(and_(ProductGroup.parent_id == major_group_id))
        query = query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))

    result = await db.execute(query)
    rows = [dict(r._mapping) for r in result]

    # Post-process into the nested structure requested by frontend
    # customers -> products -> monthly_data[12]
    structured = {}
    for r in rows:
        p_name = r["partner_name"]
        pid = r["product_id"]
        month = int(r["month"]) # 1-12
        
        if p_name not in structured:
            structured[p_name] = {"partner_name": p_name, "products": {}}
        
        if pid not in structured[p_name]["products"]:
            structured[p_name]["products"][pid] = {
                "product_id": pid,
                "product_name": r["product_name"],
                "specification": r["specification"],
                "monthly_qty": [0] * 12,
                "monthly_amount": [0] * 12,
                "annual_qty": 0,
                "annual_amount": 0
            }
        
        target = structured[p_name]["products"][pid]
        idx = month - 1
        qty = r["total_qty"] or 0
        amt = r["total_amount"] or 0
        
        target["monthly_qty"][idx] = qty
        target["monthly_amount"][idx] = amt
        target["annual_qty"] += qty
        target["annual_amount"] += amt

    # Convert maps to sorted lists
    final_list = []
    overall_total_qty = 0
    overall_total_amount = 0

    for p_name in sorted(structured.keys()):
        cust_data = structured[p_name]
        cust_products = []
        cust_total_qty = 0
        cust_total_amount = 0
        
        for pid in sorted(cust_data["products"].keys()):
            prod = cust_data["products"][pid]
            cust_products.append(prod)
            cust_total_qty += prod["annual_qty"]
            cust_total_amount += prod["annual_amount"]
        
        cust_data["products"] = cust_products
        cust_data["customer_total_qty"] = cust_total_qty
        cust_data["customer_total_amount"] = cust_total_amount
        
        overall_total_qty += cust_total_qty
        overall_total_amount += cust_total_amount
        final_list.append(cust_data)

    return {
        "overall_total_qty": overall_total_qty,
        "overall_total_amount": overall_total_amount,
        "data": final_list
    }
