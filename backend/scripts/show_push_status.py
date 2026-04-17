import asyncio
import os
import sys

# 프로젝트 루트 경로 추가
sys.path.append(os.getcwd())

from sqlalchemy import select, func
from app.api.deps import AsyncSessionLocal
from app.models.basics import Staff, EmployeeTimeRecord
from app.models.notification import PushSubscription
from app.models.approval import ApprovalDocument # 관계 설정을 위해 명시적 로드

async def show_push_status():
    async with AsyncSessionLocal() as db:
        print("\n=== [MES Push Notification Subscription Status] ===")
        
        # 전체 직원 대비 푸시 구독 정보 조회 (기기 0개인 사람도 포함)
        stmt = (
            select(Staff.id, Staff.name, Staff.role, func.count(PushSubscription.id))
            .outerjoin(PushSubscription, Staff.id == PushSubscription.staff_id)
            .group_by(Staff.id, Staff.name, Staff.role)
            .order_by(func.count(PushSubscription.id).desc())
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        if not rows:
            print("현재 등록된 기기가 하나도 없습니다.")
        else:
            print(f"{'ID':<5} | {'이름':<12} | {'직급':<10} | {'등록 기기 수':<10}")
            print("-" * 55)
            for row in rows:
                staff_id = str(row[0] or '')
                staff_name = str(row[1] or '')
                staff_role = str(row[2] or '')
                device_count = str(row[3] or 0)
                print(f"{staff_id:<5} | {staff_name:<12} | {staff_role:<10} | {device_count:<10}개")
        
        print("===================================================\n")

if __name__ == "__main__":
    asyncio.run(show_push_status())
