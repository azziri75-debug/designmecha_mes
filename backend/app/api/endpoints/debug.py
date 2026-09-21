from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.api import deps

router = APIRouter()

@router.get("/fks")
async def get_fks(
    table_name: str = "products",
    db: AsyncSession = Depends(deps.get_db)
):
    """
    Inspect Foreign Keys for a given table.
    """
    # PostgreSQL specific query
    query = text(f"""
        SELECT
            tc.constraint_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.delete_rule
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='{table_name}';
    """)
    
    try:
        result = await db.execute(query)
        fks = result.fetchall()
        
        fk_list = []
        for fk in fks:
            fk_list.append({
                "constraint_name": fk[0],
                "column_name": fk[1],
                "foreign_table": fk[2],
                "foreign_column": fk[3],
                "delete_rule": fk[4]
            })
            
        return {"table": table_name, "fks": fk_list}
    except Exception as e:
        return {"error": str(e)}


@router.get("/plans-for-order/{order_id}")
async def get_plans_for_order(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    """
    수주 order_id에 연결된 생산계획과 상태를 직접 조회 (디버깅용).
    """
    try:
        plans_res = await db.execute(text("""
            SELECT pp.id, pp.plan_no, pp.status, pp.actual_completion_date, pp.order_id
            FROM production_plans pp
            WHERE pp.order_id = :order_id
            ORDER BY pp.id
        """), {"order_id": order_id})
        plans = [dict(r._mapping) for r in plans_res.fetchall()]

        items_res = await db.execute(text("""
            SELECT ppi.id, ppi.plan_id, ppi.product_id, ppi.quantity, ppi.status, p.name as product_name
            FROM production_plan_items ppi
            LEFT JOIN products p ON p.id = ppi.product_id
            WHERE ppi.plan_id IN (
                SELECT id FROM production_plans WHERE order_id = :order_id
            )
            ORDER BY ppi.plan_id, ppi.sequence
        """), {"order_id": order_id})
        items = [dict(r._mapping) for r in items_res.fetchall()]

        order_res = await db.execute(text("""
            SELECT so.id, so.order_no, so.status,
                   soi.id as item_id, soi.product_id, soi.quantity, soi.delivered_quantity,
                   p.name as product_name
            FROM sales_orders so
            JOIN sales_order_items soi ON soi.order_id = so.id
            LEFT JOIN products p ON p.id = soi.product_id
            WHERE so.id = :order_id
        """), {"order_id": order_id})
        order_items = [dict(r._mapping) for r in order_res.fetchall()]

        return {
            "order_id": order_id,
            "order_items": order_items,
            "production_plans": plans,
            "plan_items": items
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/plan-fk-cascade")
async def check_plan_fk_cascade(db: AsyncSession = Depends(deps.get_db)):
    """production_plans 테이블의 FK CASCADE 규칙 확인"""
    try:
        res = await db.execute(text("""
            SELECT
                tc.constraint_name,
                kcu.column_name,
                ccu.table_name AS ref_table,
                ccu.column_name AS ref_col,
                rc.delete_rule,
                rc.update_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            JOIN information_schema.referential_constraints rc
                ON rc.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_name IN ('production_plans', 'production_plan_items')
            ORDER BY tc.table_name, kcu.column_name
        """))
        rows = [dict(r._mapping) for r in res.fetchall()]
        return {"fk_cascade_rules": rows}
    except Exception as e:
        return {"error": str(e)}
