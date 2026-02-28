from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, or_
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete
from app.api import deps
from app.models.sales import Estimate, EstimateItem, SalesOrder, SalesOrderItem, OrderStatus
from app.schemas import sales as schemas
from app.models.product import Product, ProductProcess
from app.models.basics import Partner
from app.models.production import ProductionPlan, ProductionPlanItem, WorkOrder
from app.models.quality import InspectionResult, QualityDefect
from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem
import uuid
from datetime import datetime, date
import os
import openpyxl
from openpyxl.styles import Font, Alignment, Border, Side
from app.core import config
import json

router = APIRouter()

# --- Estimates ---

@router.post("/estimates/", response_model=schemas.Estimate)
async def create_estimate(
    estimate_in: schemas.EstimateCreate,
    db: AsyncSession = Depends(deps.get_db)
):
    # 1. Create Estimate Header
    db_estimate = Estimate(
        partner_id=estimate_in.partner_id,
        estimate_date=estimate_in.estimate_date or datetime.now().date(),
        valid_until=estimate_in.valid_until,
        total_amount=estimate_in.total_amount,
        note=estimate_in.note,
        attachment_file=estimate_in.attachment_file
    )
    db.add(db_estimate)
    await db.flush() # Get ID

    # 2. Create Items
    for item in estimate_in.items:
        db_item = EstimateItem(
            estimate_id=db_estimate.id,
            product_id=item.product_id,
            unit_price=item.unit_price,
            quantity=item.quantity,
            note=item.note
        )
        db.add(db_item)
    
    await db.commit()
    await db.refresh(db_estimate)
    
    # Eager load for response
    query = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(Estimate.partner)
    ).where(Estimate.id == db_estimate.id)
    result = await db.execute(query)
    return result.scalar_one()

