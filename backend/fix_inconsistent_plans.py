
import asyncio
import os
import sys

# Add backend directory to sys.path to allow imports from app
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import select, update
from app.api.deps import AsyncSessionLocal
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
from app.models.inventory import Stock, StockMovement, TransactionType
from app.models.sales import SalesOrder

async def fix_specific_inconsistent_plans(dry_run=True):
    async with AsyncSessionLocal() as db:
        # 1. 의심스러운 계획들 찾기 (최근 완료된 건 중 수동 개입이 필요한 건)
        # 사용자가 언급한 사례: 수주 6, 재고 9 -> 결과 재고 15 (즉 +6됨)
        # 의심 조건: quantity > 0 이고 stock_use_quantity == 0 인데 
        # 실제로는 재고를 사용했어야 하는 경우 (보통 gross_quantity == quantity 인 경우)
        
        stmt = (
            select(ProductionPlan)
            .where(ProductionPlan.status == ProductionStatus.COMPLETED)
            .where(ProductionPlan.updated_at >= "2026-04-03") # 오늘 작업한 건들 위주
        )
        result = await db.execute(stmt)
        plans = result.scalars().all()
        
        print(f"--- 데이터 정정 작업 시작 ({'DRY RUN' if dry_run else '실제 반영'}) ---")
        
        for plan in plans:
            # 해당 계획의 품목들 확인
            item_stmt = select(ProductionPlanItem).where(ProductionPlanItem.plan_id == plan.id)
            i_res = await db.execute(item_stmt)
            items = i_res.scalars().all()
            
            for item in items:
                # 사용자의 설명에 부합하는 패턴 찾기
                # gross_quantity가 설정되어 있는데 quantity가 그거랑 같고 stock_use_quantity가 0인 경우
                if (item.gross_quantity or 0) > 0 and (item.quantity or 0) == item.gross_quantity and (item.stock_use_quantity or 0) == 0:
                    print(f"\n[발견] 계획 #{plan.id}, 품목 ID: {item.product_id} ({item.product.name if item.product else 'Unknown'})")
                    print(f"      - 현재 상태: Gross {item.gross_quantity}, Net {item.quantity}, StockUse {item.stock_use_quantity}")
                    
                    # 정정 내용:
                    # 1. quantity -> 0 (실생산 없음)
                    # 2. stock_use_quantity -> 원래의 gross_quantity (전량 재고 사용)
                    # 3. Stock 수량 보정: 
                    #    - 잘못 입고된 수량(quantity만큼) 차감
                    #    - 사용했어야 할 재고량(gross_quantity만큼) 차감
                    #    - 총 차감량 = item.quantity + item.gross_quantity (이 사례에서는 6 + 6 = 12)
                    
                    correction_qty = item.quantity + item.gross_quantity
                    
                    if not dry_run:
                        # 품목 정보 수정
                        old_qty = item.quantity
                        old_gross = item.gross_quantity
                        
                        item.quantity = 0
                        item.stock_use_quantity = old_gross
                        item.stock_deducted = True
                        db.add(item)
                        
                        # 재고 차감 (실제 창고 수량 정정)
                        stock_stmt = select(Stock).where(Stock.product_id == item.product_id)
                        s_res = await db.execute(stock_stmt)
                        stock = s_res.scalars().first()
                        
                        if stock:
                            print(f"      - 재고 수정: {stock.current_quantity} -> {stock.current_quantity - correction_qty}")
                            stock.current_quantity -= correction_qty
                            db.add(stock)
                            
                            # 이력 기록
                            movement = StockMovement(
                                product_id=item.product_id,
                                quantity=-correction_qty,
                                transaction_type=TransactionType.OUT,
                                reference=f"데이터 정정 (계획#{plan.id} 재고소진 누락분 반영)"
                            )
                            db.add(movement)
                        
                        print(f"      - [완료] 데이터 정정 완료")
                    else:
                        print(f"      - [예정] Net {item.quantity} -> 0, StockUse 0 -> {item.gross_quantity}")
                        print(f"      - [예정] 재고에서 총 {correction_qty}개 차감 예정")

        if not dry_run:
            await db.commit()
            print("\n--- 모든 변경 사항이 데이터베이스에 저장되었습니다. ---")
        else:
            print("\n--- DRY RUN 종료. 실제 변경은 수행되지 않았습니다. ---")

if __name__ == "__main__":
    # 안전을 위해 먼저 DRY RUN 실행
    asyncio.run(fix_specific_inconsistent_plans(dry_run=True))
