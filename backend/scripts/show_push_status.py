import asyncio
import os
import sys

# 프로젝트 루트 경로 추가
sys.path.append(os.getcwd())

from sqlalchemy import select, func
from app.api.deps import AsyncSessionLocal
from app.models.basics import Staff
from app.models.notification import PushSubscription

async def show_push_status():
    async with AsyncSessionLocal() as db:
        print("\n=== [MES Push Notification Subscription Status] ===")
        
        # 전체 푸시 구독 정보 조회 (사용자 정보 포함)
        stmt = (
            select(Staff.id, Staff.name, Staff.role, func.count(PushSubscription.id))
            .join(PushSubscription, Staff.id == PushSubscription.staff_id)
            .group_by(Staff.id, Staff.name, Staff.role)
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        if not rows:
            print("현재 등록된 기기가 하나도 없습니다.")
        else:
            print(f"{'ID':<5} | {'이름':<12} | {'직급':<10} | {'등록 기기 수':<10}")
            print("-" * 55)
            for row in rows:
                print(f"{row[0]:<5} | {row[1]:<12} | {row[2]:<10} | {row[3]:<10}개")
        
        print("===================================================\n")

if __name__ == "__main__":
    asyncio.run(show_push_status())
