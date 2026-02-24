from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

from fastapi.staticfiles import StaticFiles
import os

class CORSStaticFiles(StaticFiles):
    async def __call__(self, scope, receive, send):
        async def cors_send(message):
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers[b"access-control-allow-origin"] = b"*"
                message["headers"] = list(headers.items())
            await send(message)
        await super().__call__(scope, receive, cors_send)

# Mount static files — use absolute path to avoid CWD issues in deployment
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
UPLOAD_DIR = os.path.join(_BASE_DIR, "uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/static", CORSStaticFiles(directory=UPLOAD_DIR), name="static")

# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin).strip("/") for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = f"Global Error: {str(exc)}\n{traceback.format_exc()}"
    print(error_msg)
    with open("backend_global_error.log", "a", encoding="utf-8") as f:
        f.write(error_msg + "\n")
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc)},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    error_details = traceback.format_exc()
    print(f"Global Exception: {exc}\n{error_details}")
    
    # Force CORS headers to ensure the frontend can read the error
    origin = request.headers.get("origin")
    headers = {
        "Access-Control-Allow-Origin": origin if origin else "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc), "trace": error_details.splitlines()[-1]},
        headers=headers
    )

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {"status": "ok", "message": "MES ERP Backend is running"}

@app.on_event("startup")
async def startup_event():
    """Ensure admin user exists on startup"""
    from app.api.deps import AsyncSessionLocal
    from app.models.basics import Staff
    from sqlalchemy.future import select
    import json
    
    async with AsyncSessionLocal() as db:
        ALL_MENUS = ["basics", "products", "sales", "production", "purchase", "outsourcing", "quality", "inventory"]
        result = await db.execute(select(Staff).where(Staff.name == "이준호"))
        admin = result.scalar_one_or_none()
        
        if not admin:
            admin = Staff(
                name="이준호",
                role="대표",
                main_duty="총괄관리",
                user_type="ADMIN",
                password="6220",
                menu_permissions=ALL_MENUS,
                is_active=True
            )
            db.add(admin)
            print("Startup: Created admin '이준호'")
        else:
            admin.password = "6220"
            admin.user_type = "ADMIN"
            admin.menu_permissions = ALL_MENUS
            admin.is_active = True
            db.add(admin)
            print("Startup: Updated admin '이준호' password to 6220")
            
        # 2. Migration for sales_orders attachment_file
        from sqlalchemy import text
        # SQLite check
        db_url = str(db.get_bind().url)
        if "sqlite" in db_url:
            table_info = await db.execute(text("PRAGMA table_info(sales_orders)"))
            columns = [row[1] for row in table_info.fetchall()]
            if "attachment_file" not in columns:
                await db.execute(text("ALTER TABLE sales_orders ADD COLUMN attachment_file JSON"))
                print("Startup: Added attachment_file to sales_orders (SQLite)")
        else:
            # Postgres check
            check_sql = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='sales_orders' AND column_name='attachment_file';
            """)
            result = await db.execute(check_sql)
            if not result.fetchone():
                await db.execute(text("ALTER TABLE sales_orders ADD COLUMN attachment_file JSONB"))
                print("Startup: Added attachment_file to sales_orders (Postgres)")
            
        await db.commit()


