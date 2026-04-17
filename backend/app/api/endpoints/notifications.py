from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any
from app.api import deps
from app.models.basics import Staff
from app.models.notification import PushSubscription
from app.schemas.notification import PushSubscriptionCreate
from app.core.config import settings

router = APIRouter()

@router.get("/vapid-public-key")
async def get_vapid_public_key() -> Any:
    """프론트엔드에 VAPID 퍼블릭 키 제공"""
    return {"public_key": settings.VAPID_PUBLIC_KEY_STR}

@router.post("/subscribe")
async def subscribe_push_notification(
    sub_in: PushSubscriptionCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
) -> Any:
    """디바이스의 푸시 알림 구독 정보를 저장합니다."""
    device_info = sub_in.device_type if sub_in.device_type else "Unknown"
    print(f"[DEBUG] Push subscription request for user {current_user.id} ({current_user.name}) from {device_info}")
    
    # 이미 같은 endpoint가 있는지 확인
    result = await db.execute(select(PushSubscription).where(PushSubscription.endpoint == sub_in.endpoint))
    existing_sub = result.scalars().first()
    
    if existing_sub:
        # 기존 토큰의 소유자나 키값이 바뀌었다면 업데이트
        existing_sub.staff_id = current_user.id
        existing_sub.p256dh = sub_in.p256dh
        existing_sub.auth = sub_in.auth
        await db.commit()
        print(f"[DEBUG] Updated existing subscription for user {current_user.id}")
        return {"status": "updated"}
        
    new_sub = PushSubscription(
        staff_id=current_user.id,
        endpoint=sub_in.endpoint,
        p256dh=sub_in.p256dh,
        auth=sub_in.auth
    )
    db.add(new_sub)
    await db.commit()
    print(f"[DEBUG] Created NEW subscription for user {current_user.id}")
    
    # [DEBUG] 최종 기기 개수 출력
    count_res = await db.execute(select(func.count(PushSubscription.id)).where(PushSubscription.staff_id == current_user.id))
    print(f"[DEBUG] User {current_user.id} ({current_user.name}) now has {count_res.scalar()} total device(s) registered.")
    
    return {"status": "created"}
