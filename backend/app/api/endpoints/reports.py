from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import pandas as pd
import io
from datetime import datetime
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.production import ProductionPlan
from app.models.product import Product
from app.models.basics import Partner

router = APIRouter()

@router.get("/orders/excel")
async def export_orders_excel(
    db: AsyncSession = Depends(get_db)
):
    query = select(SalesOrder).options(selectinload(SalesOrder.partner), selectinload(SalesOrder.items).selectinload(SalesOrderItem.product))
    result = await db.execute(query)
    orders = result.scalars().all()
    
    data = []
    for order in orders:
        for item in order.items:
            data.append({
                "수주번호": order.order_no,
                "거래처": order.partner.name if order.partner else "",
                "제품명": item.product.name if item.product else "",
                "수량": item.quantity,
                "단가": item.unit_price,
                "총액": item.quantity * item.unit_price,
                "수주일": order.order_date,
                "납기일": order.delivery_date,
                "상태": order.status.value,
                "납품일": None, # Delivered date logic needs to be checked
                "납품자": ""
            })
    
    df = pd.DataFrame(data)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Orders')
    
    output.seek(0)
    
    filename = f"orders_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/production/excel")
async def export_production_excel(
    db: AsyncSession = Depends(get_db)
):
    # ProductionPlan -> SalesOrderItem -> Product
    query = select(ProductionPlan).options(selectinload(ProductionPlan.sales_order_item).selectinload(SalesOrderItem.product), selectinload(ProductionPlan.sales_order_item).selectinload(SalesOrderItem.order))
    result = await db.execute(query)
    plans = result.scalars().all()
    
    data = []
    for plan in plans:
        item = plan.sales_order_item
        order = item.order if item else None
        product = item.product if item else None
        
        data.append({
            "수주번호": order.order_no if order else "",
            "제품명": product.name if product else "",
            "계획상태": plan.status,
            "시작일": plan.start_date,
            "종료일": plan.end_date
        })
        
    df = pd.DataFrame(data)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Production')
    
    output.seek(0)
    filename = f"production_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# Statistics (Simplified example)
@router.get("/stats/excel")
async def export_stats_excel(
    db: AsyncSession = Depends(get_db)
):
    # This assumes we want raw data to pivot in Excel, 
    # or we could pre-calculate monthly totals here.
    # For now, let's just dump orders with month column.
    query = select(SalesOrder)
    result = await db.execute(query)
    orders = result.scalars().all()
    
    data = []
    for order in orders:
        data.append({
            "수주일": order.order_date,
            "월": order.order_date.strftime("%Y-%m") if order.order_date else "",
            "총액": order.total_amount,
            "상태": order.status.value
        })
        
    df = pd.DataFrame(data)
    if not df.empty:
        summary = df.groupby(['월', '상태'])['총액'].sum().reset_index()
    else:
        summary = pd.DataFrame(columns=['월', '상태', '총액'])
        
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        summary.to_excel(writer, index=False, sheet_name='MonthlyStats')
    
    output.seek(0)
    filename = f"stats_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