@router.get("/estimates/", response_model=List[schemas.Estimate])
async def read_estimates(
    skip: int = 0,
    limit: int = 100,
    partner_id: Optional[int] = None,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(Estimate.partner)
    )
    if partner_id:
        query = query.where(Estimate.partner_id == partner_id)
    query = query.order_by(desc(Estimate.estimate_date)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/estimates/{estimate_id}", response_model=schemas.Estimate)
async def read_estimate(
    estimate_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(Estimate.partner)
    ).where(Estimate.id == estimate_id)
    result = await db.execute(query)
    estimate = result.scalar_one_or_none()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return estimate

@router.post("/estimates/{estimate_id}/export_excel", response_model=schemas.Estimate)
async def export_estimate_excel(
    estimate_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(Estimate.partner)
    ).where(Estimate.id == estimate_id)
    result = await db.execute(query)
    estimate = result.scalar_one_or_none()

    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")

    try:
        from openpyxl.styles import PatternFill
        import urllib.parse
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "견적서"

        header_font = Font(name='Malgun Gothic', size=16, bold=True)
        bold_font = Font(name='Malgun Gothic', size=10, bold=True)
        normal_font = Font(name='Malgun Gothic', size=10)
        
        center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
        left_align = Alignment(horizontal='left', vertical='center', wrap_text=True)
        right_align = Alignment(horizontal='right', vertical='center')
        
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        gray_fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")

        def style_range(ws, cell_range, border=thin_border, font=normal_font, alignment=center_align, fill=None):
            for row in ws[cell_range]:
                for cell in row:
                    cell.border = border
                    cell.font = font
                    cell.alignment = alignment
                    if fill:
                        cell.fill = fill

        col_widths = {'A': 5, 'B': 25, 'C': 15, 'D': 8, 'E': 8, 'F': 12, 'G': 12, 'H': 15}
        for col, width in col_widths.items():
            ws.column_dimensions[col].width = width

        ws.merge_cells('A1:H2')
        ws['A1'] = "견  적  서"
        ws['A1'].font = header_font
        ws['A1'].alignment = center_align

        ws.merge_cells('A4:D4')
        ws['A4'] = f"일자: {estimate.estimate_date}"
        ws['A4'].alignment = left_align
        
        ws.merge_cells('A5:D5')
        ws['A5'] = f"수신: {estimate.partner.name if estimate.partner else ''} 귀하"
        ws['A5'].alignment = left_align
        ws['A5'].font = bold_font
        
        ws.merge_cells('A6:D6')
        ws['A6'] = f"합계금액: {estimate.total_amount:,.0f} 원 (VAT 별도)"
        ws['A6'].alignment = left_align
        ws['A6'].font = bold_font
        
        ws.merge_cells('E4:E6')
        ws['E4'] = "공급자"
        ws['E4'].font = bold_font
        ws['E4'].alignment = center_align
        ws['E4'].fill = gray_fill
        ws['E4'].border = thin_border
        
        ws.merge_cells('F4:H4')
        ws['F4'] = "상호: (주)디자인메카"
        ws.merge_cells('F5:H5')
        ws['F5'] = "대표: 조인호"
        ws.merge_cells('F6:H6')
        ws['F6'] = "등록번호: xxx-xx-xxxxx" # placeholder if actual doesn't exist
        
        style_range(ws, 'F4:H6', alignment=left_align)
        
        ws['A8'] = "번호"
        ws['B8'] = "품명"
        ws['C8'] = "규격"
        ws['D8'] = "수량"
        ws['E8'] = "단위"
        ws['F8'] = "단가"
        ws['G8'] = "금액"
        ws['H8'] = "비고"
        style_range(ws, 'A8:H8', font=bold_font, fill=gray_fill)

        row_idx = 9
        for idx, item in enumerate(estimate.items):
            ws.cell(row=row_idx, column=1, value=idx+1)
            
            pname = item.product.name if item.product else "-"
            ws.cell(row=row_idx, column=2, value=pname).alignment = left_align
            
            spec = item.product.specification if item.product else "-"
            ws.cell(row=row_idx, column=3, value=spec)
            
            ws.cell(row=row_idx, column=4, value=item.quantity)
            ws.cell(row=row_idx, column=5, value="EA")
            
            ws.cell(row=row_idx, column=6, value=f"{item.unit_price:,.0f}").alignment = right_align
            ws.cell(row=row_idx, column=7, value=f"{(item.quantity * item.unit_price):,.0f}").alignment = right_align
            
            ws.cell(row=row_idx, column=8, value=item.note or "-").alignment = left_align
            
            style_range(ws, f'A{row_idx}:H{row_idx}')
            row_idx += 1

        ws.merge_cells(f'A{row_idx}:E{row_idx}')
        ws[f'A{row_idx}'] = "합계"
        ws[f'A{row_idx}'].font = bold_font
        ws[f'A{row_idx}'].fill = gray_fill
        ws[f'A{row_idx}'].alignment = center_align
        ws.cell(row=row_idx, column=6, value="")
        ws.cell(row=row_idx, column=7, value=f"{estimate.total_amount:,.0f}").alignment = right_align
        ws.cell(row=row_idx, column=7).font = bold_font
        ws.cell(row=row_idx, column=8, value="")
        style_range(ws, f'A{row_idx}:H{row_idx}')
        
        row_idx += 2
        ws.merge_cells(f'A{row_idx}:A{row_idx+1}')
        ws.merge_cells(f'B{row_idx}:H{row_idx+1}')
        ws[f'A{row_idx}'] = "특기사항"
        ws[f'A{row_idx}'].font = bold_font
        ws[f'A{row_idx}'].fill = gray_fill
        ws[f'A{row_idx}'].alignment = center_align
        ws[f'B{row_idx}'] = estimate.note or ""
        ws[f'B{row_idx}'].alignment = left_align
        style_range(ws, f'A{row_idx}:H{row_idx+1}')

        filename = f"Estimate_{estimate.partner.name if estimate.partner else 'Unk'}_{estimate.estimate_date}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        upload_dir = "uploads/estimates"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, filename)
        
        wb.save(file_path)

        file_url = f"/uploads/estimates/{urllib.parse.quote(filename)}"
        new_file = {"name": filename, "url": file_url}
        
        current_files = []
        if estimate.attachment_file:
            if isinstance(estimate.attachment_file, list):
                current_files = estimate.attachment_file
            elif isinstance(estimate.attachment_file, str):
                try:
                    current_files = json.loads(estimate.attachment_file)
                except:
                    pass
        
        current_files.append(new_file)
        
        estimate.attachment_file = current_files
        
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(estimate, "attachment_file")

        db.add(estimate)
        await db.commit()
        await db.refresh(estimate)
        
        query = select(Estimate).options(
            selectinload(Estimate.items).selectinload(EstimateItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(Estimate.partner)
        ).where(Estimate.id == estimate_id)
        result = await db.execute(query)
        return result.scalar_one()

    except Exception as e:
        print(f"Excel Export Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/estimates/{estimate_id}", response_model=schemas.Estimate)
async def update_estimate(
    estimate_id: int,
    estimate_in: schemas.EstimateUpdate,
    db: AsyncSession = Depends(deps.get_db)
):
    # 1. Fetch existing
    query = select(Estimate).options(
        selectinload(Estimate.items),
        selectinload(Estimate.partner)
    ).where(Estimate.id == estimate_id)
    result = await db.execute(query)
    db_estimate = result.scalar_one_or_none()
    
    if not db_estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")

    # 2. Update Header Fields
    update_data = estimate_in.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)
    
    for field, value in update_data.items():
        setattr(db_estimate, field, value)

    # 3. Update Items (Full Replace Strategy)
    if items_data is not None:
        # Delete existing items
        # Note: If we had cascade delete on DB level, this might be easier, 
        # but explicit delete is safer for logic control
        for item in db_estimate.items:
            await db.delete(item)
        
        # Add new items
        for item_in in estimate_in.items:
            db_item = EstimateItem(
                estimate_id=db_estimate.id,
                product_id=item_in.product_id,
                unit_price=item_in.unit_price,
                quantity=item_in.quantity,
                note=item_in.note
            )
            db.add(db_item)

    await db.commit()
    await db.refresh(db_estimate)
    
    # Re-fetch with all eager loads for response
    query = select(Estimate).options(
        selectinload(Estimate.items).selectinload(EstimateItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(Estimate.partner)
    ).where(Estimate.id == estimate_id)
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/estimates/{estimate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_estimate(
    estimate_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(Estimate).options(selectinload(Estimate.items)).where(Estimate.id == estimate_id)
    result = await db.execute(query)
    db_estimate = result.scalar_one_or_none()
    
    if not db_estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
        
    # Delete items first (if not cascading) - SQLAlchemy relationship usually handles this 
    # if cascade="all, delete-orphan" is set. Assuming it might not be, let's rely on DB FK cascade or manual.
    # Checking models... items = relationship("EstimateItem", back_populates="estimate", cascade="all, delete-orphan") is best practice.
    # Use manual delete just in case to be safe without checking model definition deep dive right now.
    for item in db_estimate.items:
        await db.delete(item)
        
    await db.delete(db_estimate)
    await db.commit()
    return None

# --- Orders ---

@router.post("/orders/", response_model=schemas.SalesOrder)
async def create_order(
    order_in: schemas.SalesOrderCreate,
    db: AsyncSession = Depends(deps.get_db)
):
    # Generate Order No
    date_str = datetime.now().strftime("%Y%m%d")
    
    # Async count
    # count = db.query(SalesOrder)...count() -> Not available
    # Use select(func.count())...
    from sqlalchemy import func
    query = select(func.count()).filter(SalesOrder.order_date == datetime.now().date())
    result = await db.execute(query)
    count = result.scalar() or 0
    
    order_no = f"SO-{date_str}-{count+1:03d}"

    db_order = SalesOrder(
        order_no=order_no,
        partner_id=order_in.partner_id,
        order_date=order_in.order_date or datetime.now().date(),
        delivery_date=order_in.delivery_date,
        actual_delivery_date=order_in.actual_delivery_date,
        delivery_method=order_in.delivery_method,
        transaction_date=order_in.transaction_date,
        total_amount=order_in.total_amount,
        note=order_in.note,
        status=order_in.status,
        attachment_file=order_in.attachment_file
    )
    db.add(db_order)
    await db.flush()

    for item in order_in.items:
        db_item = SalesOrderItem(
            order_id=db_order.id,
            product_id=item.product_id,
            unit_price=item.unit_price,
            quantity=item.quantity,
            note=item.note,
            delivered_quantity=item.delivered_quantity
        )
        db.add(db_item)
    
    await db.commit()
    await db.refresh(db_order)
    
    # Eager load for response
    query = select(SalesOrder).options(
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(SalesOrder.partner)
    ).where(SalesOrder.id == db_order.id)
    result = await db.execute(query)
    
    return result.scalar_one()

@router.get("/orders/", response_model=List[schemas.SalesOrder])
async def read_orders(
    skip: int = 0,
    limit: int = 100,
    partner_id: Optional[int] = None,
    status: Optional[str] = None,
    start_date: Union[date, None] = None,
    end_date: Union[date, None] = None,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(SalesOrder).options(
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(SalesOrder.partner)
    )
    if partner_id:
        query = query.where(SalesOrder.partner_id == partner_id)
    if status:
        query = query.where(SalesOrder.status == status)
    if start_date:
        query = query.where(SalesOrder.order_date >= start_date)
    if end_date:
        query = query.where(SalesOrder.order_date <= end_date)

    query = query.order_by(desc(SalesOrder.order_date)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    return result.scalars().all()

@router.put("/orders/{order_id}", response_model=schemas.SalesOrder)
async def update_order(
    order_id: int,
    order_in: schemas.SalesOrderUpdate, # Use Update schema
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(SalesOrder).options(selectinload(SalesOrder.items)).where(SalesOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update Header
    if order_in.partner_id is not None: db_order.partner_id = order_in.partner_id
    if order_in.order_date is not None: db_order.order_date = order_in.order_date
    if order_in.delivery_date is not None: db_order.delivery_date = order_in.delivery_date
    if order_in.actual_delivery_date is not None: db_order.actual_delivery_date = order_in.actual_delivery_date
    if order_in.delivery_method is not None: db_order.delivery_method = order_in.delivery_method
    if order_in.transaction_date is not None: db_order.transaction_date = order_in.transaction_date
    if order_in.total_amount is not None: db_order.total_amount = order_in.total_amount
    if order_in.note is not None: db_order.note = order_in.note
    if order_in.status is not None: db_order.status = order_in.status
    if order_in.attachment_file is not None: db_order.attachment_file = order_in.attachment_file
    
    # Update Items
    if order_in.items is not None:
        # Delete all and recreate (Simple Strategy)
        # Verify if we need to preserve IDs? 
        # For delivery update, we might be sending delivered_quantity.
        # If we recreate, we lose previous delivered_quantity if not passed back.
        # But Create schema doesn't have delivered_quantity?
        # Check SalesOrderItemCreate: No delivered_quantity.
        # SalesOrderItemSimple has it.
        # If we use SalesOrderItemCreate, we reset delivered_quantity to 0 (default in model).
        # THIS IS A PROBLEM for Partial Delivery.
        # But user said "Double click... record... Delivery Complete".
        # This implies a one-time event or they enter the full amount.
        # If they enter full amount, we need to save it. 
        # But logic below recreates items using `SalesOrderItem` (model default 0).
        # I need to handle `delivered_quantity` if passed.
        # Schema `SalesOrderItemCreate` does NOT have `delivered_quantity`.
        # I should add it to schema or handle it.
        # Given simpler scope, let's assume they update full status.
        # But "actual delivery quantity" was requested.
        # So I MUST update `SalesOrderItemCreate` schema or handle it here.
        # Modifying schema is better.
        pass
    
    # Update Items
    # Delete all and recreate
    for item in db_order.items:
        await db.delete(item)
        
    for item in order_in.items:
        db_item = SalesOrderItem(
            order_id=db_order.id,
            product_id=item.product_id,
            unit_price=item.unit_price,
            quantity=item.quantity,
            note=item.note,
            delivered_quantity=item.delivered_quantity
        )
        db.add(db_item)
        
    await db.commit()
    await db.refresh(db_order)
    
    # Re-fetch
    query = select(SalesOrder).options(
        selectinload(SalesOrder.items).selectinload(SalesOrderItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
        selectinload(SalesOrder.partner)
    ).where(SalesOrder.id == order_id)
    result = await db.execute(query)
    return result.scalar_one()

@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    query = select(SalesOrder).options(selectinload(SalesOrder.items)).where(SalesOrder.id == order_id)
    result = await db.execute(query)
    db_order = result.scalar_one_or_none()
    
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Cascade delete 연관 데이터 (의존 관계 역순 및 명시적 삭제)
    # 1. 연관된 생산 계획 ID들 가져오기
    plans_query = select(ProductionPlan.id).where(ProductionPlan.order_id == order_id)
    plans_result = await db.execute(plans_query)
    plan_ids = plans_result.scalars().all()

    if plan_ids:
        # 2. 연관된 생산 공정(Item) ID들 가져오기
        items_query = select(ProductionPlanItem.id).where(ProductionPlanItem.plan_id.in_(plan_ids))
        items_result = await db.execute(items_query)
        item_ids = items_result.scalars().all()

        if item_ids:
            # 3. 작업 지시 및 검사 결과 삭제
            wo_query = select(WorkOrder.id).where(WorkOrder.plan_item_id.in_(item_ids))
            wo_result = await db.execute(wo_query)
            wo_ids = wo_result.scalars().all()
            
            if wo_ids:
                await db.execute(delete(InspectionResult).where(InspectionResult.work_order_id.in_(wo_ids)))
                await db.execute(delete(WorkOrder).where(WorkOrder.id.in_(wo_ids)))

            # 4. 발주 품목 삭제 (ProductionPlanItem 참조)
            await db.execute(delete(PurchaseOrderItem).where(PurchaseOrderItem.production_plan_item_id.in_(item_ids)))
            await db.execute(delete(OutsourcingOrderItem).where(OutsourcingOrderItem.production_plan_item_id.in_(item_ids)))

            # 5. 불량 내역 삭제 (계획 아이템 기준)
            await db.execute(delete(QualityDefect).where(QualityDefect.plan_item_id.in_(item_ids)))
            
            # 6. 생산 공정 아이템 삭제
            await db.execute(delete(ProductionPlanItem).where(ProductionPlanItem.id.in_(item_ids)))
        
        # 7. 불량 내역 삭제 (계획 기준 - 아이템이 없는 경우 대비)
        await db.execute(delete(QualityDefect).where(QualityDefect.plan_id.in_(plan_ids)))

        # 8. 생산 계획 삭제
        await db.execute(delete(ProductionPlan).where(ProductionPlan.id.in_(plan_ids)))
    
    # 9. 불량 내역 삭제 (수주 기준 직접 링크된 것들)
    await db.execute(delete(QualityDefect).where(QualityDefect.order_id == order_id))
    
    # 10. 수주 품목 삭제
    await db.execute(delete(SalesOrderItem).where(SalesOrderItem.order_id == order_id))
        
    # 11. 수주 헤더 삭제
    await db.delete(db_order)
    await db.commit()
    return None

# --- History & Helper Endpoints ---

@router.get("/history/price")
async def get_recent_price(
    product_id: int,
    partner_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    """
    Get the most recent unit price for a product and partner.
    Checks SalesOrder first, then Estimate.
    """
    # Check last order
    # Joined eager load or just join? We just need unit_price and date.
    # Joining gives us filtered rows.
    query = select(SalesOrderItem).join(SalesOrder)\
        .options(selectinload(SalesOrderItem.order))\
        .where(SalesOrderItem.product_id == product_id)\
        .where(SalesOrder.partner_id == partner_id)\
        .order_by(desc(SalesOrder.order_date))\
        .limit(1)
        
    result = await db.execute(query)
    last_order_item = result.scalar_one_or_none()
    
    if last_order_item:
        return {"price": last_order_item.unit_price, "source": "order", "date": last_order_item.order.order_date}
    
    # Check last estimate
    query = select(EstimateItem).join(Estimate)\
        .options(selectinload(EstimateItem.estimate))\
        .where(EstimateItem.product_id == product_id)\
        .where(Estimate.partner_id == partner_id)\
        .order_by(desc(Estimate.estimate_date))\
        .limit(1)
        
    result = await db.execute(query)
    last_estimate_item = result.scalar_one_or_none()
        
    if last_estimate_item:
        return {"price": last_estimate_item.unit_price, "source": "estimate", "date": last_estimate_item.estimate.estimate_date}

    return {"price": 0, "source": None}

@router.get("/history/product/{product_id}")
async def get_product_sales_history(
    product_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    """Get all sales history (Estimates and Orders) for a product"""
    # Estimates
    query_est = select(EstimateItem).join(Estimate)\
        .options(selectinload(EstimateItem.estimate).selectinload(Estimate.partner))\
        .where(EstimateItem.product_id == product_id)\
        .order_by(desc(Estimate.estimate_date))
    result_est = await db.execute(query_est)
    estimates = result_est.scalars().all()

    # Orders
    query_ord = select(SalesOrderItem).join(SalesOrder)\
        .options(selectinload(SalesOrderItem.order).selectinload(SalesOrder.partner))\
        .where(SalesOrderItem.product_id == product_id)\
        .order_by(desc(SalesOrder.order_date))
    result_ord = await db.execute(query_ord)
    orders = result_ord.scalars().all()
    
    history = []
    for e in estimates:
        history.append({
            "type": "ESTIMATE",
            "date": e.estimate.estimate_date,
            "partner_name": e.estimate.partner.name if e.estimate.partner else "Unknown",
            "quantity": e.quantity,
            "unit_price": e.unit_price
        })
    for o in orders:
        history.append({
            "type": "ORDER",
            "date": o.order.order_date,
            "partner_name": o.order.partner.name if o.order.partner else "Unknown",
            "quantity": o.quantity,
            "unit_price": o.unit_price
        })
        
    # Sort by date
    history.sort(key=lambda x: x['date'], reverse=True)
    return history
