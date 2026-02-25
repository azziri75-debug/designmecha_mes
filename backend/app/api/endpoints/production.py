from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.product import Product, ProductProcess, Process
from app.models.purchasing import PurchaseOrderItem, OutsourcingOrderItem, PurchaseOrder, OutsourcingOrder, PurchaseStatus, OutsourcingStatus
from app.models.basics import Partner
from app.models.inventory import StockProduction, StockProductionStatus, Stock
from app.schemas import production as schemas
from datetime import datetime
import uuid
import json
import os
import urllib.parse
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter

router = APIRouter()

@router.get("/plans", response_model=List[schemas.ProductionPlan])
async def read_production_plans(
    skip: int = 0,
    limit: int = 1000,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Retrieve production plans.
    """
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)
        )
        .offset(skip).limit(limit)
    )
    plans = result.scalars().all()
    return plans

@router.post("/plans", response_model=schemas.ProductionPlan)
async def create_production_plan(
    plan_in: schemas.ProductionPlanCreate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Create a production plan from a Sales Order or Stock Production.
    Auto-generates plan items based on Product Processes.
    """
    # 1. Check if Order or StockProduction exists
    if plan_in.order_id:
        result = await db.execute(select(SalesOrder).where(SalesOrder.id == plan_in.order_id))
        order = result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Sales Order not found")
            
        # Check if ACTIVE Plan already exists for this order
        result = await db.execute(select(ProductionPlan).where(
            ProductionPlan.order_id == plan_in.order_id,
            cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value
        ))
        if result.scalar_one_or_none():
            # Return existing active plan instead of error (Idempotency)
            result = await db.execute(
                select(ProductionPlan)
                .options(
                    selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                    selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                    selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
                    selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
                    selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner)
                )
                .where(ProductionPlan.order_id == plan_in.order_id, cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value)
            )
            return result.scalar_one()
    elif plan_in.stock_production_id:
        result = await db.execute(select(StockProduction).where(StockProduction.id == plan_in.stock_production_id))
        sp = result.scalar_one_or_none()
        if not sp:
            raise HTTPException(status_code=404, detail="Stock Production request not found")
        
        # Check if ACTIVE Plan already exists for this stock production
        result = await db.execute(select(ProductionPlan).where(
            ProductionPlan.stock_production_id == plan_in.stock_production_id,
            cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value
        ))
        if result.scalar_one_or_none():
            # Return existing active plan instead of error (Idempotency)
            result = await db.execute(
                select(ProductionPlan)
                .options(
                    selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
                    selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
                    selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
                    selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
                    selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner)
                )
                .where(ProductionPlan.stock_production_id == plan_in.stock_production_id, cast(ProductionPlan.status, String) != ProductionStatus.CANCELED.value)
            )
            return result.scalar_one()
    else:
        raise HTTPException(status_code=400, detail="Either order_id or stock_production_id is required")

    # 3. Create Plan Header
    plan = ProductionPlan(
        order_id=plan_in.order_id,
        stock_production_id=plan_in.stock_production_id,
        plan_date=plan_in.plan_date,
        status=ProductionStatus.IN_PROGRESS
    )
    db.add(plan)
    await db.flush()
    
    # 4. Generate Items
    if plan_in.items:
        for item_in in plan_in.items:
            plan_item = ProductionPlanItem(
                plan_id=plan.id,
                product_id=item_in.product_id,
                process_name=item_in.process_name,
                sequence=item_in.sequence,
                course_type=item_in.course_type,
                partner_name=item_in.partner_name,
                work_center=item_in.work_center,
                estimated_time=item_in.estimated_time,
                start_date=item_in.start_date,
                end_date=item_in.end_date,
                worker_id=item_in.worker_id,
                equipment_id=item_in.equipment_id,
                note=item_in.note,
                status=item_in.status,
                attachment_file=item_in.attachment_file,
                quantity=item_in.quantity
            )
            db.add(plan_item)
    else:
        # Default logic for Sales Order (already exists) or Stock Production
        # If stock production, it's usually just one product.
        if plan_in.stock_production_id:
            # Fetch StockProduction to get product_id and quantity
            res = await db.execute(select(StockProduction).where(StockProduction.id == plan_in.stock_production_id))
            sp = res.scalar_one()
            
            # Fetch processes
            stmt = (
                select(ProductProcess, Process.name, Process.course_type)
                .join(Process, ProductProcess.process_id == Process.id)
                .where(ProductProcess.product_id == sp.product_id)
                .order_by(ProductProcess.sequence)
            )
            result = await db.execute(stmt)
            processes = result.all()
            
            for proc, proc_name, proc_course_type in processes:
                final_course_type = proc.course_type or proc_course_type or "INTERNAL"
                plan_item = ProductionPlanItem(
                    plan_id=plan.id,
                    product_id=sp.product_id,
                    process_name=proc_name,
                    sequence=proc.sequence,
                    course_type=final_course_type,
                    partner_name=proc.partner_name,
                    work_center=proc.equipment_name,
                    estimated_time=proc.estimated_time,
                    attachment_file=proc.attachment_file,
                    quantity=sp.quantity,
                    status=ProductionStatus.PLANNED
                )
                db.add(plan_item)
        else:
            # Sales Order logic (restored)
            result = await db.execute(select(SalesOrderItem).where(SalesOrderItem.order_id == plan_in.order_id))
            order_items = result.scalars().all()
            for item in order_items:
                stmt = (
                    select(ProductProcess, Process.name, Process.course_type)
                    .join(Process, ProductProcess.process_id == Process.id)
                    .where(ProductProcess.product_id == item.product_id)
                    .order_by(ProductProcess.sequence)
                )
                result = await db.execute(stmt)
                processes = result.all()
                for proc, proc_name, proc_course_type in processes:
                    final_course_type = proc.course_type or proc_course_type or "INTERNAL"
                    plan_item = ProductionPlanItem(
                        plan_id=plan.id,
                        product_id=item.product_id,
                        process_name=proc_name,
                        sequence=proc.sequence,
                        course_type=final_course_type,
                        partner_name=proc.partner_name,
                        work_center=proc.equipment_name,
                        estimated_time=proc.estimated_time,
                        attachment_file=proc.attachment_file,
                        quantity=item.quantity,
                        status=ProductionStatus.PLANNED
                    )
                    db.add(plan_item)

    await db.commit()
    await db.refresh(plan)
    
    # Reload logic (Update options to include stock_production)
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).joinedload(ProductProcess.process),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner)
        )
        .where(ProductionPlan.id == plan.id)
    )
    plan = result.scalar_one()
    return plan

