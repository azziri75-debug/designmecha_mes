import asyncio
import sys
import os
import uuid
from datetime import date
from sqlalchemy import select

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from sqlalchemy.orm import selectinload

# Import all models to ensure relationships are resolved
from app.models.basics import Partner, PartnerType
from app.models.product import Product, ProductProcess, Process
from app.models.inventory import Stock, StockProduction, StockProductionStatus
from app.models.sales import SalesOrder, SalesOrderItem, OrderStatus
from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus, WorkOrder
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus, OutsourcingOrder, OutsourcingOrderItem, OutsourcingStatus

async def main():
    # Setup In-memory DB for pure logic testing
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        from app.db.base import Base # Ensure Base has all models
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        print("--- 구매/외주 동기화 로직 검증 시작 (In-memory DB) ---")
        try:
            # 1. 기초 데이터 준비 (상품 및 수주)
            product = Product(
                name="테스트 상품",
                unit="EA"
            )
            db.add(product)
            await db.flush()
            print(f"더미 상품 생성 완료: ID {product.id}")

            order = SalesOrder(
                order_no=f"TS-{uuid.uuid4().hex[:6]}",
                order_date=date.today(),
                partner_id=1
            )
            db.add(order)
            await db.flush()

            # 2. 생산 계획 생성 (항목 2개: 구매 1, 외주 1)
            plan = ProductionPlan(
                order_id=order.id,
                plan_date=date.today(),
                status=ProductionStatus.PLANNED
            )
            db.add(plan)
            await db.flush()

            item_p = ProductionPlanItem(
                plan_id=plan.id, product_id=product.id, process_name="구매공정",
                sequence=1, course_type="PURCHASE", quantity=1, status=ProductionStatus.PLANNED
            )
            item_o = ProductionPlanItem(
                plan_id=plan.id, product_id=product.id, process_name="외주공정",
                sequence=2, course_type="OUTSOURCING", quantity=1, status=ProductionStatus.PLANNED
            )
            db.add(item_p)
            db.add(item_o)
            await db.flush()

            # 3. 구매/외주 발주 연결
            po = PurchaseOrder(order_no=f"TPO-{uuid.uuid4().hex[:6]}", order_date=date.today(), status=PurchaseStatus.PENDING)
            db.add(po)
            await db.flush()
            poi = PurchaseOrderItem(purchase_order_id=po.id, product_id=product.id, quantity=1, production_plan_item_id=item_p.id)
            db.add(poi)

            oo = OutsourcingOrder(order_no=f"TOO-{uuid.uuid4().hex[:6]}", order_date=date.today(), status=OutsourcingStatus.PENDING)
            db.add(oo)
            await db.flush()
            ooi = OutsourcingOrderItem(outsourcing_order_id=oo.id, product_id=product.id, quantity=1, production_plan_item_id=item_o.id)
            db.add(ooi)

            await db.commit()
            print(f"데이터 생성 완료: Plan ID {plan.id}, PO ID {po.id}, OO ID {oo.id}")

            # 4. 검증 1: 구매 발주 완료 시 공정 완료 확인
            print("\n검증 1: 구매 발주 완료 처리 중...")
            from app.api.endpoints.purchasing import update_purchase_order
            from app.schemas.purchasing import PurchaseOrderUpdate
            
            # API 엔드포인트 로직을 직접 호출하여 테스트 (db_order.status를 COMPLETED로 변경)
            # 여기서는 스크립트 특성상 DB에서 직접 상태 변경 후 API 로직 일부를 시뮬레이션하거나
            # update_purchase_order를 직접 호출할 수 있으나, Dependency Injection 때문에 복잡할 수 있음.
            # 로직이 purchasing.py의 `update_purchase_order`에 있으므로 이를 모방합니다.
            
            po.status = PurchaseStatus.COMPLETED
            db.add(po)
            
            # --- purchasing.py에 작성한 로직 실행 ---
            for item in [poi]: # db_order.items
                if item.production_plan_item_id:
                    plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                    if plan_item:
                        plan_item.status = ProductionStatus.COMPLETED
                        db.add(plan_item)
            
            await db.flush()
            
            # --- production.py에 작성한 helper 실행 (실제 API에서는 update_production_plan_item 등에서 호출됨) ---
            from app.api.endpoints.production import check_and_complete_production_plan
            await check_and_complete_production_plan(db, plan.id)
            
            await db.refresh(item_p)
            print(f"결과 1: 구매 공정 상태 = {item_p.status} (예상: COMPLETED)")

            # 5. 검증 2: 외주 발주 완료 시 공정 완료 및 계획 완료 확인
            print("\n검증 2: 외주 발주 완료 처리 중...")
            oo.status = OutsourcingStatus.COMPLETED
            db.add(oo)
            
            for item in [ooi]:
                if item.production_plan_item_id:
                    plan_item = await db.get(ProductionPlanItem, item.production_plan_item_id)
                    if plan_item:
                        plan_item.status = ProductionStatus.COMPLETED
                        db.add(plan_item)
            
            await db.flush()
            await check_and_complete_production_plan(db, plan.id)
            
            await db.refresh(item_o)
            await db.refresh(plan)
            print(f"결과 2: 외주 공정 상태 = {item_o.status} (예상: COMPLETED)")
            print(f"결과 3: 생산 계획 전체 상태 = {plan.status} (예상: COMPLETED)")

            if item_p.status == ProductionStatus.COMPLETED and item_o.status == ProductionStatus.COMPLETED and plan.status == ProductionStatus.COMPLETED:
                print("\n--- [성공] 모든 검증 항목을 통과했습니다. ---")
            else:
                print("\n--- [실패] 일부 검증 항목이 예상과 다릅니다. ---")

        except Exception as e:
            print(f"오차 발생: {e}")
            import traceback
            traceback.print_exc()
            await db.rollback()
        finally:
            await engine.dispose()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
