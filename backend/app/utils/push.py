import json
from pywebpush import webpush, WebPushException
from app.core.config import settings
from app.models.notification import PushSubscription
from app.api.deps import AsyncSessionLocal
from sqlalchemy import select, func
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
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=86400,
            headers={"Urgency": "high"},
        )
        print(f"[DEBUG] Web push success for staff_id: {subscription.staff_id}")
        return True
    except WebPushException as ex:
        # 404 Not Found / 410 Gone = subscription is no longer valid
        if ex.response and ex.response.status_code in (404, 410):
            print(f"[DEBUG] Web push subscription expired ({ex.response.status_code}) for staff_id: {subscription.staff_id}")
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
    vapid_configured = bool(settings.VAPID_PRIVATE_KEY_STR)
    if not vapid_configured:
        print(f"[WARNING] [Push] VAPID_PRIVATE_KEY is empty. Push skipped for staff_id: {user_id}")
        return {"sent": 0, "total": 0, "expired": 0, "vapid_configured": False}

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(PushSubscription).where(PushSubscription.staff_id == user_id))
        subscriptions: List[PushSubscription] = result.scalars().all()
        
        print(f"[DEBUG] [Push] Found {len(subscriptions)} subscription(s) for staff_id: {user_id}")
        
        expired_ids = []
        sent_count = 0
        payload = {
            "title": title,
            "body": body,
            "url": url,
            "icon": "/logo-192.png"
        }
        
        for sub in subscriptions:
            # pywebpush internally uses 'requests' which is synchronous.
            # Use to_thread (available in Python 3.9+) to avoid blocking the async event loop.
            import asyncio
            status = await asyncio.to_thread(_send_web_push, sub, payload)
            if status is True:
                sent_count += 1
            elif status == "EXPIRED":
                expired_ids.append(sub.id)
                
        if expired_ids:
            for exp_id in expired_ids:
                exp_sub = await db.get(PushSubscription, exp_id)
                if exp_sub:
                    await db.delete(exp_sub)
            await db.commit()

        return {
            "sent": sent_count,
            "total": len(subscriptions),
            "expired": len(expired_ids),
            "vapid_configured": vapid_configured,
        }

async def notify_production_manager(title: str, body: str, url: str = "/"):
    """
    생산부 부장(Manager)에게 푸시 알림을 발송합니다.
    - 부서명(String), 부서 모델(Relationship), 주업무(Main Duty) 중 하나라도 '생산'을 포함하고
    - 직책이 '부장'인 전체 사원을 대상으로 함.
    """
    from app.models.basics import Staff, Department
    from sqlalchemy import or_
    from sqlalchemy.orm import joinedload
    
    async with AsyncSessionLocal() as db:
        # 생산부 부장 찾기 (다양한 필드 교차 검증)
        
        # [DEBUG] 전체 사원 수 확인
        total_staff_count = await db.execute(select(func.count(Staff.id)))
        print(f"[DEBUG] [Push] Total active staff count: {total_staff_count.scalar()}")

        stmt = (
            select(Staff)
            .outerjoin(Department, Staff.department_id == Department.id)
            .where(
                Staff.is_active == True,
                or_(
                    Staff.department.ilike("%생산%"),
                    Department.name.ilike("%생산%"),
                    Staff.main_duty.ilike("%생산%")
                ),
                Staff.role == "부장"
            )
        )
        
        result = await db.execute(stmt)
        managers = result.scalars().all()
        
        if not managers:
            # 매칭 실패 시 더 상세한 분석 로그 출력
            print(f"[DEBUG] [Push] No Production Manager found. Criteria: Role='부장' AND Dept/Duty like '%생산%'")
            # 부장인 사람만이라도 출력해서 확인
            role_check = await db.execute(select(Staff).where(Staff.role == "부장", Staff.is_active == True))
            role_managers = role_check.scalars().all()
            print(f"[DEBUG] [Push] Staff with '부장' role: {[f'{m.name}(Dept:{m.department}, Duty:{m.main_duty})' for m in role_managers]}")
            return

        print(f"[DEBUG] [Push] Matched {len(managers)} Production Manager(s): {[m.name for m in managers]}")

        for manager in managers:
            await send_push_notification(manager.id, title, body, url)
