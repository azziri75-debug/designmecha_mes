
import asyncio
from sqlalchemy import select, and_
from app.api.deps import AsyncSessionLocal
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.inventory import Stock, StockMovement
from app.models.sales import SalesOrder

async def diagnose_inconsistent_plans():
    async with AsyncSessionLocal() as db:
        # 1. 'COMPLETED' 상태인 생산 계획 중 실생산 수량이 있고 재고 소진이 0인 항목 조회
        # 특히 수주 수량과 실생산 수량이 일치하는데 재고가 충분했던 경우를 의심
        stmt = (
            select(ProductionPlan)
            .options()
            .where(ProductionPlan.status == ProductionStatus.COMPLETED)
        )
        result = await db.execute(stmt)
        plans = result.scalars().all()
        
        inconsistent_count = 0
        print(f"--- 진단 시작 (총 {len(plans)}건의 완료된 계획 검토) ---")
        
        for plan in plans:
            # 해당 계획의 품목들 확인
            item_stmt = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan.id)
            i_res = await db.execute(item_stmt)
            items = i_res.scalars().all()
            
            for item in items:
                # 의심 조건: 재고 소진이 0인데 실생산 수량(quantity)이 0보다 큰 경우
                # 동시에 gross_quantity가 quantity와 같거나 기록되지 않은 경우
                if (item.stock_use_quantity or 0) == 0 and (item.quantity or 0) > 0:
                    # 해당 시점의 재고가 충분했는지 등은 알기 어렵지만, 사용자가 언급한 '수주 6, 재고 9' 같은 사례인지 확인
                    print(f"[의심] 계획 #{plan.id}, 품목 ID: {item.product_id}, 공정: {item.process_name}")
                    print(f"      - 현재 수량(Net): {item.quantity}, 재고소진량: {item.stock_use_quantity}")
                    inconsistent_count += 1
        
        print(f"--- 진단 종료 (의심 건수: {inconsistent_count}건) ---")

if __name__ == "__main__":
    asyncio.run(diagnose_inconsistent_plans())