@router.put("/plans/{plan_id}", response_model=schemas.ProductionPlan)
async def update_production_plan(
    plan_id: int,
    plan_in: schemas.ProductionPlanUpdate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Update a production plan.
    """
    # 1. Fetch Plan
    result = await db.execute(select(ProductionPlan).options(selectinload(ProductionPlan.items)).where(ProductionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")

    # 2. Update Header
    update_data = plan_in.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)
    
    for field, value in update_data.items():
        setattr(plan, field, value)
        
    # 3. Update Items (Replace Strategy)
    if items_data is not None:
        # Delete existing items
        # SQLAlchemy cascade="all, delete-orphan" on relationship handles deletion from DB
        # when we remove them from the list, IF configured. 
        # But explicitly deleting is clearer for async session sometimes.
        # Let's try clearing the list which should trigger delete-orphan.
        plan.items.clear()
        
        # Add new items
        for item_in in items_data:
            # Schema was missing quantity. Added it now.
            new_item = ProductionPlanItem(
                plan_id=plan.id,
                product_id=item_in.get("product_id") or item_in.get("product", {}).get("id"),
                process_name=item_in.get("process_name"),
                sequence=item_in.get("sequence"),
                course_type=item_in.get("course_type", "INTERNAL"),
                partner_name=item_in.get("partner_name"),
                work_center=item_in.get("work_center"),
                estimated_time=item_in.get("estimated_time"),
                start_date=item_in.get("start_date"),
                end_date=item_in.get("end_date"),
                worker_id=item_in.get("worker_id"),
                equipment_id=item_in.get("equipment_id"),
                note=item_in.get("note"),
                status=item_in.get("status", ProductionStatus.PLANNED),
                attachment_file=item_in.get("attachment_file"),
                quantity=item_in.get("quantity", 1)
            )
            plan.items.append(new_item)

    await db.commit()
    await db.refresh(plan)
    
    await db.commit()
    await db.refresh(plan)
    
    # Re-fetch for response
    # Re-fetch with full options for response
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner), # Deep Load
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one()
    return plan

@router.post("/plans/{plan_id}/export_excel", response_model=schemas.ProductionPlan)
async def export_production_plan_excel(
    plan_id: int,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Generate an Excel file for the Production Plan and attach it.
    """
    # 1. Fetch Plan with all relations
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")

    # 2. Parse Metadata
    metadata = {}
    if plan.sheet_metadata:
        try:
            metadata = json.loads(plan.sheet_metadata) if isinstance(plan.sheet_metadata, str) else plan.sheet_metadata
        except:
            pass
            
    order = plan.order

    # 3. Create Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "생산관리시트"

    # Define Styles
    header_font = Font(name='Malgun Gothic', size=14, bold=True)
    bold_font = Font(name='Malgun Gothic', size=10, bold=True)
    normal_font = Font(name='Malgun Gothic', size=10)
    
    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left_align = Alignment(horizontal='left', vertical='center', wrap_text=True)
    
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
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

    col_widths = {'A': 10, 'B': 10, 'C': 15, 'D': 25, 'E': 15, 'F': 12, 'G': 12, 'H': 10, 'I': 10, 'J': 10}
    for col, width in col_widths.items():
        ws.column_dimensions[col].width = width

    ws.merge_cells('A1:J2')
    title_cell = ws['A1']
    title_cell.value = "생산관리시트"
    title_cell.font = header_font
    title_cell.alignment = center_align

    ws.merge_cells('B4:E4')
    ws.merge_cells('G4:J4')
    ws['A4'] = "고객"
    ws['B4'] = order.partner.name if order and order.partner else "-"
    ws['F4'] = "수주일"
    ws['G4'] = str(order.order_date) if order and order.order_date else "-"
    
    ws.merge_cells('B5:E5')
    ws.merge_cells('G5:J5')
    ws['A5'] = "품명"
    unique_products = []
    seen = set()
    for item in plan.items:
        if item.product and item.product.id not in seen:
            seen.add(item.product.id)
            unique_products.append({"product": item.product, "quantity": item.quantity, "note": item.note})
            
    summary_prod_name = "-"
    if unique_products:
        summary_prod_name = unique_products[0]["product"].name
        if len(unique_products) > 1:
            summary_prod_name += f" 외 {len(unique_products) - 1}건"
            
    ws['B5'] = summary_prod_name
    ws['F5'] = "요구납기일"
    ws['G5'] = str(order.delivery_date) if order and order.delivery_date else "-"

    ws.merge_cells('B6:E6')
    ws.merge_cells('G6:J6')
    ws['A6'] = "수주금액"
    ws['B6'] = metadata.get('order_amount', str(order.total_amount) if order else "-")
    ws['F6'] = "수주담당자"
    ws['G6'] = metadata.get('manager', "-")

    style_range(ws, 'A4:A6', font=bold_font, fill=gray_fill)
    style_range(ws, 'F4:F6', font=bold_font, fill=gray_fill)
    style_range(ws, 'A4:J6')

    start_row = 8
    ws.merge_cells(f'A{start_row}:C{start_row}')
    ws.merge_cells(f'D{start_row}:F{start_row}')
    ws.merge_cells(f'G{start_row}:H{start_row}')
    ws.merge_cells(f'I{start_row}:J{start_row}')
    
    ws[f'A{start_row}'] = "품명"
    ws[f'D{start_row}'] = "규격"
    ws[f'G{start_row}'] = "재질"
    ws[f'I{start_row}'] = "수량"
    style_range(ws, f'A{start_row}:J{start_row}', font=bold_font, fill=gray_fill)

    curr_row = start_row + 1
    for prod_info in unique_products:
        ws.merge_cells(f'A{curr_row}:C{curr_row}')
        ws.merge_cells(f'D{curr_row}:F{curr_row}')
        ws.merge_cells(f'G{curr_row}:H{curr_row}')
        ws.merge_cells(f'I{curr_row}:J{curr_row}')
        
        ws[f'A{curr_row}'] = prod_info["product"].name
        ws[f'D{curr_row}'] = prod_info["product"].specification or "-"
        ws[f'G{curr_row}'] = prod_info["product"].material or "-"
        ws[f'I{curr_row}'] = prod_info["quantity"]
        
        style_range(ws, f'A{curr_row}:J{curr_row}', alignment=center_align)
        ws[f'A{curr_row}'].alignment = left_align
        curr_row += 1

    while curr_row < start_row + 4:
        ws.merge_cells(f'A{curr_row}:C{curr_row}')
        ws.merge_cells(f'D{curr_row}:F{curr_row}')
        ws.merge_cells(f'G{curr_row}:H{curr_row}')
        ws.merge_cells(f'I{curr_row}:J{curr_row}')
        style_range(ws, f'A{curr_row}:J{curr_row}')
        curr_row += 1

    memo_row = curr_row + 1
    ws.merge_cells(f'A{memo_row}:A{memo_row+1}')
    ws.merge_cells(f'B{memo_row}:J{memo_row+1}')
    ws[f'A{memo_row}'] = "Memo"
    ws[f'B{memo_row}'] = metadata.get('memo', "")
    style_range(ws, f'A{memo_row}:A{memo_row+1}', font=bold_font, fill=gray_fill)
    style_range(ws, f'B{memo_row}:J{memo_row+1}', alignment=left_align)

    proc_start_row = memo_row + 3
    headers = ["구분", "순번", "공정", "공정내용", "업체", "품명", "규격", "수량", "시작", "종료"]
    for i, h in enumerate(headers):
        cell = ws.cell(row=proc_start_row, column=i+1, value=h)
        cell.font = bold_font
        cell.fill = gray_fill
        cell.border = thin_border
        cell.alignment = center_align

    proc_row = proc_start_row + 1
    def get_type_label(ctype):
        if not ctype: return "-"
        if "INTERNAL" in ctype or "자가" in ctype: return "자가"
        if "OUTSOURCING" in ctype or "외주" in ctype: return "외주"
        if "PURCHASE" in ctype or "구매" in ctype: return "구매"
        return ctype
        
    for idx, item in enumerate(plan.items):
        ws.cell(row=proc_row, column=1, value=get_type_label(item.course_type))
        ws.cell(row=proc_row, column=2, value=item.sequence or (idx + 1))
        ws.cell(row=proc_row, column=3, value=item.process_name or "-")
        
        note_cell = ws.cell(row=proc_row, column=4, value=item.note or "-")
        note_cell.alignment = left_align
        
        partner_cell = ws.cell(row=proc_row, column=5, value=item.partner_name or "-")
        partner_cell.alignment = left_align
        
        ws.cell(row=proc_row, column=6, value="-")
        ws.cell(row=proc_row, column=7, value="-")
        ws.cell(row=proc_row, column=8, value=item.quantity)
        ws.cell(row=proc_row, column=9, value=str(item.start_date) if item.start_date else "-")
        ws.cell(row=proc_row, column=10, value=str(item.end_date) if item.end_date else "-")
        
        style_range(ws, f'A{proc_row}:J{proc_row}')
        proc_row += 1

    upload_dir = "uploads/production"
    os.makedirs(upload_dir, exist_ok=True)
    
    filename = f"ProductionSheet_{plan.id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    file_path = os.path.join(upload_dir, filename)
    wb.save(file_path)

    file_url = f"/uploads/production/{urllib.parse.quote(filename)}"
    new_attachment = {
        "url": file_url,
        "name": filename
    }

    current_attachments = []
    if plan.attachment_file:
        try:
           current_attachments = json.loads(plan.attachment_file) if isinstance(plan.attachment_file, str) else plan.attachment_file
           if not isinstance(current_attachments, list):
               current_attachments = [current_attachments]
        except:
            pass

    current_attachments.append(new_attachment)
    plan.attachment_file = current_attachments

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(plan, "attachment_file")

    db.add(plan)
    await db.commit()
    
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).selectinload(ProductProcess.process),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner), 
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner)
        )
        .where(ProductionPlan.id == plan.id)
    )
    return result.scalar_one()

