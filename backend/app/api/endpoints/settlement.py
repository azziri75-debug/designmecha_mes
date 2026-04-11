from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, extract, and_, String
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

    if major_group_id:
        subq = select(ProductGroup.id).where(ProductGroup.parent_id == major_group_id)
        # For p_query, filter by product group
        p_query = p_query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))
        # For o_query, often outsourcing is for a produced product, so filter by that
        o_query = o_query.where(and_(Product.group_id.in_(subq) | (Product.group_id == major_group_id)))

    res_p = await db.execute(p_query)
    res_o = await db.execute(o_query)
    
    data.extend([dict(r._mapping) for r in res_p])
    data.extend([dict(r._mapping) for r in res_o])
    
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
    db: AsyncSession = Depends(get_db)
):
    """사업부별 수주/매출/매입/생산/불량/고객불만 집계 + 매출처·매입처 Top10"""

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

    # 수주
    r_orders = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(SalesOrderItem.quantity * SalesOrderItem.unit_price).label("v"))
            .select_from(SalesOrderItem)
            .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)
            .join(Product,    SalesOrderItem.product_id == Product.id)
            .where(SalesOrder.status != OrderStatus.CANCELLED)
            .group_by(group_expr)
        ), SalesOrder.order_date
    ))

    # 매출
    r_sales = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(SalesOrderItem.quantity * SalesOrderItem.unit_price).label("v"))
            .select_from(SalesOrderItem)
            .join(SalesOrder, SalesOrderItem.order_id == SalesOrder.id)
            .join(Product,    SalesOrderItem.product_id == Product.id)
            .where(SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED]))
            .group_by(group_expr)
        ), SalesOrder.actual_delivery_date
    ))

    # 매입
    r_purchases = await db.execute(pd(
        with_grp(
            select(group_expr.label("g"),
                   func.sum(PurchaseOrderItem.quantity * PurchaseOrderItem.unit_price).label("v"))
            .select_from(PurchaseOrderItem)
            .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
            .join(Product,       PurchaseOrderItem.product_id == Product.id)
            .where(PurchaseOrder.status == PurchaseStatus.COMPLETED)
            .group_by(group_expr)
        ), PurchaseOrder.actual_delivery_date
    ))

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

    # 매출처 순위 Top10
    sal_sum = func.sum(SalesOrderItem.quantity * SalesOrderItem.unit_price)
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

    # 매입처 순위 Top10
    pur_sum = func.sum(PurchaseOrderItem.quantity * PurchaseOrderItem.unit_price)
    r_purchase_rank = await db.execute(pd(
        select(Partner.name.label("g"), pur_sum.label("v"))
        .select_from(PurchaseOrderItem)
        .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .join(Partner,       PurchaseOrder.partner_id == Partner.id)
        .where(PurchaseOrder.status == PurchaseStatus.COMPLETED)
        .group_by(Partner.name)
        .order_by(pur_sum.desc())
        .limit(10),
        PurchaseOrder.actual_delivery_date
    ))

    return {
        "orders":           row2(r_orders),
        "sales":            row2(r_sales),
        "purchases":        row2(r_purchases),
        "production":       row2(r_prod),
        "defects":          [{"name": r[0] or "미분류", "value": float(r[1] or 0), "count": int(r[2] or 0)}
                             for r in r_defects.fetchall()],
        "complaints":       row2(r_complaints),
        "sales_ranking":    row2(r_sales_rank),
        "purchase_ranking": row2(r_purchase_rank),
    }
