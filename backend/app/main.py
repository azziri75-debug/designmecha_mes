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
    """Database migrations and initialization tasks on startup"""
    from app.api.deps import AsyncSessionLocal
    from app.models.basics import Staff
    from sqlalchemy.future import select
    from sqlalchemy import text
    import json
    
    async with AsyncSessionLocal() as db:
        db_url = str(db.get_bind().url)
        is_sqlite = "sqlite" in db_url
        
        # 1. Structural Migrations (Before any SQLAlchemy model queries)
        
        # Staff: stamp_image
        if is_sqlite:
            r = await db.execute(text("PRAGMA table_info(staff)"))
            cols = [c[1] for c in r.fetchall()]
            if "stamp_image" not in cols:
                await db.execute(text("ALTER TABLE staff ADD COLUMN stamp_image JSON"))
                print("Startup: Added stamp_image to staff (SQLite)")
        else:
            r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='stamp_image'"))
            if not r.scalar():
                await db.execute(text("ALTER TABLE staff ADD COLUMN stamp_image JSONB"))
                print("Startup: Added stamp_image to staff (Postgres)")
        
        await db.commit() # Commit migration before using model
        
        # 2. Migration for sales_orders attachment_file
        if is_sqlite:
            table_info = await db.execute(text("PRAGMA table_info(sales_orders)"))
            columns = [row[1] for row in table_info.fetchall()]
            if "attachment_file" not in columns:
                await db.execute(text("ALTER TABLE sales_orders ADD COLUMN attachment_file JSON"))
                print("Startup: Added attachment_file to sales_orders (SQLite)")
        else:
            check_sql = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='sales_orders' AND column_name='attachment_file';
            """)
            result = await db.execute(check_sql)
            if not result.fetchone():
                await db.execute(text("ALTER TABLE sales_orders ADD COLUMN attachment_file JSONB"))
                print("Startup: Added attachment_file to sales_orders (Postgres)")

        # 3. Tables Expansion
        new_tables = [
            ("quality_defects", """
                CREATE TABLE quality_defects (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER NOT NULL REFERENCES sales_orders(id),
                    plan_id INTEGER NOT NULL REFERENCES production_plans(id),
                    plan_item_id INTEGER NOT NULL REFERENCES production_plan_items(id),
                    defect_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    defect_reason TEXT NOT NULL,
                    quantity INTEGER DEFAULT 0,
                    amount DOUBLE PRECISION DEFAULT 0.0,
                    status VARCHAR DEFAULT 'OCCURRED',
                    resolution_date TIMESTAMP WITH TIME ZONE,
                    resolution_note TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """),
            ("stocks", """
                CREATE TABLE stocks (
                    id SERIAL PRIMARY KEY,
                    product_id INTEGER NOT NULL UNIQUE REFERENCES products(id),
                    current_quantity INTEGER DEFAULT 0,
                    in_production_quantity INTEGER DEFAULT 0,
                    location VARCHAR,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """),
            ("stock_productions", """
                CREATE TABLE stock_productions (
                    id SERIAL PRIMARY KEY,
                    production_no VARCHAR UNIQUE,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    quantity INTEGER NOT NULL,
                    request_date DATE DEFAULT CURRENT_DATE,
                    target_date DATE,
                    status VARCHAR DEFAULT 'PENDING',
                    note TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """),
            ("equipments", """
                CREATE TABLE equipments (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    code VARCHAR UNIQUE,
                    spec VARCHAR,
                    process_id INTEGER REFERENCES processes(id),
                    status VARCHAR DEFAULT 'IDLE',
                    purchase_date DATE,
                    location VARCHAR,
                    is_active BOOLEAN DEFAULT TRUE
                )
            """),
            ("equipment_histories", """
                CREATE TABLE equipment_histories (
                    id SERIAL PRIMARY KEY,
                    equipment_id INTEGER NOT NULL REFERENCES equipments(id),
                    history_date DATE DEFAULT CURRENT_DATE,
                    history_type VARCHAR NOT NULL,
                    description TEXT NOT NULL,
                    cost DOUBLE PRECISION DEFAULT 0.0,
                    worker_name VARCHAR,
                    attachment_file JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """),
            ("form_templates", """
                CREATE TABLE form_templates (
                    id SERIAL PRIMARY KEY,
                    form_type VARCHAR UNIQUE NOT NULL,
                    name VARCHAR NOT NULL,
                    layout_data JSONB NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """),
            ("approval_lines", """
                CREATE TABLE approval_lines (
                    id SERIAL PRIMARY KEY,
                    doc_type VARCHAR NOT NULL,
                    approver_id INTEGER NOT NULL REFERENCES staff(id),
                    sequence INTEGER NOT NULL
                )
            """),
            ("approval_documents", """
                CREATE TABLE approval_documents (
                    id SERIAL PRIMARY KEY,
                    author_id INTEGER NOT NULL REFERENCES staff(id),
                    doc_type VARCHAR NOT NULL,
                    title VARCHAR NOT NULL,
                    content JSONB NOT NULL,
                    status VARCHAR DEFAULT 'PENDING',
                    current_sequence INTEGER DEFAULT 1,
                    rejection_reason TEXT,
                    attachment_file JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """),
            ("approval_steps", """
                CREATE TABLE approval_steps (
                    id SERIAL PRIMARY KEY,
                    document_id INTEGER NOT NULL REFERENCES approval_documents(id) ON DELETE CASCADE,
                    approver_id INTEGER NOT NULL REFERENCES staff(id),
                    sequence INTEGER NOT NULL,
                    status VARCHAR DEFAULT 'PENDING',
                    comment TEXT,
                    processed_at TIMESTAMP WITH TIME ZONE
                )
            """)
        ]

        for t_name, create_sql in new_tables:
            if is_sqlite:
                check_sql = f"SELECT name FROM sqlite_master WHERE type='table' AND name='{t_name}'"
                sql = create_sql.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")\
                                .replace("JSONB", "JSON")\
                                .replace("CURRENT_DATE", "CURRENT_TIMESTAMP")\
                                .replace("DOUBLE PRECISION", "FLOAT")\
                                .replace("TIMESTAMP WITH TIME ZONE", "TIMESTAMP")\
                                .replace("REFERENCES sales_orders(id)", "REFERENCES sales_orders(id)")\
                                .replace("REFERENCES production_plans(id)", "REFERENCES production_plans(id)")\
                                .replace("REFERENCES production_plan_items(id)", "REFERENCES production_plan_items(id)")
                # Minimal regex-like replacement for basic SQLite compatibility
            else:
                check_sql = f"SELECT to_regclass('public.{t_name}')"
                sql = create_sql

            r = await db.execute(text(check_sql))
            if not r.scalar():
                await db.execute(text(sql))
                print(f"Startup: Created {t_name} table")

        # 4. Alter existing tables for enhancements
        if is_sqlite:
            r = await db.execute(text("PRAGMA table_info(production_plans)"))
            cols = [c[1] for c in r.fetchall()]
            if "stock_production_id" not in cols:
                await db.execute(text("ALTER TABLE production_plans ADD COLUMN stock_production_id INTEGER REFERENCES stock_productions(id)"))
            
            r = await db.execute(text("PRAGMA table_info(production_plan_items)"))
            cols = [c[1] for c in r.fetchall()]
            if "equipment_id" not in cols:
                await db.execute(text("ALTER TABLE production_plan_items ADD COLUMN equipment_id INTEGER REFERENCES equipments(id)"))
            if "worker_id" not in cols:
                await db.execute(text("ALTER TABLE production_plan_items ADD COLUMN worker_id INTEGER REFERENCES staff(id)"))
            if "attachment_file" not in cols:
                await db.execute(text("ALTER TABLE production_plan_items ADD COLUMN attachment_file JSON"))
        else:
            await db.execute(text("ALTER TABLE production_plans ALTER COLUMN order_id DROP NOT NULL"))
            r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='production_plans' AND column_name='stock_production_id'"))
            if not r.scalar():
                await db.execute(text("ALTER TABLE production_plans ADD COLUMN stock_production_id INTEGER REFERENCES stock_productions(id)"))
            r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='production_plan_items' AND column_name='equipment_id'"))
            if not r.scalar():
                await db.execute(text("ALTER TABLE production_plan_items ADD COLUMN equipment_id INTEGER REFERENCES equipments(id)"))
            r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='production_plan_items' AND column_name='worker_id'"))
            if not r.scalar():
                await db.execute(text("ALTER TABLE production_plan_items ADD COLUMN worker_id INTEGER REFERENCES staff(id)"))
            r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='production_plan_items' AND column_name='attachment_file'"))
            if not r.scalar():
                await db.execute(text("ALTER TABLE production_plan_items ADD COLUMN attachment_file JSONB"))

        # 5. Fix WorkLogItems and WorkLogs
        if is_sqlite:
            r = await db.execute(text("PRAGMA table_info(work_log_items)"))
            cols = [c[1] for c in r.fetchall()]
            if "unit_price" not in cols:
                await db.execute(text("ALTER TABLE work_log_items ADD COLUMN unit_price FLOAT DEFAULT 0.0"))
            
            r = await db.execute(text("PRAGMA table_info(work_logs)"))
            cols = [c[1] for c in r.fetchall()]
            if "attachment_file" not in cols:
                await db.execute(text("ALTER TABLE work_logs ADD COLUMN attachment_file JSON"))
        else:
            r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='work_log_items' AND column_name='unit_price'"))
            if not r.scalar():
                await db.execute(text("ALTER TABLE work_log_items ADD COLUMN unit_price DOUBLE PRECISION DEFAULT 0.0"))
            r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='work_logs' AND column_name='attachment_file'"))
            if not r.scalar():
                await db.execute(text("ALTER TABLE work_logs ADD COLUMN attachment_file JSONB"))
        
        await db.commit()

        # 6. Initialize Admin User (Using Staff Model)
        ALL_MENUS = ["basics", "products", "sales", "production", "purchase", "outsourcing", "quality", "inventory", "approval"]
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
            print("Startup: Updated admin '이준호' settings")
            
        # 7. Initialize Default Form Templates
        DEFAULT_FORMS = [
            {"form_type": "ESTIMATE", "name": "견적서"},
            {"form_type": "PRODUCTION_SHEET", "name": "생산관리시트"},
            {"form_type": "ESTIMATE_REQUEST", "name": "견적의뢰서"},
            {"form_type": "PURCHASE_ORDER", "name": "구매발주서"}
        ]
        for f in DEFAULT_FORMS:
            chk = await db.execute(text(f"SELECT id FROM form_templates WHERE form_type='{f['form_type']}'"))
            if not chk.scalar():
                layout = {
                    "header": {"title": f["name"], "show_logo": True},
                    "table": {"columns": []},
                    "footer": {"note": "감사합니다."}
                }
                await db.execute(text(
                    "INSERT INTO form_templates (form_type, name, layout_data, is_active) VALUES (:ft, :nm, :ld, :ia)"
                ), {"ft": f["form_type"], "nm": f["name"], "ld": json.dumps(layout), "ia": True})
                print(f"Startup: Created default form template '{f['name']}'")
        
        # 8. Fix Process Deletion Constraints (Postgres Only)
        if not is_sqlite:
            for table in ['equipments', 'product_processes', 'inspection_processes']:
                try:
                    find_con = text(f"""
                        SELECT conname FROM pg_constraint 
                        INNER JOIN pg_class ON connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') 
                        AND pg_class.oid = conrelid 
                        WHERE pg_class.relname = '{table}' AND contype = 'f' 
                        AND confrelid = (SELECT oid FROM pg_class WHERE relname = 'processes');
                    """)
                    res = await db.execute(find_con)
                    con_name = res.scalar()
                    if con_name:
                        await db.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT {con_name}"))
                    
                    if table == 'equipments':
                         await db.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT {table}_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL"))
                    else:
                         await db.execute(text(f"ALTER TABLE {table} ALTER COLUMN process_id DROP NOT NULL"))
                         await db.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT {table}_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL"))
                except Exception as e: print(f"Startup: {table} FK update failed: {e}")

        await db.commit()