async def check_and_complete_production_plan(db: AsyncSession, plan_id: int):
    """
    모든 공정이 완료되었는지 확인하고, 그렇다면 생산 계획을 완료 처리합니다.
    """
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(ProductionPlan).options(selectinload(ProductionPlan.items)).where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    if not plan or not plan.items:
        return

    all_completed = all(item.status == ProductionStatus.COMPLETED for item in plan.items)
    if all_completed and plan.status != ProductionStatus.COMPLETED:
        # update_production_plan_status의 로직을 수행하기 위해 해당 함수를 직접 호출하거나
        # 로직을 여기에 복제/호출합니다. 여기서는 안전하게 상태만 변경하고 side effect를 위해
        # 필요한 최소한의 처리를 수행하거나, 아예 PATCH 엔드포인트 로직을 재사용합니다.
        await update_production_plan_status(plan_id, ProductionStatus.COMPLETED, db)

@router.delete("/plans/{plan_id}", status_code=200)
async def delete_production_plan(
    plan_id: int,
    delete_related_orders: bool = False,
    db: AsyncSession = Depends(deps.get_db),
):
    """
    Delete a production plan.
    If delete_related_orders=True, also delete linked PO/OO.
    Otherwise, unlink them.
    """
    result = await db.execute(select(ProductionPlan).where(ProductionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")
    
    # 0. Manual Cleanup for linked records that might have FK constraints
    from app.models.quality import QualityDefect
    from app.models.production import WorkOrder
    
    # Delete Quality Defects linked to this plan
    qd_stmt = select(QualityDefect).where(QualityDefect.plan_id == plan_id)
    qd_result = await db.execute(qd_stmt)
    for qd in qd_result.scalars().all():
        await db.delete(qd)
        
    # Delete Work Orders linked to this plan's items
    wo_stmt = select(WorkOrder).join(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan_id)
    wo_result = await db.execute(wo_stmt)
    for wo in wo_result.scalars().all():
        await db.delete(wo)
    
    # Find linked Purchase Order Items
    stmt_po = select(PurchaseOrderItem).join(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan_id)
    result_po = await db.execute(stmt_po)
    po_items = result_po.scalars().all()
    
    # Find linked Outsourcing Order Items
    stmt_oo = select(OutsourcingOrderItem).join(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan_id)
    result_oo = await db.execute(stmt_oo)
    oo_items = result_oo.scalars().all()
    
    if delete_related_orders:
        # Collect unique order IDs to delete
        po_ids = set(item.purchase_order_id for item in po_items)
        oo_ids = set(item.outsourcing_order_id for item in oo_items)
        
        # Delete Purchase Orders
        for po_id in po_ids:
            po_result = await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id))
            po = po_result.scalar_one_or_none()
            if po:
                await db.delete(po)
        
        # Delete Outsourcing Orders
        for oo_id in oo_ids:
            oo_result = await db.execute(select(OutsourcingOrder).where(OutsourcingOrder.id == oo_id))
            oo = oo_result.scalar_one_or_none()
            if oo:
                await db.delete(oo)
    else:
        # Unlink only
        for po_item in po_items:
            po_item.production_plan_item_id = None
            db.add(po_item)
        for oo_item in oo_items:
            oo_item.production_plan_item_id = None
            db.add(oo_item)

    await db.delete(plan)
    await db.commit()
    return {"message": "Production Plan deleted successfully"}

