from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, extract, and_, String, case
from typing import List, Optional, Dict, Any
from datetime import date

from app.api.deps import get_db
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, OutsourcingOrder, OutsourcingOrderItem, PurchaseStatus, OutsourcingStatus
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.quality import QualityDefect, CustomerComplaint, DefectStatus
from app.models.product import Product, ProductGroup
from app.models.basics import Partner
from app.models.inventory import StockProduction
from app.models.approval import ApprovalDocument, ApprovalStatus, DocumentType

router = APIRouter()


def get_month_filter(model_attr, year: int, month: int):
    return and_(
        extract('year', model_attr) == year,
        extract('month', model_attr) == month
    )

@router.get("/orders")
async def get_settlement_orders(
    year: int = Query(...),
    month: int = Query(...),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """1. 수주내역: 수주목록(확정상태) 기준"""
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
    month: int = Query(...),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """2. 매출내역: 납품관리(납품완료) 기준"""
    # Focusing on delivery_completed orders
    query = select(
        Partner.name.label("partner_name"),
        SalesOrder.order_date,
        SalesOrder.actual_delivery_date.label("delivery_date"),
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
         SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED]),
         get_month_filter(SalesOrder.actual_delivery_date, year, month)
     )

    if major_group_id:
        subq = select(ProductGroup.id).where(ProductGroup.parent_id == major_group_id)
        query = query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))

    result = await db.execute(query)
    return [dict(r._mapping) for r in result]

