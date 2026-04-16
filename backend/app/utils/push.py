import json
from pywebpush import webpush, WebPushException
from app.core.config import settings
from app.models.notification import PushSubscription
from app.db.session import async_session_maker
from sqlalchemy import select
from typing import Dict, Any, List

def _send_web_push(subscription: PushSubscription, payload: Dict[str, Any]):
    if not settings.VAPID_PRIVATE_KEY:
        return False
        
    try:
        sub_info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth
            }
        }
        webpush(
            subscription_info=sub_info,
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT}
        )
        return True
    except WebPushException as ex:
        # 410 Gone = subscription is no longer valid
        if ex.response and ex.response.status_code == 410:
            return "EXPIRED"
        print("Web Push Error:", repr(ex))
        return False
    except Exception as e:
        print("Unexpected Push Error:", str(e))
        return False

async def send_push_notification(user_id: int, title: str, body: str, url: str = "/"):
    """
    특정 사용자에게 푸시 알림 발송. 만료된 토큰이 있다면 DB에서 삭제합니다.
    """
    async with async_session_maker() as db:
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
            # 동기함수인 webpush를 호출하지만 I/O block이 발생할 수 있음 (requests 모듈 사용)
            # 여기서는 편의상 그대로 호출 (완벽한 async를 위해서는 aiohttp기반 webpush 래핑 필요, 
            # 하지만 pywebpush가 내부적으로 requests를 사용하므로 fastapi threadpool에서 실행 권장)
            # 간단히 구현하기 위해 직접 호출
            status = _send_web_push(sub, payload)
            if status == "EXPIRED":
                expired_ids.append(sub.id)
                
        if expired_ids:
            for exp_id in expired_ids:
                exp_sub = await db.get(PushSubscription, exp_id)
                if exp_sub:
                    await db.delete(exp_sub)
            await db.commit()