@router.patch("/plans/{plan_id}/status", response_model=schemas.ProductionPlan)
async def update_production_plan_status(
    plan_id: int,
    status: ProductionStatus,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Update production plan status.
    If COMPLETED, update SalesOrder status to PRODUCTION_COMPLETED.
    """
    # Eager load items and linked orders
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.items).selectinload(SalesOrderItem.product)
        )
        .where(ProductionPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Production Plan not found")
        
    old_status = plan.status
    plan.status = status
    
    # Auto-Complete Logic
    if status == ProductionStatus.COMPLETED:
        affected_po_ids = set()
        affected_oo_ids = set()
        
        for item in plan.items:
            # 1. Update Purchase Items
            for po_item in item.purchase_items:
                # Set received quantity to full
                if po_item.quantity > po_item.received_quantity:
                    po_item.received_quantity = po_item.quantity
                    db.add(po_item)
                affected_po_ids.add(po_item.purchase_order_id)
                
            # 2. Update Outsourcing Items
            for oo_item in item.outsourcing_items:
                if oo_item.status != OutsourcingStatus.COMPLETED:
                    oo_item.status = OutsourcingStatus.COMPLETED
                    db.add(oo_item)
                affected_oo_ids.add(oo_item.outsourcing_order_id)
        
        await db.flush()
        
        # 3. Check and Complete Purchase Orders
        for po_id in affected_po_ids:
            po_query = select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.id == po_id)
            po_result = await db.execute(po_query)
            po = po_result.scalar_one_or_none()
            
            if po:
                # Check if all items are fully received
                all_received = all(i.received_quantity >= i.quantity for i in po.items)
                if all_received:
                    po.status = PurchaseStatus.COMPLETED
                    po.delivery_date = datetime.now().date() # Set actual delivery date?
                    db.add(po)

        # 4. Check and Complete Outsourcing Orders
        for oo_id in affected_oo_ids:
            oo_query = select(OutsourcingOrder).options(selectinload(OutsourcingOrder.items)).where(OutsourcingOrder.id == oo_id)
            oo_result = await db.execute(oo_query)
            oo = oo_result.scalar_one_or_none()
            
            if oo:
                # Check if all items are completed
                all_completed = all(i.status == OutsourcingStatus.COMPLETED for i in oo.items)
                if all_completed:
                    oo.status = OutsourcingStatus.COMPLETED
                    oo.delivery_date = datetime.now().date()
                    db.add(oo)

    # Sync with Sales Order or Stock Production
    if status == ProductionStatus.COMPLETED:
        # 1. Update Stocks
        
        if plan.stock_production:
            # For Stock Production: Update exact product and quantity from the request
            sp = plan.stock_production
            stock_query = select(Stock).where(Stock.product_id == sp.product_id)
            s_res = await db.execute(stock_query)
            stock = s_res.scalar_one_or_none()
            
            if not stock:
                stock = Stock(product_id=sp.product_id, current_quantity=sp.quantity)
                db.add(stock)
            else:
                stock.current_quantity += sp.quantity
                if stock.in_production_quantity >= sp.quantity:
                    stock.in_production_quantity -= sp.quantity
            
            # Sync StockProduction status
            sp.status = StockProductionStatus.COMPLETED
            db.add(sp)
            
            # --- Sync Outsourcing Orders ---
            # If this production has linked outsourcing items, update them and their orders
            for item in plan.items:
                for oo_item in item.outsourcing_items:
                    oo_item.status = OutsourcingStatus.COMPLETED
                    db.add(oo_item)
                    
                    oo = oo_item.outsourcing_order
                    if oo:
                        # Check if ALL items in this OutsourcingOrder are COMPLETED
                        all_completed = True
                        for other_item in oo.items:
                            # Use current in-memory status if available, else DB status
                            current_item_status = other_item.status
                            if other_item.id == oo_item.id:
                                current_item_status = OutsourcingStatus.COMPLETED
                                
                            if current_item_status != OutsourcingStatus.COMPLETED:
                                all_completed = False
                                break
                        
                        if all_completed:
                            oo.status = OutsourcingStatus.COMPLETED
                            db.add(oo)
            
        elif plan.order:
            # For Sales Order: Update stocks for all items in the order
            # (Assuming the plan covers the entire order, or at least we treat its completion as the order items being ready)
            for item in plan.order.items:
                stock_query = select(Stock).where(Stock.product_id == item.product_id)
                s_res = await db.execute(stock_query)
                stock = s_res.scalar_one_or_none()
                
                if not stock:
                    stock = Stock(product_id=item.product_id, current_quantity=item.quantity)
                    db.add(stock)
                else:
                    stock.current_quantity += item.quantity
                    if stock.in_production_quantity >= item.quantity:
                        stock.in_production_quantity -= item.quantity
            
            # Sync Sales Order status
            plan.order.status = OrderStatus.PRODUCTION_COMPLETED
            db.add(plan.order)
            
    # Rollback Logic (COMPLETED -> IN_PROGRESS)
    elif old_status == ProductionStatus.COMPLETED and status == ProductionStatus.IN_PROGRESS:
        # 1. Rollback Stocks
        if plan.stock_production:
            sp = plan.stock_production
            stock_query = select(Stock).where(Stock.product_id == sp.product_id)
            s_res = await db.execute(stock_query)
            stock = s_res.scalar_one_or_none()
            if stock:
                # Subtract from current, add back to in_production
                stock.current_quantity = max(0, stock.current_quantity - sp.quantity)
                stock.in_production_quantity += sp.quantity
            sp.status = StockProductionStatus.IN_PROGRESS
            db.add(sp)
        elif plan.order:
            for item in plan.order.items:
                stock_query = select(Stock).where(Stock.product_id == item.product_id)
                s_res = await db.execute(stock_query)
                stock = s_res.scalar_one_or_none()
                if stock:
                    stock.current_quantity = max(0, stock.current_quantity - item.quantity)
                    stock.in_production_quantity += item.quantity
            plan.order.status = OrderStatus.CONFIRMED
            db.add(plan.order)

        # 2. Rollback Linked Orders (Back to PENDING)
        affected_po_ids = set()
        affected_oo_ids = set()
        for item in plan.items:
            for po_item in item.purchase_items:
                # Revert received quantity? 
                # (User said "대기 상태로 변경", which usually means received_quantity = 0 or status = PENDING)
                po_item.received_quantity = 0
                db.add(po_item)
                affected_po_ids.add(po_item.purchase_order_id)
            
            for oo_item in item.outsourcing_items:
                oo_item.status = OutsourcingStatus.PENDING
                db.add(oo_item)
                affected_oo_ids.add(oo_item.outsourcing_order_id)
        
        await db.flush()

        # Update PurchaseOrder statuses
        for po_id in affected_po_ids:
            po = await db.get(PurchaseOrder, po_id)
            if po:
                po.status = PurchaseStatus.PENDING
                db.add(po)
        
        # Update OutsourcingOrder statuses
        for oo_id in affected_oo_ids:
            oo = await db.get(OutsourcingOrder, oo_id)
            if oo:
                oo.status = OutsourcingStatus.PENDING
                db.add(oo)

    elif status == ProductionStatus.IN_PROGRESS:
        if plan.order:
            plan.order.status = OrderStatus.CONFIRMED 
            db.add(plan.order)
        elif plan.stock_production:
            plan.stock_production.status = StockProductionStatus.IN_PROGRESS
            db.add(plan.stock_production)
        
    await db.commit()
    
    # Re-fetch with full options for response
    result = await db.execute(
        select(ProductionPlan)
        .options(
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product).selectinload(Product.standard_processes).joinedload(ProductProcess.process),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order),
            selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.order).selectinload(SalesOrder.partner),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),
            selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner)
        )
        .where(ProductionPlan.id == plan_id)
    )
    return result.scalar_one()

@router.patch("/plan-items/{item_id}", response_model=schemas.ProductionPlanItem)
async def update_production_plan_item(
    item_id: int,
    item_in: schemas.ProductionPlanItemUpdate,
    db: AsyncSession = Depends(deps.get_db),
) -> Any:
    """
    Update a single production plan item (status, attachment, etc).
    """
    result = await db.execute(select(ProductionPlanItem).where(ProductionPlanItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Plan Item not found")

    update_data = item_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    
    # --- Auto-Complete Check ---
    if "status" in update_data and update_data["status"] == ProductionStatus.COMPLETED:
        await check_and_complete_production_plan(db, item.plan_id)
    
    # Reload for full schema
    result = await db.execute(
        select(ProductionPlanItem)
        .options(
            selectinload(ProductionPlanItem.product),
            selectinload(ProductionPlanItem.purchase_items).selectinload(PurchaseOrderItem.purchase_order),
            selectinload(ProductionPlanItem.outsourcing_items).selectinload(OutsourcingOrderItem.outsourcing_order)
        )
        .where(ProductionPlanItem.id == item_id)
    )
    return result.scalar_one()
