from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Any
import asyncio
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
        try:
            from app.core.scheduler import check_common_duties_and_notify
            asyncio.create_task(check_common_duties_and_notify())
        except Exception as e:
            print(f"[DEBUG] Deferred duty notify trigger failed: {e}")
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

    try:
        from app.core.scheduler import check_common_duties_and_notify
        asyncio.create_task(check_common_duties_and_notify())
    except Exception as e:
        print(f"[DEBUG] Deferred duty notify trigger failed: {e}")
    
    return {"status": "created"}


@router.get("/status")
async def get_push_status(
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
) -> Any:
    """현재 로그인 사용자의 푸시 구독 상태 및 서버 VAPID 설정 여부를 반환합니다."""
    count_res = await db.execute(
        select(func.count(PushSubscription.id)).where(PushSubscription.staff_id == current_user.id)
    )
    return {
        "subscribed_devices": int(count_res.scalar() or 0),
        "vapid_configured": bool(settings.VAPID_PUBLIC_KEY_STR and settings.VAPID_PRIVATE_KEY_STR),
    }


@router.post("/test")
async def send_test_push(
    current_user: Staff = Depends(deps.get_current_user)
) -> Any:
    """현재 로그인 사용자의 등록된 모든 기기에 테스트 푸시 알림을 발송합니다."""
    from app.utils.push import send_push_notification
    result = await send_push_notification(
        user_id=current_user.id,
        title="[테스트 알림] DESIGNMECHA MES",
        body=f"{current_user.name}님, 푸시 알림이 정상 동작하고 있습니다.",
        url="/attendance",
    )
    return result
