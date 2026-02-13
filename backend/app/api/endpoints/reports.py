from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import pandas as pd
import io
from datetime import datetime
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.sales import SalesOrder, SalesOrderItem
from app.models.production import ProductionPlan, ProductionPlanItem
from app.models.product import Product
from app.models.basics import Partner

router = APIRouter()

# ... (keep export_orders_excel as is)

@router.get("/production/excel")
async def export_production_excel(
    db: AsyncSession = Depends(get_db)
):
    # ProductionPlan -> Items -> Product
    # ProductionPlan -> Order
    query = select(ProductionPlan).options(
        selectinload(ProductionPlan.items).selectinload(ProductionPlanItem.product),
        selectinload(ProductionPlan.order)
    )
    result = await db.execute(query)
    plans = result.scalars().all()
    
    data = []
    for plan in plans:
        # If no items, still show plan? 
        if not plan.items:
            data.append({
                "수주번호": plan.order.order_no if plan.order else "",
                "공정/제품명": "계획 공정 없음",
                "상태": plan.status,
                "시작일": plan.plan_date, # Plan date as fallback
                "종료일": None
            })
            continue

        for item in plan.items:
            data.append({
                "수주번호": plan.order.order_no if plan.order else "",
                "공정/제품명": f"{item.process_name} ({item.product.name if item.product else 'Unknown'})",
                "상태": item.status,
                "시작일": item.start_date,
                "종료일": item.end_date
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
