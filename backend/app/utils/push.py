import json
from pywebpush import webpush, WebPushException
from app.core.config import settings
from app.models.notification import PushSubscription
from app.api.deps import AsyncSessionLocal
from sqlalchemy import select
from typing import Dict, Any, List

def _send_web_push(subscription: PushSubscription, payload: Dict[str, Any]):
    if not settings.VAPID_PRIVATE_KEY_STR:
        return False
        
    try:
        sub_info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth
            }
        }
        print(f"[DEBUG] Attempting web push to {subscription.endpoint[:50]}...")
        webpush(
            subscription_info=sub_info,
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY_STR,
            vapid_claims={"sub": settings.VAPID_SUBJECT}
        )
        print(f"[DEBUG] Web push success for staff_id: {subscription.staff_id}")
        return True
    except WebPushException as ex:
        # 410 Gone = subscription is no longer valid
        if ex.response and ex.response.status_code == 410:
            print(f"[DEBUG] Web push subscription expired (410) for staff_id: {subscription.staff_id}")
            return "EXPIRED"
        print(f"[ERROR] Web Push Error (staff_id: {subscription.staff_id}): {repr(ex)}")
        return False
    except Exception as e:
        print(f"[ERROR] Unexpected Push Error (staff_id: {subscription.staff_id}): {str(e)}")
        return False

async def send_push_notification(user_id: int, title: str, body: str, url: str = "/"):
    """
    특정 사용자에게 푸시 알림 발송. 만료된 토큰이 있다면 DB에서 삭제합니다.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(PushSubscription).where(PushSubscription.staff_id == user_id))
        subscriptions: List[PushSubscription] = result.scalars().all()
        
        expired_ids = []
        payload = {
            "title": title,
            "body": body,
            "url": url,
            "icon": "/vite.svg"
        }
        
        for sub in subscriptions:
            # pywebpush internally uses 'requests' which is synchronous.
            # Use to_thread (available in Python 3.9+) to avoid blocking the async event loop.
            import asyncio
            status = await asyncio.to_thread(_send_web_push, sub, payload)
            if status == "EXPIRED":
                expired_ids.append(sub.id)
                
        if expired_ids:
            for exp_id in expired_ids:
                exp_sub = await db.get(PushSubscription, exp_id)
                if exp_sub:
                    await db.delete(exp_sub)
            await db.commit()

async def notify_production_manager(title: str, body: str, url: str = "/"):
    """
    생산부 부장(Manager)에게 푸시 알림을 발송합니다.
    """
    from app.models.basics import Staff
    async with AsyncSessionLocal() as db:
        # 생산부 부장 찾기 (부서명에 '생산'이 포함되고 직책이 '부장'인 활성 직원)
        stmt = select(Staff).where(
            Staff.is_active == True,
            Staff.department.ilike("%생산%"),
            Staff.role == "부장"
        )
        result = await db.execute(stmt)
        managers = result.scalars().all()
        
        if not managers:
            print("[DEBUG] No Production Manager found for notification.")
            return

        for manager in managers:
            # send_push_notification 자체가 새로운 세션을 열어 처리하므로 개별 호출
            await send_push_notification(manager.id, title, body, url)
