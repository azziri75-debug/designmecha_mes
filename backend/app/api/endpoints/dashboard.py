from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime
from typing import Dict, Any

from app.api.deps import get_db
from app.models.sales import SalesOrder, OrderStatus

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    now = datetime.now()
    this_month_start = datetime(now.year, now.month, 1)
    
    # 1. Total Order Amount (All non-cancelled)
    order_query = select(func.sum(SalesOrder.total_amount)).where(
        SalesOrder.status != OrderStatus.CANCELLED
    )
    total_order_res = await db.execute(order_query)
    total_order_amount = total_order_res.scalar() or 0.0
    
    # 2. Monthly Order Amount
    month_order_query = select(func.sum(SalesOrder.total_amount)).where(
        SalesOrder.status != OrderStatus.CANCELLED,
        SalesOrder.order_date >= this_month_start.date()
    )
    month_order_res = await db.execute(month_order_query)
    month_order_amount = month_order_res.scalar() or 0.0
    
    # 3. Total Sales Amount (Delivered/Completed)
    # Status should be DELIVERY_COMPLETED (new) or DELIVERED (legacy)
    sales_query = select(func.sum(SalesOrder.total_amount)).where(
        SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED])
    )
    total_sales_res = await db.execute(sales_query)
    total_sales_amount = total_sales_res.scalar() or 0.0
    
    # 4. Monthly Sales Amount
    # We use order_date or transaction_date? Usually SALES is counted when delivered.
    # But for a simple dashboard monthly comparison, order_date of delivered items or actual_delivery_date.
    # Let's use order_date for consistency with existing logic unless specified.
    month_sales_query = select(func.sum(SalesOrder.total_amount)).where(
        SalesOrder.status.in_([OrderStatus.DELIVERY_COMPLETED, OrderStatus.DELIVERED]),
        SalesOrder.order_date >= this_month_start.date()
    )
    month_sales_res = await db.execute(month_sales_query)
    month_sales_amount = month_sales_res.scalar() or 0.0
    
    return {
        "total_order_amount": total_order_amount,
        "month_order_amount": month_order_amount,
        "total_sales_amount": total_sales_amount,
        "month_sales_amount": month_sales_amount
    }
