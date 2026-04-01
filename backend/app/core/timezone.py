from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

def now_kst():
    """상태값 등을 위해 KST 시간(Naive)을 반환합니다. (DB 저장용)"""
    return datetime.now(KST).replace(tzinfo=None)
