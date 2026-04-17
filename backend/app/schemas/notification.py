from pydantic import BaseModel

from typing import Optional

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    device_type: Optional[str] = None

class PushSubscriptionOut(PushSubscriptionCreate):
    id: int
    staff_id: int

    class Config:
        from_attributes = True
