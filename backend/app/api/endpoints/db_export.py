"""
DB Export API — MES 데이터 내보내기
Export 컬럼 = Import 양식 컬럼 (왕복 가능)
한글 파일명 URL 인코딩 적용
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload
from typing import Optional
from datetime import date
from urllib.parse import quote
import io
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.api.deps import get_db
from app.core.timezone import now_kst

router = APIRouter()

# ── 스타일 ───────────────────────────────────────────────────────────────────
HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
ALT_FILL    = PatternFill("solid", fgColor="0D1B2A")
ALT2_FILL   = PatternFill("solid", fgColor="111827")
THIN_BORDER = Border(
    left=Side(style="thin", color="374151"), right=Side(style="thin", color="374151"),
    top=Side(style="thin", color="374151"),  bottom=Side(style="thin", color="374151"),
)
H_FONT  = Font(color="FFFFFF", bold=True, name="맑은 고딕", size=9)
V_FONT  = Font(color="D1D5DB", name="맑은 고딕", size=9)
C_ALIGN = Alignment(horizontal="center", vertical="center")
L_ALIGN = Alignment(horizontal="left",   vertical="center")


def _apply_sheet(ws, headers: list, rows: list, col_widths: list | None = None):
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = H_FONT; cell.fill = HEADER_FILL
        cell.alignment = C_ALIGN; cell.border = THIN_BORDER
    ws.row_dimensions[1].height = 18

    for r, row_vals in enumerate(rows, 2):
        fill = ALT_FILL if r % 2 == 0 else ALT2_FILL
        for c, val in enumerate(row_vals, 1):
            cell = ws.cell(row=r, column=c, value=val)
            cell.font = V_FONT; cell.fill = fill
            cell.border = THIN_BORDER; cell.alignment = L_ALIGN
        ws.row_dimensions[r].height = 16

    widths = col_widths or [18] * len(headers)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.sheet_view.showGridLines = False


def _stream_xlsx(wb: openpyxl.Workbook, filename: str) -> StreamingResponse:
    """한글 파일명 URL 인코딩 적용"""
    stream = io.BytesIO()
    wb.save(stream); stream.seek(0)
    encoded = quote(filename, safe="")
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    )


def _stream_csv(df: pd.DataFrame, filename: str) -> StreamingResponse:
    buf = io.BytesIO()
    buf.write(df.to_csv(index=False).encode("utf-8-sig"))
    buf.seek(0)
    encoded = quote(filename, safe="")
    return StreamingResponse(
        buf, media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    )


def _d(v) -> str:
    if v is None: return ""
    try: return v.strftime("%Y-%m-%d")
    except: return str(v)


def _n(v):
    if v is None: return ""
    try: return float(v)
    except: return str(v)


def _today() -> str:
    return now_kst().strftime("%Y%m%d")


# ── 거래처 ───────────────────────────────────────────────────────────────────
# Import 양식 컬럼: 업체명, 구분 (매출처/매입처/외주처), 사업자번호, 대표자, 주소, 전화번호, 이메일, 비고
@router.get("/export/partners")
async def export_partners(fmt: str = Query("xlsx"), db: AsyncSession = Depends(get_db)):
    """거래처 — Import 양식과 동일 컬럼 (왕복 가능)"""
    from app.models.basics import Partner
    result = await db.execute(select(Partner))
    partners = result.scalars().all()

    headers = ["업체명", "구분 (매출처/매입처/외주처)", "사업자번호", "대표자", "주소", "전화번호", "팩스번호", "이메일", "비고"]
    col_widths = [24, 20, 16, 12, 30, 14, 14, 24, 20]

    type_map = {"CUSTOMER": "매출처", "SUPPLIER": "매입처", "SUBCONTRACTOR": "외주처"}
    rows = []
    for p in partners:
        types = ",".join(type_map.get(t, t) for t in (p.partner_type or []))
        rows.append([p.name or "", types, p.registration_number or "",
                     p.representative or "", p.address or "", p.phone or "",
                     p.fax or "", p.email or "", p.description or ""])

    fname = f"거래처_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("거래처"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 생산제품 ─────────────────────────────────────────────────────────────────
# Import 양식 컬럼: 품명, 규격, 재질, 단위, 거래처명, 비고 (+최근단가 추가)
@router.get("/export/products")
async def export_products(
    item_type: str = Query("PRODUCED"),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """생산제품/부품/소모품 — Import 양식과 동일 컬럼 (왕복 가능)"""
    from app.models.product import Product, ProductProcess
    from sqlalchemy import or_

    query = select(Product).options(joinedload(Product.partner))
    if item_type == "ALL":
        pass
    elif "," in item_type:
        query = query.where(Product.item_type.in_([t.strip() for t in item_type.split(",")]))
    else:
        query = query.where(Product.item_type == item_type)

    result = await db.execute(query)
    products = result.unique().scalars().all()

    # 부품/소모품은 유형 컬럼 추가
    include_type = item_type in ("ALL", "PART,CONSUMABLE") or "," in item_type or item_type not in ("PRODUCED",)
    type_label = {"PRODUCED": "생산제품", "PART": "부품", "CONSUMABLE": "소모품"}

    if include_type:
        headers = ["유형", "품명", "규격", "재질", "단위", "거래처명", "최근단가", "비고"]
        col_widths = [10, 28, 20, 12, 8, 22, 12, 22]
        rows = [[type_label.get(p.item_type, p.item_type), p.name or "", p.specification or "",
                 p.material or "", p.unit or "EA",
                 p.partner.name if p.partner else "", _n(p.recent_price), p.note or ""]
                for p in products]
    else:
        headers = ["품명", "규격", "재질", "단위", "거래처명", "최근단가", "비고"]
        col_widths = [28, 20, 12, 8, 22, 12, 22]
        rows = [[p.name or "", p.specification or "", p.material or "", p.unit or "EA",
                 p.partner.name if p.partner else "", _n(p.recent_price), p.note or ""]
                for p in products]

    label_map = {"PRODUCED": "생산제품", "PART,CONSUMABLE": "부품소모품", "ALL": "전체제품"}
    fname_label = label_map.get(item_type, "제품")
    fname = f"{fname_label}_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet(fname_label), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 수주 이력 ────────────────────────────────────────────────────────────────
# Import 양식 컬럼: 수주일자, 거래처명, 제품명, 규격, 수량, 단가, 진행상태
@router.get("/export/sales-orders")
async def export_sales_orders(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """수주 이력 — Import 양식과 동일 컬럼 (왕복 가능)"""
    from app.models.sales import SalesOrder, SalesOrderItem
    from sqlalchemy import and_

    query = select(SalesOrder).options(
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
        joinedload(SalesOrder.partner)
    )
    conds = []
    if start_date: conds.append(SalesOrder.order_date >= start_date)
    if end_date:   conds.append(SalesOrder.order_date <= end_date)
    if conds: query = query.where(and_(*conds))
    query = query.order_by(SalesOrder.order_date.desc())

    result = await db.execute(query)
    orders = result.unique().scalars().all()

    status_map = {
        "PENDING": "대기", "CONFIRMED": "확정",
        "PRODUCTION_COMPLETED": "생산완료", "PARTIALLY_DELIVERED": "부분납품",
        "DELIVERED": "납품완료", "DELIVERY_COMPLETED": "납품완료", "CANCELLED": "취소"
    }
    # Import 양식과 동일
    headers = ["수주일자", "거래처명", "제품명", "규격", "수량", "단가",
               "진행상태 (진행중, 완료, 대기 등)", "납기일", "납품일", "비고"]
    col_widths = [12, 22, 28, 16, 8, 12, 14, 12, 12, 22]

    rows = []
    for o in orders:
        pname = o.partner.name if o.partner else ""
        sv = o.status.value if hasattr(o.status, "value") else str(o.status)
        for item in (o.items or []):
            prod = item.product
            rows.append([
                _d(o.order_date), pname,
                prod.name if prod else (item.product_name or ""),
                prod.specification if prod else "",
                item.quantity or 0, _n(item.unit_price),
                status_map.get(sv, sv),
                _d(o.delivery_date), _d(o.actual_delivery_date), o.note or ""
            ])

    fname = f"수주이력_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("수주이력"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 견적 이력 (Export 전용) ──────────────────────────────────────────────────
@router.get("/export/estimates")
async def export_estimates(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """견적 이력 — Export 전용 (조회/백업용)"""
    from app.models.sales import Estimate, EstimateItem
    from sqlalchemy import and_

    query = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product),
        joinedload(Estimate.partner)
    )
    conds = []
    if start_date: conds.append(Estimate.estimate_date >= start_date)
    if end_date:   conds.append(Estimate.estimate_date <= end_date)
    if conds: query = query.where(and_(*conds))
    query = query.order_by(Estimate.estimate_date.desc())

    result = await db.execute(query)
    estimates = result.unique().scalars().all()

    headers = ["견적일자", "거래처명", "제품명", "수량", "단가", "금액", "통화", "유효기간", "비고"]
    col_widths = [12, 22, 28, 8, 12, 14, 6, 12, 22]

    rows = []
    for e in estimates:
        pname = e.partner.name if e.partner else ""
        for item in (e.items or []):
            prod = item.product
            rows.append([
                _d(e.estimate_date), pname,
                prod.name if prod else (item.product_name or ""),
                item.quantity or 0, _n(item.unit_price),
                _n((item.quantity or 0) * (item.unit_price or 0)),
                item.currency or "KRW", _d(e.valid_until), e.note or ""
            ])

    fname = f"견적이력_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("견적이력"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 구매발주 이력 (Export 전용) ──────────────────────────────────────────────
@router.get("/export/purchase-orders")
async def export_purchase_orders(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """구매발주 이력 — Export 전용"""
    from app.models.purchasing import PurchaseOrder, PurchaseOrderItem
    from app.models.product import Product
    from sqlalchemy import and_

    query = select(PurchaseOrder).options(
        selectinload(PurchaseOrder.items),
        joinedload(PurchaseOrder.partner)
    )
    conds = []
    if start_date: conds.append(PurchaseOrder.order_date >= start_date)
    if end_date:   conds.append(PurchaseOrder.order_date <= end_date)
    if conds: query = query.where(and_(*conds))
    query = query.order_by(PurchaseOrder.order_date.desc())

    result = await db.execute(query)
    orders = result.unique().scalars().all()

    status_map = {"PENDING": "대기", "ORDERED": "발주완료", "PARTIAL": "부분입고",
                  "COMPLETED": "입고완료", "CANCELED": "취소"}

    headers = ["발주번호", "발주일자", "거래처명", "품목명", "규격", "수량", "단가", "금액", "납기일", "입고일", "상태", "비고"]
    col_widths = [18, 12, 20, 28, 16, 8, 12, 14, 12, 12, 10, 20]

    rows = []
    for o in orders:
        pname = o.partner.name if o.partner else ""
        sv = o.status.value if hasattr(o.status, "value") else str(o.status)
        for item in (o.items or []):
            prod_res = await db.execute(select(Product).where(Product.id == item.product_id))
            prod = prod_res.scalar_one_or_none()
            rows.append([
                o.order_no or "", _d(o.order_date), pname,
                prod.name if prod else "",
                prod.specification if prod else "",
                item.quantity or 0, _n(item.unit_price),
                _n((item.quantity or 0) * (item.unit_price or 0)),
                _d(o.delivery_date), _d(o.actual_delivery_date),
                status_map.get(sv, sv), o.note or ""
            ])

    fname = f"구매발주_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("구매발주"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 재고 현황 (Export 전용) ──────────────────────────────────────────────────
@router.get("/export/inventory")
async def export_inventory(fmt: str = Query("xlsx"), db: AsyncSession = Depends(get_db)):
    """재고 현황 — Export 전용 (현재 스냅샷)"""
    from app.models.inventory import Stock
    from app.models.product import Product

    result = await db.execute(
        select(Stock).options(selectinload(Stock.product).selectinload(Product.partner))
    )
    stocks = result.scalars().all()

    headers = ["제품명", "규격", "단위", "거래처", "현재고", "생산중수량", "최근단가", "재고금액", "창고위치"]
    col_widths = [28, 18, 8, 20, 10, 10, 12, 14, 16]

    rows = []
    for s in stocks:
        p = s.product
        if not p: continue
        price = p.recent_price or 0
        rows.append([
            p.name or "", p.specification or "", p.unit or "EA",
            p.partner.name if p.partner else "",
            s.current_quantity or 0, s.in_production_quantity or 0,
            _n(price), _n((s.current_quantity or 0) * price),
            s.location or ""
        ])

    fname = f"재고현황_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("재고현황"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 직원 ─────────────────────────────────────────────────────────────────────
# Import 양식 컬럼: 성명, 직책, 주업무, 전화번호, 권한(ADMIN/USER)
@router.get("/export/staff")
async def export_staff(fmt: str = Query("xlsx"), db: AsyncSession = Depends(get_db)):
    """직원 목록 — Import 양식과 동일 컬럼 (왕복 가능)"""
    from app.models.basics import Staff

    result = await db.execute(select(Staff).where(Staff.is_active == True))
    staff_list = result.scalars().all()

    headers = ["성명", "직책", "주업무", "전화번호", "권한(ADMIN/USER)", "이메일", "입사일"]
    col_widths = [12, 12, 16, 14, 14, 24, 12]

    rows = [[s.name or "", s.role or "", s.main_duty or "", s.phone or "",
             s.user_type or "", s.email or "", _d(s.join_date)]
            for s in staff_list]

    fname = f"직원목록_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("직원목록"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 설비 ─────────────────────────────────────────────────────────────────────
# Import 양식 컬럼: 장비명, 장비코드, 사양, 설치위치
@router.get("/export/equipments")
async def export_equipments(fmt: str = Query("xlsx"), db: AsyncSession = Depends(get_db)):
    """설비 목록 — Import 양식과 동일 컬럼 (왕복 가능)"""
    from app.models.basics import Equipment

    result = await db.execute(select(Equipment).where(Equipment.is_active == True))
    equip_list = result.scalars().all()

    headers = ["장비명", "장비코드", "사양", "설치위치"]
    col_widths = [20, 16, 20, 16]

    rows = [[e.name or "", e.code or "", e.spec or "", e.location or ""]
            for e in equip_list]

    fname = f"설비목록_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("설비목록"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


# ── 전체 백업 ────────────────────────────────────────────────────────────────
@router.get("/export/all")
async def export_all(
    start_date: Optional[date] = Query(None, description="이력 데이터 시작일"),
    end_date: Optional[date] = Query(None, description="이력 데이터 종료일"),
    db: AsyncSession = Depends(get_db)
):
    """전체 백업 — 모든 핵심 테이블을 시트별로 묶어 Excel 1개로 다운로드"""
    from app.models.basics import Partner, Staff, Equipment
    from app.models.product import Product, ProductProcess
    from app.models.sales import SalesOrder, SalesOrderItem, Estimate, EstimateItem
    from app.models.purchasing import PurchaseOrder, PurchaseOrderItem
    from app.models.inventory import Stock
    from sqlalchemy import and_

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # 1. 거래처
    r = await db.execute(select(Partner))
    type_map = {"CUSTOMER": "매출처", "SUPPLIER": "매입처", "SUBCONTRACTOR": "외주처"}
    p_rows = [
        [p.name or "",
         ",".join(type_map.get(t, t) for t in (p.partner_type or [])),
         p.registration_number or "", p.representative or "",
         p.address or "", p.phone or "", p.fax or "", p.email or "", p.description or ""]
        for p in r.scalars().all()
    ]
    _apply_sheet(wb.create_sheet("거래처"),
        ["업체명", "구분 (매출처/매입처/외주처)", "사업자번호", "대표자", "주소", "전화번호", "팩스번호", "이메일", "비고"],
        p_rows, [24, 20, 16, 12, 30, 14, 14, 24, 20])

    # 2. 생산제품
    r = await db.execute(select(Product).options(joinedload(Product.partner))
                         .where(Product.item_type == "PRODUCED"))
    prod_rows = [[p.name or "", p.specification or "", p.material or "", p.unit or "EA",
                  p.partner.name if p.partner else "", _n(p.recent_price), p.note or ""]
                 for p in r.unique().scalars().all()]
    _apply_sheet(wb.create_sheet("생산제품"),
        ["품명", "규격", "재질", "단위", "거래처명", "최근단가", "비고"],
        prod_rows, [28, 20, 12, 8, 22, 12, 22])

    # 3. 부품/소모품
    r = await db.execute(select(Product).options(joinedload(Product.partner))
                         .where(Product.item_type.in_(["PART", "CONSUMABLE"])))
    part_label = {"PART": "부품", "CONSUMABLE": "소모품"}
    part_rows = [[part_label.get(p.item_type, ""), p.name or "", p.specification or "",
                  p.material or "", p.unit or "EA",
                  p.partner.name if p.partner else "", _n(p.recent_price), p.note or ""]
                 for p in r.unique().scalars().all()]
    _apply_sheet(wb.create_sheet("부품_소모품"),
        ["유형", "품명", "규격", "재질", "단위", "거래처명", "최근단가", "비고"],
        part_rows, [10, 28, 20, 12, 8, 22, 12, 22])

    # 4. 수주이력
    conds = []
    if start_date: conds.append(SalesOrder.order_date >= start_date)
    if end_date:   conds.append(SalesOrder.order_date <= end_date)
    q = select(SalesOrder).options(
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.product),
        joinedload(SalesOrder.partner)
    ).order_by(SalesOrder.order_date.desc())
    if conds: q = q.where(and_(*conds))
    r = await db.execute(q)
    s_map = {"PENDING": "대기", "CONFIRMED": "확정", "PRODUCTION_COMPLETED": "생산완료",
             "PARTIALLY_DELIVERED": "부분납품", "DELIVERED": "납품완료",
             "DELIVERY_COMPLETED": "납품완료", "CANCELLED": "취소"}
    so_rows = []
    for o in r.unique().scalars().all():
        pname = o.partner.name if o.partner else ""
        sv = o.status.value if hasattr(o.status, "value") else str(o.status)
        for item in (o.items or []):
            prod = item.product
            so_rows.append([
                _d(o.order_date), pname,
                prod.name if prod else (item.product_name or ""),
                prod.specification if prod else "",
                item.quantity or 0, _n(item.unit_price),
                s_map.get(sv, sv),
                _d(o.delivery_date), _d(o.actual_delivery_date), o.note or ""
            ])
    _apply_sheet(wb.create_sheet("수주이력"),
        ["수주일자", "거래처명", "제품명", "규격", "수량", "단가",
         "진행상태 (진행중, 완료, 대기 등)", "납기일", "납품일", "비고"],
        so_rows, [12, 22, 28, 16, 8, 12, 14, 12, 12, 22])

    # 5. 견적이력
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
                _d(e.estimate_date), pname,
                prod.name if prod else (item.product_name or ""),
                item.quantity or 0, _n(item.unit_price),
                _n((item.quantity or 0) * (item.unit_price or 0)),
                item.currency or "KRW", _d(e.valid_until), e.note or ""
            ])
    _apply_sheet(wb.create_sheet("견적이력"),
        ["견적일자", "거래처명", "제품명", "수량", "단가", "금액", "통화", "유효기간", "비고"],
        est_rows, [12, 22, 28, 8, 12, 14, 6, 12, 22])

    # 6. 재고현황
    r3 = await db.execute(select(Stock).options(
        selectinload(Stock.product).selectinload(Product.partner)
    ))
    inv_rows = []
    for s in r3.scalars().all():
        p = s.product
        if not p: continue
        price = p.recent_price or 0
        inv_rows.append([p.name or "", p.specification or "", p.unit or "EA",
                         p.partner.name if p.partner else "",
                         s.current_quantity or 0, s.in_production_quantity or 0,
                         _n(price), _n((s.current_quantity or 0) * price), s.location or ""])
    _apply_sheet(wb.create_sheet("재고현황"),
        ["제품명", "규격", "단위", "거래처", "현재고", "생산중수량", "최근단가", "재고금액", "창고위치"],
        inv_rows, [28, 18, 8, 20, 10, 10, 12, 14, 16])

    # 7. 직원
    r4 = await db.execute(select(Staff).where(Staff.is_active == True))
    st_rows = [[s.name or "", s.role or "", s.main_duty or "", s.phone or "",
                s.user_type or "", s.email or "", _d(s.join_date)]
               for s in r4.scalars().all()]
    _apply_sheet(wb.create_sheet("직원"),
        ["성명", "직책", "주업무", "전화번호", "권한(ADMIN/USER)", "이메일", "입사일"],
        st_rows, [12, 12, 16, 14, 14, 24, 12])

    # 8. 설비
    r5 = await db.execute(select(Equipment).where(Equipment.is_active == True))
    eq_rows = [[e.name or "", e.code or "", e.spec or "", e.location or ""]
               for e in r5.scalars().all()]
    _apply_sheet(wb.create_sheet("설비"),
        ["장비명", "장비코드", "사양", "설치위치"],
        eq_rows, [20, 16, 20, 16])

    # 9. 외주발주
    from app.models.purchasing import OutsourcingOrder, OutsourcingOrderItem
    r6 = await db.execute(select(OutsourcingOrder).options(
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.product),
        joinedload(OutsourcingOrder.partner)
    ).order_by(OutsourcingOrder.order_date.desc()))
    os_status_map = {"PENDING":"대기","ORDERED":"발주완료","COMPLETED":"완료","CANCELED":"취소",
                     "QUOTATION":"견적의뢰중","QUOTATION_COMPLETE":"견적완료"}
    os_rows = []
    for o in r6.unique().scalars().all():
        pname = o.partner.name if o.partner else ""
        sv = o.status.value if hasattr(o.status,"value") else str(o.status)
        for item in (o.items or []):
            prod = item.product
            os_rows.append([o.order_no or "", _d(o.order_date), pname,
                            prod.name if prod else "", prod.specification if prod else "",
                            item.quantity or 0, _n(item.unit_price),
                            _n((item.quantity or 0)*(item.unit_price or 0)),
                            _d(o.delivery_date), _d(o.actual_delivery_date),
                            os_status_map.get(sv, sv), o.note or ""])
    _apply_sheet(wb.create_sheet("외주발주"),
        ["발주번호","발주일자","외주처","품목명","규격","수량","단가","금액","납기일","입고일","상태","비고"],
        os_rows, [18,12,20,28,16,8,12,14,12,12,10,20])

    # 10. 납품이력
    from app.models.sales import DeliveryHistory, DeliveryHistoryItem, SalesOrderItem
    r7 = await db.execute(select(DeliveryHistory).options(
        selectinload(DeliveryHistory.items).selectinload(DeliveryHistoryItem.order_item).selectinload(SalesOrderItem.product),
        selectinload(DeliveryHistory.order).joinedload(SalesOrder.partner)
    ).order_by(DeliveryHistory.delivery_date.desc()))
    dh_rows = []
    for dh in r7.unique().scalars().all():
        order = dh.order
        pname = order.partner.name if (order and order.partner) else ""
        order_no = order.order_no if order else ""
        for item in (dh.items or []):
            oi = item.order_item
            prod = oi.product if oi else None
            dh_rows.append([dh.delivery_no or "", _d(dh.delivery_date), pname, order_no,
                            prod.name if prod else "", prod.specification if prod else "",
                            item.quantity or 0,
                            _n((item.quantity or 0)*(oi.unit_price if oi else 0)),
                            dh.note or ""])
    _apply_sheet(wb.create_sheet("납품이력"),
        ["납품번호","납품일자","거래처","수주번호","제품명","규격","수량","금액","비고"],
        dh_rows, [18,12,20,18,28,16,8,14,22])

    # 11. 작업일지
    from app.models.production import WorkLog, WorkLogItem
    r8 = await db.execute(select(WorkLog).options(
        selectinload(WorkLog.items).selectinload(WorkLogItem.worker),
        joinedload(WorkLog.worker)
    ).order_by(WorkLog.work_date.desc()))
    wl_rows = []
    for wl in r8.unique().scalars().all():
        writer = wl.worker.name if wl.worker else ""
        if wl.items:
            for it in wl.items:
                w = it.worker.name if it.worker else writer
                start = it.start_time.strftime("%H:%M") if it.start_time else ""
                end   = it.end_time.strftime("%H:%M") if it.end_time else ""
                wl_rows.append([_d(wl.work_date), writer, w, start, end,
                                it.good_quantity or 0, it.bad_quantity or 0,
                                _n(it.unit_price), it.note or ""])
        else:
            wl_rows.append([_d(wl.work_date), writer, "", "", "", 0, 0, "", wl.note or ""])
    _apply_sheet(wb.create_sheet("작업일지"),
        ["작업일자","작성자","작업자","시작시간","종료시간","양품수량","불량수량","단가","비고"],
        wl_rows, [12,12,12,10,10,10,10,12,28])

    # 12. 재고생산이력
    r9 = await db.execute(select(StockProduction).options(
        joinedload(StockProduction.product),
        joinedload(StockProduction.partner)
    ).order_by(StockProduction.request_date.desc()))
    sp_status = {"PENDING":"대기","IN_PROGRESS":"생산중","COMPLETED":"완료","CANCELLED":"취소"}
    sp_rows = []
    for sp in r9.unique().scalars().all():
        sv = sp.status.value if hasattr(sp.status,"value") else str(sp.status)
        sp_rows.append([sp.production_no or "", _d(sp.request_date), _d(sp.target_date),
                        sp.product.name if sp.product else "",
                        sp.product.specification if sp.product else "",
                        sp.quantity or 0, sp_status.get(sv, sv), sp.note or ""])
    _apply_sheet(wb.create_sheet("재고생산이력"),
        ["생산번호","요청일","목표일","제품명","규격","수량","상태","비고"],
        sp_rows, [18,12,12,28,16,8,10,22])

    # 13. 재고 수불 이력
    from app.models.inventory import StockTransaction
    r10 = await db.execute(select(StockTransaction).options(
        selectinload(StockTransaction.stock).selectinload(Stock.product)
    ).order_by(StockTransaction.created_at.desc()))
    tt_map = {"IN":"입고","OUT":"출고","ADJUSTMENT":"조정"}
    tx_rows = []
    for tx in r10.scalars().all():
        stock = tx.stock
        prod = stock.product if stock else None
        tv = tx.transaction_type.value if hasattr(tx.transaction_type,"value") else str(tx.transaction_type)
        tx_rows.append([prod.name if prod else "", prod.specification if prod else "",
                        tt_map.get(tv, tv), tx.quantity or 0,
                        tx.reference or "",
                        tx.created_at.strftime("%Y-%m-%d %H:%M") if tx.created_at else ""])
    _apply_sheet(wb.create_sheet("재고수불이력"),
        ["제품명","규격","구분","수량","참조번호","일시"],
        tx_rows, [28,16,8,8,18,18])

    # 14. 측정기
    from app.models.basics import MeasuringInstrument
    r11 = await db.execute(select(MeasuringInstrument).where(MeasuringInstrument.is_active == True))
    mi_rows = [[m.name or "", m.code or "", m.spec or "", m.serial_number or "",
                m.calibration_cycle_months or 12, _d(m.next_calibration_date)]
               for m in r11.scalars().all()]
    _apply_sheet(wb.create_sheet("측정기"),
        ["측정기명","코드","규격","일련번호","교정주기(개월)","차기교정일"],
        mi_rows, [20,14,16,16,14,14])

    return _stream_xlsx(wb, f"MES_전체백업_{_today()}.xlsx")


# ── 개별 엔드포인트 (추가분) ──────────────────────────────────────────────────

@router.get("/export/outsourcing-orders")
async def export_outsourcing_orders(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """외주발주 이력 — Export 전용"""
    from app.models.purchasing import OutsourcingOrder, OutsourcingOrderItem
    from sqlalchemy import and_

    q = select(OutsourcingOrder).options(
        selectinload(OutsourcingOrder.items).selectinload(OutsourcingOrderItem.product),
        joinedload(OutsourcingOrder.partner)
    )
    conds = []
    if start_date: conds.append(OutsourcingOrder.order_date >= start_date)
    if end_date:   conds.append(OutsourcingOrder.order_date <= end_date)
    if conds: q = q.where(and_(*conds))
    q = q.order_by(OutsourcingOrder.order_date.desc())

    result = await db.execute(q)
    orders = result.unique().scalars().all()

    st_map = {"PENDING":"대기","ORDERED":"발주완료","COMPLETED":"완료","CANCELED":"취소",
              "QUOTATION":"견적의뢰중","QUOTATION_COMPLETE":"견적완료"}
    headers = ["발주번호","발주일자","외주처","품목명","규격","수량","단가","금액","납기일","입고일","상태","비고"]
    col_widths = [18,12,20,28,16,8,12,14,12,12,10,20]

    rows = []
    for o in orders:
        pname = o.partner.name if o.partner else ""
        sv = o.status.value if hasattr(o.status,"value") else str(o.status)
        for item in (o.items or []):
            prod = item.product
            rows.append([o.order_no or "", _d(o.order_date), pname,
                         prod.name if prod else "", prod.specification if prod else "",
                         item.quantity or 0, _n(item.unit_price),
                         _n((item.quantity or 0)*(item.unit_price or 0)),
                         _d(o.delivery_date), _d(o.actual_delivery_date),
                         st_map.get(sv, sv), o.note or ""])

    fname = f"외주발주_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("외주발주"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


@router.get("/export/delivery-history")
async def export_delivery_history(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """납품 이력 — Export 전용"""
    from app.models.sales import DeliveryHistory, DeliveryHistoryItem, SalesOrderItem, SalesOrder
    from sqlalchemy import and_

    q = select(DeliveryHistory).options(
        selectinload(DeliveryHistory.items).selectinload(DeliveryHistoryItem.order_item).selectinload(SalesOrderItem.product),
        selectinload(DeliveryHistory.order).joinedload(SalesOrder.partner)
    )
    conds = []
    if start_date: conds.append(DeliveryHistory.delivery_date >= start_date)
    if end_date:   conds.append(DeliveryHistory.delivery_date <= end_date)
    if conds: q = q.where(and_(*conds))
    q = q.order_by(DeliveryHistory.delivery_date.desc())

    result = await db.execute(q)
    deliveries = result.unique().scalars().all()

    headers = ["납품번호","납품일자","거래처","수주번호","제품명","규격","수량","금액","비고"]
    col_widths = [18,12,20,18,28,16,8,14,22]

    rows = []
    for dh in deliveries:
        order = dh.order
        pname = order.partner.name if (order and order.partner) else ""
        order_no = order.order_no if order else ""
        for item in (dh.items or []):
            oi = item.order_item
            prod = oi.product if oi else None
            rows.append([dh.delivery_no or "", _d(dh.delivery_date), pname, order_no,
                         prod.name if prod else "",
                         prod.specification if prod else "",
                         item.quantity or 0,
                         _n((item.quantity or 0)*(oi.unit_price if oi else 0)),
                         dh.note or ""])

    fname = f"납품이력_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("납품이력"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


@router.get("/export/work-logs")
async def export_work_logs(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """작업일지 — Export 전용"""
    from app.models.production import WorkLog, WorkLogItem
    from sqlalchemy import and_

    q = select(WorkLog).options(
        selectinload(WorkLog.items).selectinload(WorkLogItem.worker),
        joinedload(WorkLog.worker)
    )
    conds = []
    if start_date: conds.append(WorkLog.work_date >= start_date)
    if end_date:   conds.append(WorkLog.work_date <= end_date)
    if conds: q = q.where(and_(*conds))
    q = q.order_by(WorkLog.work_date.desc())

    result = await db.execute(q)
    logs = result.unique().scalars().all()

    headers = ["작업일자","작성자","작업자","시작시간","종료시간","양품수량","불량수량","단가","비고"]
    col_widths = [12,12,12,10,10,10,10,12,28]

    rows = []
    for wl in logs:
        writer = wl.worker.name if wl.worker else ""
        if wl.items:
            for it in wl.items:
                w = it.worker.name if it.worker else writer
                start = it.start_time.strftime("%H:%M") if it.start_time else ""
                end   = it.end_time.strftime("%H:%M") if it.end_time else ""
                rows.append([_d(wl.work_date), writer, w, start, end,
                             it.good_quantity or 0, it.bad_quantity or 0,
                             _n(it.unit_price), it.note or ""])
        else:
            rows.append([_d(wl.work_date), writer, "","","", 0, 0, "", wl.note or ""])

    fname = f"작업일지_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("작업일지"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


@router.get("/export/stock-productions")
async def export_stock_productions(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """재고생산 이력 — Export 전용"""
    from app.models.inventory import StockProduction
    from sqlalchemy import and_

    q = select(StockProduction).options(
        joinedload(StockProduction.product),
        joinedload(StockProduction.partner)
    )
    conds = []
    if start_date: conds.append(StockProduction.request_date >= start_date)
    if end_date:   conds.append(StockProduction.request_date <= end_date)
    if conds: q = q.where(and_(*conds))
    q = q.order_by(StockProduction.request_date.desc())

    result = await db.execute(q)
    productions = result.unique().scalars().all()

    st_map = {"PENDING":"대기","IN_PROGRESS":"생산중","COMPLETED":"완료","CANCELLED":"취소"}
    headers = ["생산번호","요청일","목표일","제품명","규격","수량","상태","비고"]
    col_widths = [18,12,12,28,16,8,10,22]

    rows = []
    for sp in productions:
        sv = sp.status.value if hasattr(sp.status,"value") else str(sp.status)
        rows.append([sp.production_no or "", _d(sp.request_date), _d(sp.target_date),
                     sp.product.name if sp.product else "",
                     sp.product.specification if sp.product else "",
                     sp.quantity or 0, st_map.get(sv, sv), sp.note or ""])

    fname = f"재고생산이력_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("재고생산이력"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


@router.get("/export/stock-transactions")
async def export_stock_transactions(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    fmt: str = Query("xlsx"),
    db: AsyncSession = Depends(get_db)
):
    """재고 수불 이력 — Export 전용"""
    from app.models.inventory import StockTransaction, Stock
    from sqlalchemy import and_

    q = select(StockTransaction).options(
        selectinload(StockTransaction.stock).selectinload(Stock.product)
    )
    conds = []
    if start_date: conds.append(StockTransaction.created_at >= start_date)
    if end_date:   conds.append(StockTransaction.created_at <= end_date)
    if conds: q = q.where(and_(*conds))
    q = q.order_by(StockTransaction.created_at.desc())

    result = await db.execute(q)
    txs = result.scalars().all()

    tt_map = {"IN":"입고","OUT":"출고","ADJUSTMENT":"조정"}
    headers = ["제품명","규격","구분","수량","참조번호","일시"]
    col_widths = [28,16,8,8,18,18]

    rows = []
    for tx in txs:
        stock = tx.stock
        prod = stock.product if stock else None
        tv = tx.transaction_type.value if hasattr(tx.transaction_type,"value") else str(tx.transaction_type)
        rows.append([prod.name if prod else "", prod.specification if prod else "",
                     tt_map.get(tv, tv), tx.quantity or 0, tx.reference or "",
                     tx.created_at.strftime("%Y-%m-%d %H:%M") if tx.created_at else ""])

    fname = f"재고수불이력_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("재고수불이력"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")


@router.get("/export/measuring-instruments")
async def export_measuring_instruments(fmt: str = Query("xlsx"), db: AsyncSession = Depends(get_db)):
    """측정기 목록 — Export 전용"""
    from app.models.basics import MeasuringInstrument

    result = await db.execute(select(MeasuringInstrument).where(MeasuringInstrument.is_active == True))
    instruments = result.scalars().all()

    headers = ["측정기명","코드","규격","일련번호","교정주기(개월)","차기교정일"]
    col_widths = [20,14,16,16,14,14]

    rows = [[m.name or "", m.code or "", m.spec or "", m.serial_number or "",
             m.calibration_cycle_months or 12, _d(m.next_calibration_date)]
            for m in instruments]

    fname = f"측정기_{_today()}"
    if fmt == "csv":
        return _stream_csv(pd.DataFrame(rows, columns=headers), fname + ".csv")
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    _apply_sheet(wb.create_sheet("측정기"), headers, rows, col_widths)
    return _stream_xlsx(wb, fname + ".xlsx")