@router.get("/purchases")
async def get_settlement_purchases(
    year: int = Query(...),
    month: int = Query(...),
    major_group_id: Optional[int] = Query(None),
    dept: Optional[str] = Query(None),  # 특수 필터: "소모품" 전달 시 소모품만 조회
    db: AsyncSession = Depends(get_db)
):
    """3. 매입내역: 구매발주서 + 외주발주서 기준 (실제 입고일 기준)"""
    data = []
    
    # Material/Consumable Purchases - 실제 입고일(actual_delivery_date) 기준
    p_query = select(
        PurchaseOrder.purchase_type.label("category"),
        Partner.name.label("partner_name"),
        PurchaseOrder.order_date,
        PurchaseOrder.actual_delivery_date.label("delivery_date"),
        Product.name.label("product_name"),
        Product.specification,
        PurchaseOrderItem.quantity,
        PurchaseOrderItem.unit_price,
        (PurchaseOrderItem.quantity * PurchaseOrderItem.unit_price).label("total_price")
    ).select_from(PurchaseOrder)\
     .join(PurchaseOrderItem, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)\
     .join(Partner, PurchaseOrder.partner_id == Partner.id)\
     .join(Product, PurchaseOrderItem.product_id == Product.id)\
     .where(
         PurchaseOrder.status == PurchaseStatus.COMPLETED,
         PurchaseOrder.actual_delivery_date != None,
         get_month_filter(PurchaseOrder.actual_delivery_date, year, month)
     )
    
    # Outsourcing Purchases - 실제 납품일(actual_delivery_date) 기준
    o_query = select(
        func.cast("OUTSOURCING", String).label("category"),
        Partner.name.label("partner_name"),
        OutsourcingOrder.order_date,
        OutsourcingOrder.actual_delivery_date.label("delivery_date"),
        Product.name.label("product_name"),
        Product.specification,
        OutsourcingOrderItem.quantity,
        OutsourcingOrderItem.unit_price,
        (OutsourcingOrderItem.quantity * OutsourcingOrderItem.unit_price).label("total_price")
    ).select_from(OutsourcingOrder)\
     .join(OutsourcingOrderItem, OutsourcingOrder.id == OutsourcingOrderItem.outsourcing_order_id)\
     .join(Partner, OutsourcingOrder.partner_id == Partner.id)\
     .outerjoin(Product, OutsourcingOrderItem.product_id == Product.id)\
     .where(
         OutsourcingOrder.status == OutsourcingStatus.COMPLETED,
         OutsourcingOrder.actual_delivery_date != None,
         get_month_filter(OutsourcingOrder.actual_delivery_date, year, month)
     )

    # 소모품 필터: dept='소모품' 이거나 major_group_id 없이 소모품 전용 조회인 경우
    is_consumable_filter = (dept == '소모품')

    if is_consumable_filter:
        # 소모품만 조회: p_query는 purchase_type=CONSUMABLE만, o_query는 제외
        p_query = p_query.where(PurchaseOrder.purchase_type == 'CONSUMABLE')
        res_p = await db.execute(p_query)
        data.extend([dict(r._mapping) for r in res_p])
    else:
        if major_group_id:
            subq = select(ProductGroup.id).where(ProductGroup.parent_id == major_group_id)
            # 소모품(CONSUMABLE) 발주는 product group 대신 별도 분류이므로 제품그룹 필터에서 제외
            p_query = p_query.where(
                PurchaseOrder.purchase_type != 'CONSUMABLE',
                and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id))
            )
            o_query = o_query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))
        else:
            # 전체 조회: 소모품 PurchaseOrder는 product group 무관하게 포함
            pass

        res_p = await db.execute(p_query)
        res_o = await db.execute(o_query)
        data.extend([dict(r._mapping) for r in res_p])
        data.extend([dict(r._mapping) for r in res_o])

    # --- 내부기안 대금지급 건 추가 집계 ---
    import re as _re
    from datetime import date as _date

    # major_group_id가 선택된 경우 해당 그룹의 이름을 조회하여 기안부서 필터로 사용
    dept_filter_name: Optional[str] = None
    if dept and dept != '소모품':
        dept_filter_name = dept
    elif major_group_id:
        grp_res = await db.execute(
            select(ProductGroup.name).where(ProductGroup.id == major_group_id)
        )
        grp_row = grp_res.first()
        if grp_row:
            dept_filter_name = grp_row[0]

    # 소모품 필터가 아닐 때만 대금지급기안 집계
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

        # [FIX] 사업부 필터: 기안부서(dept)가 선택된 그룹명과 일치하는 건만 포함
        if dept_filter_name:
            doc_dept = (content.get('dept') or '').strip()
            if doc_dept != dept_filter_name:
                continue

        # 기안일자 파싱 (항목별 거래명세서 날짜 없으면 폴백)
        request_date_str = content.get('request_date')
        try:
            fallback_date = _date.fromisoformat(request_date_str) if request_date_str else None
        except Exception:
            fallback_date = None
        if not fallback_date and doc.created_at:
            fallback_date = doc.created_at.date()

        # 거래처명: content.partner_for_title 우선 사용, 없으면 title에서 파싱
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
            # 항목별 거래명세서 날짜 우선, 없으면 기안일자 폴백
            trade_date_str = item.get('trade_date', '')
            try:
                item_date = _date.fromisoformat(trade_date_str) if trade_date_str else None
            except Exception:
                item_date = None
            effective_date = item_date or fallback_date
            if not effective_date:
                continue
            if effective_date.year != year or effective_date.month != month:
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
    month: int = Query(...),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """4. 생산내역: 생산관리(생산완료) 기준 - 실제 완료일(actual_completion_date) 기준
       - 완료일 없는 경우 updated_at(최근수정일)을 폴백으로 사용
       - 수주생산: SalesOrder → Partner(고객사), SalesOrder.order_date(수주일)
       - 재고생산: StockProduction → Partner(고객사), StockProduction.request_date(요청일)
    """
    # StockProduction 전용 Partner alias
    StockPartner = Partner.__table__.alias("stock_partner")

    # 생산완료일 폴백: actual_completion_date 없으면 updated_at의 날짜 부분 사용
    effective_end_col = func.coalesce(
        ProductionPlan.actual_completion_date,
        func.date(ProductionPlan.updated_at)
    )

    query = select(
        # 업체명: 수주생산이면 수주처, 재고생산이면 재고요청 고객사
        func.coalesce(
            Partner.name,
            StockPartner.c.name
        ).label("partner_name"),
        # 수주일: 수주생산이면 수주일, 재고생산이면 재고생산 요청일
        func.coalesce(
            SalesOrder.order_date,
            StockProduction.request_date
        ).label("order_date"),
        # 생산완료일: 없으면 최근수정일(updated_at)로 대체
        effective_end_col.label("end_date"),
        Product.name.label("product_name"),
        Product.specification,
        func.max(ProductionPlanItem.quantity).label("quantity"),
        func.sum(ProductionPlanItem.cost).label("process_cost")
    ).select_from(ProductionPlan)\
     .join(ProductionPlanItem, ProductionPlanItem.plan_id == ProductionPlan.id)\
     .outerjoin(SalesOrder, ProductionPlan.order_id == SalesOrder.id)\
     .outerjoin(Partner, SalesOrder.partner_id == Partner.id)\
     .outerjoin(StockProduction, ProductionPlan.stock_production_id == StockProduction.id)\
     .outerjoin(StockPartner, StockProduction.partner_id == StockPartner.c.id)\
     .join(Product, ProductionPlanItem.product_id == Product.id)\
     .where(
         ProductionPlan.status == ProductionStatus.COMPLETED,
         # 완료일 OR 최근수정일 중 하나가 해당 월에 속하면 포함
         get_month_filter(effective_end_col, year, month)
     )\
     .group_by(
         ProductionPlan.id,
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

@router.get("/defects")
async def get_settlement_defects(
    year: int = Query(...),
    month: int = Query(...),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """5. 불량발생내역: 품질관리 기준"""
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
    month: int = Query(...),
    major_group_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """6. 고객불만접수내역"""
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


# ─────────────────────────────────────────────────────────────────────────────
# 차트 요약: 사업부별 집계 + 거래처 순위
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/chart-summary")
async def get_chart_summary(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    exchange_rate: float = Query(default=1350.0, description="USD→KRW 환율"),
    db: AsyncSession = Depends(get_db)
):
    """사업부별 수주/매출/매입/생산/불량/고객불만 집계 + 매출처·매입처 Top10 (USD→KRW 환산 포함)"""

    MinorGrp = ProductGroup.__table__.alias("minor_grp")
    MajorGrp = ProductGroup.__table__.alias("major_grp")
    group_expr = func.coalesce(MajorGrp.c.name, MinorGrp.c.name, "미분류")

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
        return [{"name": r[0] or "미분류", "value": float(r[1] or 0)}
                for r in res.fetchall()]

    # USD→KRW 환산 CASE 표현식 생성 헬퍼
    def krw_expr(amount_expr, currency_col):
        return case(
            (currency_col == 'USD', amount_expr * exchange_rate),
            else_=amount_expr
        )

    # 수주 (USD 환산)
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

    # 매출 (USD 환산)
    r_sales = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(krw_expr(so_amount, SalesOrderItem.currency)).label("v"))
            .select_from(SalesOrderItem)
            .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)
            .join(Product,    SalesOrderItem.product_id == Product.id)
            .where(SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED]))
            .group_by(group_expr)
        ), SalesOrder.actual_delivery_date
    ))

    # 매입 = 구매발주(자재/MRP, 소모품 제외) + 외주발주 (USD 환산)
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
                PurchaseOrder.purchase_type != 'CONSUMABLE'  # 소모품은 별도 버킷으로 분리
            )
            .group_by(group_expr)
        ), PurchaseOrder.actual_delivery_date
    ))
    # 소모품 PurchaseOrder 별도 집계 → "소모품" 버킷
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
                   func.sum(oo_amount).label("v"))   # 외주는 currency 컬럼 없음 → KRW 그대로
            .select_from(OutsourcingOrderItem)
            .join(OutsourcingOrder, OutsourcingOrderItem.outsourcing_order_id == OutsourcingOrder.id)
            .outerjoin(Product, OutsourcingOrderItem.product_id == Product.id)
            .where(OutsourcingOrder.status == OutsourcingStatus.COMPLETED)
            .group_by(group_expr)
        ), OutsourcingOrder.actual_delivery_date
    ))
    # 두 소스 합산 (비소모품)
    pur_map: dict = {}
    for r in r_pur_buy.fetchall():
        grp_key = r[0] or "미분류"
        pur_map[grp_key] = pur_map.get(grp_key, 0.0) + float(r[1] or 0)
    for r in r_pur_out.fetchall():
        grp_key = r[0] or "미분류"
        pur_map[grp_key] = pur_map.get(grp_key, 0.0) + float(r[1] or 0)
    # 소모품 발주 합계를 "소모품" 버킷에 추가
    if cons_po_total > 0:
        pur_map["소모품"] = pur_map.get("소모품", 0.0) + cons_po_total

    # 내부기안 대금지급 건 수집 (chart-summary용)
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
            _pname = _m.group(1).strip() if _m else (_doc.title or '미분류')
        _cur = _cnt.get('currency', 'KRW')
        for _item in (_cnt.get('items') or []):
            _amt = float(_item.get('amount', 0) or 0)
            if _amt == 0:
                continue
            # 항목별 거래명세서 날짜 우선, 없으면 기안일자 폴백
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
            _dept = (_cnt.get('dept') or '').strip() or '기타(대금지급)'
            _payment_rows.append((_dept, _pname or '미분류', _amt_krw))

    # 대금지급 합계를 기안부서(미입력시 "기타") 그룹으로 추가
    for _dept, _pname, _amt_krw in _payment_rows:
        pur_map[_dept] = pur_map.get(_dept, 0.0) + _amt_krw

    # 소모품 구매신청서(CONSUMABLES_PURCHASE) 완료 결재 문서 → "소모품" 버킷
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
        # ConsumablesPurchaseForm에는 unit_price가 없으므로 금액 집계는 0 (건수 파악용)
        # pur_map의 소모품 버킷에 항목 수만 표시 (금액 없음 → 건수 * 1원 임시 처리 않고 그냥 누적)
        # 실제 발주가 생성되면 cons_po_total에 포함되므로 중복 방지를 위해 여기서는 포함 안 함
        pass  # 소모품 구매신청서는 금액 데이터가 없어 chart 집계에서는 PO 기준으로만 반영

    purchases_data = [{"name": k, "value": v} for k, v in sorted(pur_map.items(), key=lambda x: -x[1])]


    # 생산 (완료일 폴백)
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

    # 불량
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

    # 고객불만
    r_complaints = await db.execute(pd(
        select(Partner.name.label("g"),
               func.count(CustomerComplaint.id).label("v"))
        .select_from(CustomerComplaint)
        .join(Partner, CustomerComplaint.partner_id == Partner.id)
        .group_by(Partner.name),
        CustomerComplaint.receipt_date
    ))

    # 매출처 순위 Top10 (USD 환산)
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

    # 매입처 순위 Top10 = 구매발주 + 외주발주 합산 (USD 환산)
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
        pur_rank_map[r[0] or "미분류"] = pur_rank_map.get(r[0] or "미분류", 0.0) + float(r[1] or 0)
    for r in r_pur_rank_out.fetchall():
        pur_rank_map[r[0] or "미분류"] = pur_rank_map.get(r[0] or "미분류", 0.0) + float(r[1] or 0)
    # 대금지급 건 거래처별 순위 합산 (pur_rank_map은 거래처명 기준)
    for _dept, _pname, _amt_krw in _payment_rows:
        pur_rank_map[_pname] = pur_rank_map.get(_pname, 0.0) + _amt_krw
    purchase_ranking = [{"name": k, "value": v}
                        for k, v in sorted(pur_rank_map.items(), key=lambda x: -x[1])[:10]]


    return {
        "orders":           row2(r_orders),
        "sales":            row2(r_sales),
        "purchases":        purchases_data,
        "production":       row2(r_prod),
        "defects":          [{"name": r[0] or "미분류", "value": float(r[1] or 0), "count": int(r[2] or 0)}
                             for r in r_defects.fetchall()],
        "complaints":       row2(r_complaints),
        "sales_ranking":    row2(r_sales_rank),
        "purchase_ranking": purchase_ranking,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 품목별 연간 실적 (Annual Performance by Item)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/available-years")
async def get_available_years(db: AsyncSession = Depends(get_db)):
    """납품 실적이 존재하는 모든 연도 조회"""
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
    """품목별 연간 실적: 고객사별 -> 제품별 -> 월별(1~12) 집계"""
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
