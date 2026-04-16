from pydantic import BaseModel

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

class PushSubscriptionOut(PushSubscriptionCreate):
    id: int
    staff_id: int

    class Config:
        from_attributes = True
