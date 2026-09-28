"""
DB Export API
현재 MES DB 데이터를 Excel/CSV로 다운로드하는 엔드포인트
Access DB 구조와 대응되는 테이블별 내보내기 지원
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload
from typing import Optional
from datetime import date
import io
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.api.deps import get_db
from app.core.timezone import now_kst

router = APIRouter()

# ── 스타일 헬퍼 ──────────────────────────────────────────────────────────────
HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
ALT_FILL    = PatternFill("solid", fgColor="0D1B2A")
ALT2_FILL   = PatternFill("solid", fgColor="111827")
THIN_BORDER = Border(
    left   = Side(style="thin", color="374151"),
    right  = Side(style="thin", color="374151"),
    top    = Side(style="thin", color="374151"),
    bottom = Side(style="thin", color="374151"),
)
H_FONT   = Font(color="FFFFFF", bold=True, name="맑은 고딕", size=9)
V_FONT   = Font(color="D1D5DB", name="맑은 고딕", size=9)
C_ALIGN  = Alignment(horizontal="center", vertical="center")
L_ALIGN  = Alignment(horizontal="left",   vertical="center")
R_ALIGN  = Alignment(horizontal="right",  vertical="center")


def _apply_sheet(ws, headers: list, rows: list, col_widths: list | None = None):
    """헤더 + 데이터 행을 시트에 적용"""
    # 헤더
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font   = H_FONT
        cell.fill   = HEADER_FILL
        cell.alignment = C_ALIGN
        cell.border = THIN_BORDER
    ws.row_dimensions[1].height = 18

    # 데이터
    for r, row_vals in enumerate(rows, 2):
        fill = ALT_FILL if r % 2 == 0 else ALT2_FILL
        for c, val in enumerate(row_vals, 1):
            cell = ws.cell(row=r, column=c, value=val)
            cell.font      = V_FONT
            cell.fill      = fill
            cell.border    = THIN_BORDER
            cell.alignment = L_ALIGN
        ws.row_dimensions[r].height = 16

    # 컬럼 너비
    if col_widths:
        for i, w in enumerate(col_widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
    else:
        for i in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(i)].width = 18

    ws.sheet_view.showGridLines = False


def _stream_xlsx(wb: openpyxl.Workbook, filename: str) -> StreamingResponse:
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    safe = filename.replace(" ", "_")
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe}"}
    )


def _stream_csv(df: pd.DataFrame, filename: str) -> StreamingResponse:
    stream = io.StringIO()
    df.to_csv(stream, index=False, encoding="utf-8-sig")
    stream.seek(0)
    safe = filename.replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(stream.getvalue().encode("utf-8-sig")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe}"}
    )


def _fmt_date(d) -> str:
    if d is None: return ""
    try: return d.strftime("%Y-%m-%d")
    except: return str(d)


def _fmt_num(v) -> float | str:
    if v is None: return ""
    try: return float(v)
    except: return str(v)


# ── 개별 테이블 내보내기 ─────────────────────────────────────────────────────

@router.get("/export/partners")
async def export_partners(
    fmt: str = Query("xlsx", description="xlsx 또는 csv"),
    db: AsyncSession = Depends(get_db)
):
    """거래처 목록 (Customer_table 대응)"""
    from app.models.basics import Partner, Contact
    result = await db.execute(
        select(Partner).options(selectinload(Partner.contacts))
    )
    partners = result.unique().scalars().all()

    headers = ["거래처명", "구분", "사업자번호", "대표자", "주소", "전화", "이메일", "비고",
               "담당자명", "담당자직위", "담당자전화", "담당자휴대폰"]
    col_widths = [22, 12, 16, 12, 28, 14, 22, 18, 12, 12, 14, 14]

    rows = []
    for p in partners:
        type_map = {"CUSTOMER": "매출처", "SUPPLIER": "매입처", "SUBCONTRACTOR": "외주처"}
        types = "/".join(type_map.get(t, t) for t in (p.partner_type or []))
        if p.contacts:
            for c in p.contacts:
                rows.append([
                    p.name, types, p.registration_number or "", p.representative or "",
                    p.address or "", p.phone or "", p.email or "", p.description or "",
                    c.name or "", c.position or "", c.phone or "", c.mobile or ""
                ])
        else:
            rows.append([
                p.name, types, p.registration_number or "", p.representative or "",
                p.address or "", p.phone or "", p.email or "", p.description or "",
                "", "", "", ""
            ])

    today = now_kst().strftime("%Y%m%d")
    if fmt == "csv":
        df = pd.DataFrame(rows, columns=headers)
        return _stream_csv(df, f"거래처_{today}.csv")

    wb = openpyxl.Workbook(); wb.remove(wb.active)
    ws = wb.create_sheet("거래처")
    _apply_sheet(ws, headers, rows, col_widths)
    return _stream_xlsx(wb, f"거래처_{today}.xlsx")


@router.get("/export/products")
async def export_products(
    item_type: str = Query("PRODUCED", description="PRODUCED / PART / CONSUMABLE / ALL"),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """제품/부품 목록 (Product_table 대응)"""
    from app.models.product import Product, ProductProcess, BOM
    from sqlalchemy import or_

    query = select(Product).options(
        selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        joinedload(Product.partner)
    )
    if item_type != "ALL":
        if "," in item_type:
            types = [t.strip() for t in item_type.split(",")]
            query = query.where(Product.item_type.in_(types))
        else:
            query = query.where(Product.item_type == item_type)

    result = await db.execute(query)
    products = result.unique().scalars().all()

    type_labels = {"PRODUCED": "생산제품", "PART": "부품", "CONSUMABLE": "소모품"}
    headers = ["유형", "품명", "규격", "재질", "단위", "거래처", "최근단가", "공정수", "비고"]
    col_widths = [10, 28, 20, 12, 8, 20, 12, 8, 22]

    rows = []
    for p in products:
        rows.append([
            type_labels.get(p.item_type, p.item_type),
            p.name or "",
            p.specification or "",
            p.material or "",
            p.unit or "EA",
            p.partner.name if p.partner else "",
            _fmt_num(p.recent_price),
            len(p.standard_processes) if p.standard_processes else 0,
            p.note or ""
        ])

    today = now_kst().strftime("%Y%m%d")
    label = type_labels.get(item_type, "제품")
    if fmt == "csv":
        df = pd.DataFrame(rows, columns=headers)
        return _stream_csv(df, f"{label}_{today}.csv")

    wb = openpyxl.Workbook(); wb.remove(wb.active)
    ws = wb.create_sheet(label)
    _apply_sheet(ws, headers, rows, col_widths)
    return _stream_xlsx(wb, f"{label}_{today}.xlsx")


@router.get("/export/sales-orders")
async def export_sales_orders(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """수주 이력 (Order_table 대응)"""
    from app.models.sales import SalesOrder, SalesOrderItem
    from sqlalchemy import and_

    query = select(SalesOrder).options(
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
        joinedload(SalesOrder.partner)
    )
    conditions = []
    if start_date: conditions.append(SalesOrder.order_date >= start_date)
    if end_date:   conditions.append(SalesOrder.order_date <= end_date)
    if conditions: query = query.where(and_(*conditions))
    query = query.order_by(SalesOrder.order_date.desc())

    result = await db.execute(query)
    orders = result.unique().scalars().all()

    status_map = {
        "PENDING": "대기", "CONFIRMED": "확정", "PRODUCTION_COMPLETED": "생산완료",
        "PARTIALLY_DELIVERED": "부분납품", "DELIVERED": "납품완료",
        "DELIVERY_COMPLETED": "납품완료", "CANCELLED": "취소"
    }

    headers = ["수주번호", "수주일자", "거래처명", "제품명", "규격", "단위",
               "수량", "납품수량", "단가", "금액", "요구납기일", "납품일", "상태", "비고"]
    col_widths = [18, 12, 20, 28, 16, 8, 8, 8, 12, 14, 12, 12, 10, 22]

    rows = []
    for o in orders:
        partner_name = o.partner.name if o.partner else ""
        for item in (o.items or []):
            product = item.product
            rows.append([
                o.order_no or "",
                _fmt_date(o.order_date),
                partner_name,
                product.name if product else (item.product_name or ""),
                product.specification if product else "",
                product.unit if product else "",
                item.quantity or 0,
                item.delivered_quantity or 0,
                _fmt_num(item.unit_price),
                _fmt_num((item.quantity or 0) * (item.unit_price or 0)),
                _fmt_date(o.delivery_date),
                _fmt_date(o.actual_delivery_date),
                status_map.get(o.status.value if hasattr(o.status, 'value') else str(o.status), str(o.status)),
                o.note or ""
            ])

    today = now_kst().strftime("%Y%m%d")
    if fmt == "csv":
        df = pd.DataFrame(rows, columns=headers)
        return _stream_csv(df, f"수주이력_{today}.csv")

    wb = openpyxl.Workbook(); wb.remove(wb.active)
    ws = wb.create_sheet("수주이력")
    _apply_sheet(ws, headers, rows, col_widths)
    return _stream_xlsx(wb, f"수주이력_{today}.xlsx")


@router.get("/export/estimates")
async def export_estimates(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """견적 이력"""
    from app.models.sales import Estimate, EstimateItem
    from sqlalchemy import and_

    query = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product),
        joinedload(Estimate.partner)
    )
    conditions = []
    if start_date: conditions.append(Estimate.estimate_date >= start_date)
    if end_date:   conditions.append(Estimate.estimate_date <= end_date)
    if conditions: query = query.where(and_(*conditions))
    query = query.order_by(Estimate.estimate_date.desc())

    result = await db.execute(query)
    estimates = result.unique().scalars().all()

    headers = ["견적일자", "거래처명", "제품명", "수량", "단가", "금액", "통화", "유효기간", "비고"]
    col_widths = [12, 20, 28, 8, 12, 14, 6, 12, 22]

    rows = []
    for e in estimates:
        partner_name = e.partner.name if e.partner else ""
        for item in (e.items or []):
            product = item.product
            rows.append([
                _fmt_date(e.estimate_date),
                partner_name,
                product.name if product else (item.product_name or ""),
                item.quantity or 0,
                _fmt_num(item.unit_price),
                _fmt_num((item.quantity or 0) * (item.unit_price or 0)),
                item.currency or "KRW",
                _fmt_date(e.valid_until),
                e.note or ""
            ])

    today = now_kst().strftime("%Y%m%d")
    if fmt == "csv":
        df = pd.DataFrame(rows, columns=headers)
        return _stream_csv(df, f"견적이력_{today}.csv")

    wb = openpyxl.Workbook(); wb.remove(wb.active)
    ws = wb.create_sheet("견적이력")
    _apply_sheet(ws, headers, rows, col_widths)
    return _stream_xlsx(wb, f"견적이력_{today}.xlsx")


@router.get("/export/purchase-orders")
async def export_purchase_orders(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """구매발주 이력"""
    from app.models.purchasing import PurchaseOrder, PurchaseOrderItem
    from sqlalchemy import and_

    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items),
        joinedload(PurchaseOrder.partner)
    )
    conditions = []
    if start_date: conditions.append(PurchaseOrder.order_date >= start_date)
    if end_date:   conditions.append(PurchaseOrder.order_date <= end_date)
    if conditions: query = query.where(and_(*conditions))
    query = query.order_by(PurchaseOrder.order_date.desc())

    result = await db.execute(query)
    orders = result.unique().scalars().all()

    status_map = {"PENDING": "대기", "ORDERED": "발주완료", "PARTIAL": "부분입고",
                  "COMPLETED": "입고완료", "CANCELED": "취소"}

    headers = ["발주번호", "발주일자", "거래처명", "품목명", "수량", "단가", "금액", "납기일", "입고일", "상태", "비고"]
    col_widths = [18, 12, 20, 28, 8, 12, 14, 12, 12, 10, 22]

    rows = []
    for o in orders:
        partner_name = o.partner.name if o.partner else ""
        for item in (o.items or []):
            from app.models.product import Product
            prod_res = await db.execute(select(Product).where(Product.id == item.product_id))
            prod = prod_res.scalar_one_or_none()
            rows.append([
                o.order_no or "",
                _fmt_date(o.order_date),
                partner_name,
                prod.name if prod else "",
                item.quantity or 0,
                _fmt_num(item.unit_price),
                _fmt_num((item.quantity or 0) * (item.unit_price or 0)),
                _fmt_date(o.delivery_date),
                _fmt_date(o.actual_delivery_date),
                status_map.get(o.status.value if hasattr(o.status, "value") else str(o.status), ""),
                o.note or ""
            ])

    today = now_kst().strftime("%Y%m%d")
    if fmt == "csv":
        df = pd.DataFrame(rows, columns=headers)
        return _stream_csv(df, f"구매발주_{today}.csv")

    wb = openpyxl.Workbook(); wb.remove(wb.active)
    ws = wb.create_sheet("구매발주")
    _apply_sheet(ws, headers, rows, col_widths)
    return _stream_xlsx(wb, f"구매발주_{today}.xlsx")


@router.get("/export/inventory")
async def export_inventory(
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """재고 현황 (Stock_table 대응)"""
    from app.models.inventory import Stock
    from app.models.product import Product

    result = await db.execute(
        select(Stock).options(selectinload(Stock.product).selectinload(Product.partner))
    )
    stocks = result.scalars().all()

    headers = ["제품명", "규격", "재질", "단위", "거래처", "현재고", "생산중수량", "최근단가", "재고금액", "창고위치"]
    col_widths = [28, 18, 12, 8, 20, 10, 10, 12, 14, 16]

    rows = []
    for s in stocks:
        p = s.product
        if not p: continue
        price = p.recent_price or 0
        rows.append([
            p.name or "",
            p.specification or "",
            p.material or "",
            p.unit or "EA",
            p.partner.name if p.partner else "",
            s.current_quantity or 0,
            s.in_production_quantity or 0,
            _fmt_num(price),
            _fmt_num((s.current_quantity or 0) * price),
            s.location or ""
        ])

    today = now_kst().strftime("%Y%m%d")
    if fmt == "csv":
        df = pd.DataFrame(rows, columns=headers)
        return _stream_csv(df, f"재고현황_{today}.csv")

    wb = openpyxl.Workbook(); wb.remove(wb.active)
    ws = wb.create_sheet("재고현황")
    _apply_sheet(ws, headers, rows, col_widths)
    return _stream_xlsx(wb, f"재고현황_{today}.xlsx")


@router.get("/export/staff")
async def export_staff(
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """직원 목록 (Person_table 대응)"""
    from app.models.basics import Staff

    result = await db.execute(select(Staff).where(Staff.is_active == True))
    staff_list = result.scalars().all()

    headers = ["성명", "직책", "부서", "주업무", "전화", "이메일", "입사일", "권한"]
    col_widths = [12, 12, 14, 16, 14, 24, 12, 8]

    rows = []
    for s in staff_list:
        rows.append([
            s.name or "",
            s.role or "",
            s.department or "",
            s.main_duty or "",
            s.phone or "",
            s.email or "",
            _fmt_date(s.join_date),
            s.user_type or ""
        ])

    today = now_kst().strftime("%Y%m%d")
    if fmt == "csv":
        df = pd.DataFrame(rows, columns=headers)
        return _stream_csv(df, f"직원목록_{today}.csv")

    wb = openpyxl.Workbook(); wb.remove(wb.active)
    ws = wb.create_sheet("직원목록")
    _apply_sheet(ws, headers, rows, col_widths)
    return _stream_xlsx(wb, f"직원목록_{today}.xlsx")


# ── 전체 백업 ─────────────────────────────────────────────────────────────────

@router.get("/export/all")
async def export_all(
    start_date: Optional[date] = Query(None, description="이력 데이터 시작일"),
    end_date: Optional[date] = Query(None, description="이력 데이터 종료일"),
    db: AsyncSession = Depends(get_db)
):
    """
    전체 백업 - 모든 핵심 테이블을 시트별로 묶어 Excel 1개로 다운로드
    Access DB의 모든 테이블에 대응
    """
    from app.models.basics import Partner, Staff
    from app.models.product import Product, ProductProcess
    from app.models.sales import SalesOrder, SalesOrderItem, Estimate, EstimateItem
    from app.models.purchasing import PurchaseOrder, PurchaseOrderItem
    from app.models.inventory import Stock
    from sqlalchemy import and_

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # ── 1. 거래처 ──
    r = await db.execute(select(Partner).options(selectinload(Partner.contacts)))
    partners = r.unique().scalars().all()
    type_map2 = {"CUSTOMER": "매출처", "SUPPLIER": "매입처", "SUBCONTRACTOR": "외주처"}
    p_rows = []
    for p in partners:
        types = "/".join(type_map2.get(t, t) for t in (p.partner_type or []))
        if p.contacts:
            for c in p.contacts:
                p_rows.append([p.name, types, p.registration_number or "", p.representative or "",
                                p.address or "", p.phone or "", p.email or "", p.description or "",
                                c.name, c.position or "", c.phone or "", c.mobile or ""])
        else:
            p_rows.append([p.name, types, p.registration_number or "", p.representative or "",
                           p.address or "", p.phone or "", p.email or "", p.description or "",
                           "", "", "", ""])
    ws1 = wb.create_sheet("거래처")
    _apply_sheet(ws1,
        ["거래처명","구분","사업자번호","대표자","주소","전화","이메일","비고","담당자명","담당자직위","담당자전화","담당자휴대폰"],
        p_rows, [22,12,16,12,28,14,22,18,12,12,14,14])

    # ── 2. 생산제품 ──
    r = await db.execute(select(Product).options(
        selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        joinedload(Product.partner)
    ).where(Product.item_type == "PRODUCED"))
    prod_rows = []
    for p in r.unique().scalars().all():
        prod_rows.append([p.name or "", p.specification or "", p.material or "", p.unit or "EA",
                          p.partner.name if p.partner else "", _fmt_num(p.recent_price),
                          len(p.standard_processes) if p.standard_processes else 0, p.note or ""])
    ws2 = wb.create_sheet("생산제품")
    _apply_sheet(ws2, ["품명","규격","재질","단위","거래처","최근단가","공정수","비고"],
        prod_rows, [28,20,12,8,20,12,8,22])

    # ── 3. 부품 ──
    r = await db.execute(select(Product).options(joinedload(Product.partner))
                         .where(Product.item_type.in_(["PART","CONSUMABLE"])))
    part_rows = []
    for p in r.unique().scalars().all():
        part_rows.append([{"PART":"부품","CONSUMABLE":"소모품"}.get(p.item_type,""),
                          p.name or "", p.specification or "", p.material or "", p.unit or "EA",
                          p.partner.name if p.partner else "", _fmt_num(p.recent_price), p.note or ""])
    ws3 = wb.create_sheet("부품_소모품")
    _apply_sheet(ws3, ["유형","품명","규격","재질","단위","거래처","최근단가","비고"],
        part_rows, [10,28,20,12,8,20,12,22])

    # ── 4. 수주이력 ──
    conds = []
    if start_date: conds.append(SalesOrder.order_date >= start_date)
    if end_date:   conds.append(SalesOrder.order_date <= end_date)
    q = select(SalesOrder).options(
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
        joinedload(SalesOrder.partner)
    ).order_by(SalesOrder.order_date.desc())
    if conds: q = q.where(and_(*conds))
    r = await db.execute(q)
    s_map = {"PENDING":"대기","CONFIRMED":"확정","PRODUCTION_COMPLETED":"생산완료",
             "PARTIALLY_DELIVERED":"부분납품","DELIVERED":"납품완료",
             "DELIVERY_COMPLETED":"납품완료","CANCELLED":"취소"}
    so_rows = []
    for o in r.unique().scalars().all():
        pname = o.partner.name if o.partner else ""
        for item in (o.items or []):
            prod = item.product
            so_rows.append([
                o.order_no or "", _fmt_date(o.order_date), pname,
                prod.name if prod else (item.product_name or ""),
                prod.specification if prod else "", prod.unit if prod else "",
                item.quantity or 0, item.delivered_quantity or 0,
                _fmt_num(item.unit_price),
                _fmt_num((item.quantity or 0)*(item.unit_price or 0)),
                _fmt_date(o.delivery_date), _fmt_date(o.actual_delivery_date),
                s_map.get(o.status.value if hasattr(o.status,"value") else str(o.status),""),
                o.note or ""
            ])
    ws4 = wb.create_sheet("수주이력")
    _apply_sheet(ws4,
        ["수주번호","수주일자","거래처명","제품명","규격","단위","수량","납품수량",
         "단가","금액","요구납기일","납품일","상태","비고"],
        so_rows, [18,12,20,28,16,8,8,8,12,14,12,12,10,22])

    # ── 5. 견적이력 ──
    conds2 = []
    if start_date: conds2.append(Estimate.estimate_date >= start_date)
    if end_date:   conds2.append(Estimate.estimate_date <= end_date)
    q2 = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product),
        joinedload(Estimate.partner)
    ).order_by(Estimate.estimate_date.desc())
    if conds2: q2 = q2.where(and_(*conds2))
    r2 = await db.execute(q2)
    est_rows = []
    for e in r2.unique().scalars().all():
        pname = e.partner.name if e.partner else ""
        for item in (e.items or []):
            prod = item.product
            est_rows.append([
                _fmt_date(e.estimate_date), pname,
                prod.name if prod else (item.product_name or ""),
                item.quantity or 0, _fmt_num(item.unit_price),
                _fmt_num((item.quantity or 0)*(item.unit_price or 0)),
                item.currency or "KRW", _fmt_date(e.valid_until), e.note or ""
            ])
    ws5 = wb.create_sheet("견적이력")
    _apply_sheet(ws5, ["견적일자","거래처명","제품명","수량","단가","금액","통화","유효기간","비고"],
        est_rows, [12,20,28,8,12,14,6,12,22])

    # ── 6. 재고현황 ──
    r3 = await db.execute(select(Stock).options(
        selectinload(Stock.product).selectinload(Product.partner)
    ))
    inv_rows = []
    for s in r3.scalars().all():
        p = s.product
        if not p: continue
        price = p.recent_price or 0
        inv_rows.append([
            p.name or "", p.specification or "", p.material or "", p.unit or "EA",
            p.partner.name if p.partner else "",
            s.current_quantity or 0, s.in_production_quantity or 0,
            _fmt_num(price), _fmt_num((s.current_quantity or 0)*price), s.location or ""
        ])
    ws6 = wb.create_sheet("재고현황")
    _apply_sheet(ws6,
        ["제품명","규격","재질","단위","거래처","현재고","생산중","최근단가","재고금액","창고위치"],
        inv_rows, [28,18,12,8,20,10,10,12,14,16])

    # ── 7. 직원 ──
    r4 = await db.execute(select(Staff).where(Staff.is_active == True))
    st_rows = [[s.name or "", s.role or "", s.department or "", s.main_duty or "",
                s.phone or "", s.email or "", _fmt_date(s.join_date), s.user_type or ""]
               for s in r4.scalars().all()]
    ws7 = wb.create_sheet("직원목록")
    _apply_sheet(ws7, ["성명","직책","부서","주업무","전화","이메일","입사일","권한"],
        st_rows, [12,12,14,16,14,24,12,8])

    today = now_kst().strftime("%Y%m%d")
    return _stream_xlsx(wb, f"MES_전체백업_{today}.xlsx")
