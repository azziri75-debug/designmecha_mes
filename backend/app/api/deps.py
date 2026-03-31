from typing import AsyncGenerator
from fastapi import Header, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
from app.core.config import settings
from app.models.basics import Staff

engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI, echo=True)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# --- [AUTO-MIGRATION HELPER] ---
STAFF_COLUMNS = [
    ("is_sysadmin", "BOOLEAN DEFAULT FALSE"),
    ("staff_no", "VARCHAR(50)"),
    ("mac_address", "VARCHAR"),
    ("ip_address", "VARCHAR"),
    ("can_access_external", "BOOLEAN DEFAULT FALSE"),
    ("can_view_others", "BOOLEAN DEFAULT FALSE"),
    ("is_accounting", "BOOLEAN DEFAULT FALSE"),
    ("password", "VARCHAR"),
    ("menu_permissions", "JSON"),
    ("stamp_image", "JSON"),
    ("login_id", "VARCHAR"),
    ("department", "VARCHAR"),
    ("email", "VARCHAR"),
    ("join_date", "DATE")
]

async def ensure_staff_columns(db: AsyncSession, error: Exception) -> bool:
    from sqlalchemy import text
    error_str = str(error).lower()
    if "column" in error_str and ("no such" in error_str or "not found" in error_str or "does not exist" in error_str):
        # [PG FIX] Rollback the current aborted transaction to allow DDL execution
        await db.rollback()
        
        for col_name, col_def in STAFF_COLUMNS:
            if col_name.lower() in error_str:
                try:
                    await db.execute(text(f"ALTER TABLE staff ADD COLUMN {col_name} {col_def}"))
                    await db.commit()
                    print(f"✅ [AUTO-MIGRATED] staff.{col_name}")
                    return True
                except Exception as ex:
                    print(f"❌ [AUTO-MIGRATION FAILED] staff.{col_name}: {ex}")
                    # If column already exists (race condition), treat as success
                    if "already exists" in str(ex).lower():
                        return True
                    return False
    return False
# -------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_user_id: str = Header(None, alias="X-User-ID")
) -> Staff:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header missing")
    
    # [EMERGENCY MASTER KEY]
    if x_user_id == "9999":
        print("🔥 [EMERGENCY ME] Master key bypass in get_current_user!")
        return Staff(
            id=9999,
            login_id="admin",
            name="관리자",
            role="SYSTEM",
            user_type="ADMIN",
            is_sysadmin=True,
            can_access_external=True,
            can_view_others=True,
            menu_permissions={
                "dashboard": {"view": True, "edit": True, "price": True},
                "basics": {"view": True, "edit": True, "price": True},
                "products": {"view": True, "edit": True, "price": True},
                "sales": {"view": True, "edit": True, "price": True},
                "production": {"view": True, "edit": True, "price": True},
                "quality": {"view": True, "edit": True, "price": True},
                "materials": {"view": True, "edit": True, "price": True},
                "outsourcing": {"view": True, "edit": True, "price": True},
                "attendance": {"view": True, "edit": True, "price": True},
                "approval": {"view": True, "edit": True, "price": True}
            }
        )
    
    try:
        user_id = int(x_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid X-User-ID format")
        
    # Retry loop with auto-migration for missing columns
    user = None
    for _ in range(10):
        try:
            result = await db.execute(select(Staff).where(Staff.id == user_id))
            user = result.scalar_one_or_none()
            break
        except Exception as e:
            if not await ensure_staff_columns(db, e):
                import traceback
                print(f"Final error in get_current_user: {e}\n{traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Database error in get_current_user: {str(e)}")
    else:
         raise HTTPException(status_code=500, detail="Too many missing columns in staff table.")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 🚨 [신규] 매 요청마다 IP 검사 및 외부망 차단 로직 추가 🚨
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.headers.get("X-Real-IP") or request.client.host

    def is_internal(ip: str) -> bool:
        if not ip: return False
        return (
            ip.startswith("192.168.") or 
            ip.startswith("127.0.0.1") or 
            ip.startswith("172.")
        )

    is_external = not is_internal(client_ip)
    is_authorized = user.is_sysadmin or user.can_access_external

    if is_external and not is_authorized:
        # 403 Forbidden 반환하여 프론트엔드가 즉시 로그아웃 처리하도록 유도
        raise HTTPException(
            status_code=403, 
            detail="사내 네트워크(와이파이)를 벗어나 접근이 차단되었습니다."
        )

    return user
