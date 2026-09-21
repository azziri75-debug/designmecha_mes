from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from app.api import deps

router = APIRouter()

@router.get("/fks")
async def get_fks(
    table_name: str = "products",
    db: AsyncSession = Depends(deps.get_db)
):
    """Inspect Foreign Keys for a given table."""
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
    """수주 order_id에 연결된 생산계획과 상태를 직접 조회 (디버깅용)."""
    try:
        plans_res = await db.execute(text("""
            SELECT pp.id, pp.plan_date, pp.status, pp.actual_completion_date, pp.order_id
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


@router.post("/restore-completed-plan/{order_id}")
async def restore_completed_plan_for_delivered_items(
    order_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    """
    납품 완료된 품목에 대해 소급 생산계획(COMPLETED)을 자동 생성합니다.
    - 납품일자를 생산완료일로 설정
    - 이미 해당 수주의 생산계획이 존재하는 품목은 건너뜀
    - delivered_quantity = 0인 품목은 건너뜀
    """
    try:
        from app.models.sales import SalesOrder, SalesOrderItem
        from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
        from app.core.timezone import now_kst

        # 1. 수주 조회
        order_res = await db.execute(
            select(SalesOrder).where(SalesOrder.id == order_id)
        )
        order = order_res.scalars().first()
        if not order:
            return {"error": f"수주 {order_id}를 찾을 수 없습니다."}

        # 2. 수주 품목 조회
        items_res = await db.execute(
            select(SalesOrderItem).where(SalesOrderItem.order_id == order_id)
        )
        order_items = items_res.scalars().all()

        # 3. 이 수주에 이미 존재하는 생산계획의 product_id 목록 수집
        existing_plans_res = await db.execute(text("""
            SELECT DISTINCT ppi.product_id
            FROM production_plan_items ppi
            JOIN production_plans pp ON pp.id = ppi.plan_id
            WHERE pp.order_id = :order_id
              AND pp.status != 'CANCELED'
        """), {"order_id": order_id})
        already_planned_pids = {r[0] for r in existing_plans_res.fetchall()}

        # 4. 납품 완료 품목별 최초 납품일자 조회
        delivery_dates_res = await db.execute(text("""
            SELECT soi.product_id, MIN(dh.delivery_date) as first_delivery_date
            FROM delivery_history_items dhi
            JOIN delivery_histories dh ON dh.id = dhi.delivery_id
            JOIN sales_order_items soi ON soi.id = dhi.order_item_id
            WHERE dh.order_id = :order_id
            GROUP BY soi.product_id
        """), {"order_id": order_id})
        delivery_date_map = {r[0]: r[1] for r in delivery_dates_res.fetchall()}

        created_plans = []
        skipped = []

        for item in order_items:
            pid = item.product_id
            delivered = item.delivered_quantity or 0

            # 납품 수량이 없으면 건너뜀
            if delivered <= 0:
                skipped.append({"product_id": pid, "reason": "납품 수량 없음"})
                continue

            # 이미 생산계획이 있는 품목은 건너뜀
            if pid in already_planned_pids:
                skipped.append({"product_id": pid, "reason": "이미 생산계획 존재"})
                continue

            # 납품일자 (없으면 오늘)
            completion_date = delivery_date_map.get(pid) or now_kst().date()

            # 5. 소급 생산계획 헤더 생성 (COMPLETED)
            plan = ProductionPlan(
                order_id=order_id,
                plan_date=completion_date,
                status=ProductionStatus.COMPLETED,
                actual_completion_date=completion_date,
            )
            db.add(plan)
            await db.flush()

            # 6. 공정 아이템 생성 (단일 INTERNAL 공정, 납품 수량 기준)
            plan_item = ProductionPlanItem(
                plan_id=plan.id,
                product_id=pid,
                process_name="생산완료(소급)",
                sequence=1,
                course_type="INTERNAL",
                quantity=delivered,
                gross_quantity=delivered,
                stock_use_quantity=0,
                status=ProductionStatus.COMPLETED,
            )
            db.add(plan_item)

            created_plans.append({
                "plan_id": plan.id,
                "product_id": pid,
                "quantity": delivered,
                "completion_date": str(completion_date),
            })

        await db.commit()

        return {
            "status": "ok",
            "order_id": order_id,
            "created": created_plans,
            "skipped": skipped,
            "message": f"{len(created_plans)}개 품목의 소급 생산계획이 생성되었습니다."
        }

    except Exception as e:
        await db.rollback()
        return {"error": str(e)}
