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
    os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/api/v1/static", CORSStaticFiles(directory=UPLOAD_DIR), name="static")

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
    import traceback
    error_details = traceback.format_exc()
    error_msg = f"Global Exception: {exc}\n{error_details}"
    print(error_msg)
    
    # Log to file
    try:
        with open("backend_global_error.log", "a", encoding="utf-8") as f:
            f.write(error_msg + "\n")
    except:
        pass

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

from app.api.endpoints import quality
app.include_router(quality.router, prefix=f"{settings.API_V1_STR}/quality", tags=["quality"])

@app.get("/")
async def root():
    return {"status": "ok", "message": "MES ERP Backend is running"}

@app.get("/api/v1/force-fix-db")
async def force_fix_db():
    """강제로 사원 테이블의 누락된 모든 컬럼을 추가합니다. (최상위 경로)"""
    from app.api.deps import AsyncSessionLocal, STAFF_COLUMNS
    from sqlalchemy import text
    
    results = []
    async with AsyncSessionLocal() as db:
        # 트랜잭션을 확실히 초기화
        await db.rollback()
        
        for col_name, col_def in STAFF_COLUMNS:
            try:
                await db.execute(text(f"ALTER TABLE staff ADD COLUMN {col_name} {col_def}"))
                await db.commit()
                results.append(f"✅ {col_name}: 성공")
            except Exception as e:
                await db.rollback()
                error_str = str(e).lower()
                if "already exists" in error_str or "이미 존재" in error_str:
                    results.append(f"ℹ️ {col_name}: 이미 존재함")
                else:
                    results.append(f"❌ {col_name}: 오류 ({str(e)})")
                
    return {
        "message": "사원 테이블 강제 마이그레이션 결과 (Top-level)",
        "details": results,
        "hint": "모든 항목이 성공 또는 이미 존재함으로 나오면, 사원 관리 페이지를 새로고침해 보세요."
    }

@app.get("/api/v1/fix-orphaned-mrp")
async def fix_orphaned_mrp():
    """납품/생산 완료 후에도 미발주 리스트에 남아있는 데이터를 강제로 정리합니다."""
    from app.api.deps import AsyncSessionLocal
    from sqlalchemy import select, or_
    from app.models.purchasing import MaterialRequirement
    from app.models.production import ProductionPlan, ProductionStatus
    from app.models.sales import SalesOrder, OrderStatus
    
    count = 0
    async with AsyncSessionLocal() as db:
        # 1. 생산 계획이 완료된 것들
        stmt1 = (
            select(MaterialRequirement)
            .join(ProductionPlan, MaterialRequirement.plan_id == ProductionPlan.id)
            .where(
                MaterialRequirement.status == "PENDING",
                ProductionPlan.status == ProductionStatus.COMPLETED
            )
        )
        
        # 2. 수주 자체가 생산완료/납품완료인 것들
        stmt2 = (
            select(MaterialRequirement)
            .join(SalesOrder, MaterialRequirement.order_id == SalesOrder.id)
            .where(
                MaterialRequirement.status == "PENDING",
                or_(
                    SalesOrder.status == OrderStatus.DELIVERY_COMPLETED,
                    SalesOrder.status == OrderStatus.PRODUCTION_COMPLETED
                )
            )
        )
        
        res1 = await db.execute(stmt1)
        res2 = await db.execute(stmt2)
        
        all_to_fix = {mr.id: mr for mr in list(res1.scalars().all()) + list(res2.scalars().all())}
        
        for mr_id, mr in all_to_fix.items():
            mr.status = "COMPLETED"
            db.add(mr)
            count += 1
            
        if count > 0:
            await db.commit()
            
    return {"message": f"성공적으로 {count}건의 미결 데이터를 종결 처리했습니다."}

@app.on_event("startup")
async def startup_event():
    """Database migrations and initialization tasks on startup"""
    from app.api.deps import AsyncSessionLocal, engine
    from app.models.basics import Staff
    from sqlalchemy.future import select
    from sqlalchemy import text
    import json
    
    try:
        async with AsyncSessionLocal() as db:
            db_url = str(db.get_bind().url)
            is_sqlite = "sqlite" in db_url
            
            # 1. Structural Migrations (Before any SQLAlchemy model queries)
            try:
                # Staff: stamp_image, mac_address, ip_address, login_id, department, email, join_date
                if is_sqlite:
                    r = await db.execute(text("PRAGMA table_info(staff)"))
                    cols = [c[1] for c in r.fetchall()]
                    if "stamp_image" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN stamp_image JSON"))
                        print("Startup: Added stamp_image to staff (SQLite)")
                    if "mac_address" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN mac_address VARCHAR"))
                        print("Startup: Added mac_address to staff (SQLite)")
                    if "ip_address" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN ip_address VARCHAR"))
                        print("Startup: Added ip_address to staff (SQLite)")
                    if "login_id" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN login_id VARCHAR"))
                        print("Startup: Added login_id to staff (SQLite)")
                    if "department" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN department VARCHAR"))
                        print("Startup: Added department to staff (SQLite)")
                    if "email" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN email VARCHAR"))
                        print("Startup: Added email to staff (SQLite)")
                    if "join_date" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN join_date DATE"))
                        print("Startup: Added join_date to staff (SQLite)")
                    if "is_sysadmin" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN is_sysadmin BOOLEAN DEFAULT 0"))
                        print("Startup: Added is_sysadmin to staff (SQLite)")
                    if "can_access_external" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN can_access_external BOOLEAN DEFAULT 0"))
                        print("Startup: Added can_access_external to staff (SQLite)")
                    if "can_view_others" not in cols:
                        await db.execute(text("ALTER TABLE staff ADD COLUMN can_view_others BOOLEAN DEFAULT 0"))
                        print("Startup: Added can_view_others to staff (SQLite)")
                        
                    # PurchaseOrderItem migrations
                    poi_cols = await db.execute(text("PRAGMA table_info('purchase_order_items')"))
                    poi_cols_list = [row[1] for row in poi_cols.fetchall()]
                    if "consumable_purchase_wait_id" not in poi_cols_list:
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN consumable_purchase_wait_id INTEGER"))
                        print("Startup: Added consumable_purchase_wait_id to purchase_order_items (SQLite)")

                    # PurchaseOrders, OutsourcingOrders migrations
                    po_cols = await db.execute(text("PRAGMA table_info('purchase_orders')"))
                    po_cols_list = [row[1] for row in po_cols.fetchall()]
                    if "actual_delivery_date" not in po_cols_list:
                        await db.execute(text("ALTER TABLE purchase_orders ADD COLUMN actual_delivery_date DATE"))
                        print("Startup: Added actual_delivery_date to purchase_orders (SQLite)")
                    if "purchase_type" not in po_cols_list:
                        await db.execute(text("ALTER TABLE purchase_orders ADD COLUMN purchase_type VARCHAR DEFAULT 'PART'"))
                        print("Startup: Added purchase_type to purchase_orders (SQLite)")
                        
                    oo_cols = await db.execute(text("PRAGMA table_info('outsourcing_orders')"))
                    oo_cols_list = [row[1] for row in oo_cols.fetchall()]
                    if "actual_delivery_date" not in oo_cols_list:
                        await db.execute(text("ALTER TABLE outsourcing_orders ADD COLUMN actual_delivery_date DATE"))
                        print("Startup: Added actual_delivery_date to outsourcing_orders (SQLite)")

                    # employee_time_records migrations
                    etr_cols = await db.execute(text("PRAGMA table_info('employee_time_records')"))
                    etr_cols_list = [row[1] for row in etr_cols.fetchall()]
                    if "approval_id" not in etr_cols_list:
                        await db.execute(text("ALTER TABLE employee_time_records ADD COLUMN approval_id INTEGER"))
                        print("Startup: Added approval_id to employee_time_records (SQLite)")

                    # Weight-based pricing migrations (SQLite)
                    poi_cols = await db.execute(text("PRAGMA table_info('purchase_order_items')"))
                    poi_cols_list = [row[1] for row in poi_cols.fetchall()]
                    if "pricing_type" not in poi_cols_list:
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN pricing_type VARCHAR DEFAULT 'UNIT'"))
                        print("Startup: Added pricing_type to purchase_order_items (SQLite)")
                    if "total_weight" not in poi_cols_list:
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN total_weight FLOAT"))
                        print("Startup: Added total_weight to purchase_order_items (SQLite)")

                    ooi_cols = await db.execute(text("PRAGMA table_info('outsourcing_order_items')"))
                    ooi_cols_list = [row[1] for row in ooi_cols.fetchall()]
                    if "pricing_type" not in ooi_cols_list:
                        await db.execute(text("ALTER TABLE outsourcing_order_items ADD COLUMN pricing_type VARCHAR DEFAULT 'UNIT'"))
                        print("Startup: Added pricing_type to outsourcing_order_items (SQLite)")
                    if "total_weight" not in ooi_cols_list:
                        await db.execute(text("ALTER TABLE outsourcing_order_items ADD COLUMN total_weight FLOAT"))
                        print("Startup: Added total_weight to outsourcing_order_items (SQLite)")
                else:
                    # stamp_image
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='stamp_image'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE staff ADD COLUMN stamp_image JSONB"))
                        print("Startup: Added stamp_image to staff (Postgres)")
                    # mac_address
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='mac_address'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE staff ADD COLUMN mac_address VARCHAR"))
                        print("Startup: Added mac_address to staff (Postgres)")
                    # ip_address
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='ip_address'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE staff ADD COLUMN ip_address VARCHAR"))
                        print("Startup: Added ip_address to staff (Postgres)")
                    # login_id
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='login_id'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE staff ADD COLUMN login_id VARCHAR"))
                        print("Startup: Added login_id to staff (Postgres)")
                    # department
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='department'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE staff ADD COLUMN department VARCHAR"))
                        print("Startup: Added department to staff (Postgres)")
                    # email
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='email'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE staff ADD COLUMN email VARCHAR"))
                        print("Startup: Added email to staff (Postgres)")
                    # join_date
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='staff' AND column_name='join_date'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE staff ADD COLUMN join_date DATE"))
                        print("Startup: Added join_date to staff (Postgres)")
                        
                    # PurchaseOrderItem migrations
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_order_items' AND column_name='consumable_purchase_wait_id'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN consumable_purchase_wait_id INTEGER"))
                        print("Startup: Added consumable_purchase_wait_id to purchase_order_items (Postgres)")

                    # PurchaseOrders, OutsourcingOrders migrations
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='actual_delivery_date'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE purchase_orders ADD COLUMN actual_delivery_date DATE"))
                        print("Startup: Added actual_delivery_date to purchase_orders (Postgres)")
                    
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='purchase_type'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE purchase_orders ADD COLUMN purchase_type VARCHAR DEFAULT 'PART'"))
                        print("Startup: Added purchase_type to purchase_orders (Postgres)")
                        
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='outsourcing_orders' AND column_name='actual_delivery_date'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE outsourcing_orders ADD COLUMN actual_delivery_date DATE"))
                        print("Startup: Added actual_delivery_date to outsourcing_orders (Postgres)")

                    # employee_time_records migrations
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='employee_time_records' AND column_name='approval_id'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE employee_time_records ADD COLUMN approval_id INTEGER"))
                        print("Startup: Added approval_id to employee_time_records (Postgres)")

                    # Weight-based pricing migrations (Postgres)
                    # 1. Enum type
                    try:
                        await db.execute(text("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricingtype') THEN CREATE TYPE pricingtype AS ENUM ('UNIT', 'WEIGHT'); END IF; END $$;"))
                    except Exception as e:
                        print(f"Startup: PricingType Enum creation failed: {e}")
                    
                    # 2. purchase_order_items columns
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_order_items' AND column_name='pricing_type'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN pricing_type pricingtype DEFAULT 'UNIT'"))
                        print("Startup: Added pricing_type to purchase_order_items (Postgres)")
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_order_items' AND column_name='total_weight'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN total_weight DOUBLE PRECISION"))
                        print("Startup: Added total_weight to purchase_order_items (Postgres)")

                    # 3. outsourcing_order_items columns
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='outsourcing_order_items' AND column_name='pricing_type'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE outsourcing_order_items ADD COLUMN pricing_type pricingtype DEFAULT 'UNIT'"))
                        print("Startup: Added pricing_type to outsourcing_order_items (Postgres)")
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='outsourcing_order_items' AND column_name='total_weight'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE outsourcing_order_items ADD COLUMN total_weight DOUBLE PRECISION"))
                        print("Startup: Added total_weight to outsourcing_order_items (Postgres)")
                    
                    # [Hard Cleanup] 유령 근태 데이터 강제 삭제
                    # approval_id가 NULL이거나 연결된 결재 문서가 삭제된 기록을 서버 시작 시 자동으로 정리
                    await db.execute(text("""
                        DELETE FROM employee_time_records 
                        WHERE category IN ('휴가', '연차', '외출', '반차', 'ANNUAL', 'HALF_DAY', 'OUTING', 'EARLY_LEAVE')
                        AND (
                            approval_id IS NULL
                            OR approval_id IN (
                                SELECT id FROM approval_documents WHERE deleted_at IS NOT NULL
                            )
                        )
                    """))
                    print("Startup: Zombie employee_time_records cleaned up (Postgres)")
                    
                    await db.commit()
                
                await db.commit() # Commit migration before using model
            except Exception as e:
                print(f"Startup: Staff migration failed: {e}")
                await db.rollback()
            
            # 2. Migration for sales_orders attachment_file
            try:
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
                await db.commit()
            except Exception as e:
                print(f"Startup: Sales orders migration failed: {e}")
                await db.rollback()

            # 5. Clean up existing consumable stock data (requested by user)
            try:
                await db.execute(text("DELETE FROM stocks WHERE product_id IN (SELECT id FROM products WHERE item_type = 'CONSUMABLE')"))
                await db.commit()
                print("Successfully cleaned up existing consumable stocks.")
            except Exception as e:
                print(f"Failed to clean up consumable stocks: {e}")
                await db.rollback()
                
            # 3. Base Table Creation (Safe Sync Fix)
            try:
                # Use run_sync to avoid AsyncEngine/Sync create_all conflict
                async with engine.begin() as conn:
                    await conn.run_sync(Staff.metadata.create_all)
                print("Startup: Base tables verified/created")
            except Exception as e:
                print(f"Startup: Table creation failed: {e}")

            # 4. Tables Expansion (Manual SQL for specific structures)
            new_tables = [
                ("partners", """
                    CREATE TABLE partners (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR NOT NULL,
                        partner_type JSONB,
                        registration_number VARCHAR,
                        representative VARCHAR,
                        address VARCHAR,
                        phone VARCHAR,
                        email VARCHAR,
                        description VARCHAR,
                        attachment_file JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("product_groups", """
                    CREATE TABLE product_groups (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR NOT NULL,
                        type VARCHAR NOT NULL,
                        parent_id INTEGER REFERENCES product_groups(id),
                        description TEXT
                    )
                """),
                ("processes", """
                    CREATE TABLE processes (
                        id SERIAL PRIMARY KEY,
                        group_id INTEGER REFERENCES product_groups(id),
                        name VARCHAR NOT NULL,
                        course_type VARCHAR DEFAULT 'INTERNAL',
                        description TEXT
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
                ("products", """
                    CREATE TABLE products (
                        id SERIAL PRIMARY KEY,
                        group_id INTEGER REFERENCES product_groups(id),
                        partner_id INTEGER REFERENCES partners(id),
                        name VARCHAR NOT NULL,
                        specification VARCHAR,
                        material VARCHAR,
                        unit VARCHAR DEFAULT 'EA',
                        drawing_file VARCHAR,
                        note TEXT,
                        item_type VARCHAR DEFAULT 'PRODUCED',
                        recent_price DOUBLE PRECISION DEFAULT 0.0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("inventory", """
                    CREATE TABLE inventory (
                        id SERIAL PRIMARY KEY,
                        product_id INTEGER UNIQUE REFERENCES products(id),
                        quantity INTEGER DEFAULT 0,
                        location VARCHAR
                    )
                """),
                ("bom", """
                    CREATE TABLE bom (
                        id SERIAL PRIMARY KEY,
                        parent_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        child_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                        required_quantity DOUBLE PRECISION DEFAULT 1.0
                    )
                """),
                ("sales_orders", """
                    CREATE TABLE sales_orders (
                        id SERIAL PRIMARY KEY,
                        order_no VARCHAR UNIQUE,
                        partner_id INTEGER REFERENCES partners(id),
                        order_date DATE DEFAULT CURRENT_DATE,
                        delivery_date DATE,
                        actual_delivery_date DATE,
                        delivery_method VARCHAR,
                        transaction_date DATE,
                        total_amount DOUBLE PRECISION DEFAULT 0.0,
                        note TEXT,
                        status VARCHAR DEFAULT 'PENDING',
                        attachment_file JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("sales_order_items", """
                    CREATE TABLE sales_order_items (
                        id SERIAL PRIMARY KEY,
                        order_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id),
                        unit_price DOUBLE PRECISION NOT NULL,
                        quantity INTEGER NOT NULL,
                        delivered_quantity INTEGER DEFAULT 0,
                        status VARCHAR DEFAULT 'PENDING',
                        note TEXT
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
                ("production_plans", """
                    CREATE TABLE production_plans (
                        id SERIAL PRIMARY KEY,
                        order_id INTEGER REFERENCES sales_orders(id),
                        stock_production_id INTEGER REFERENCES stock_productions(id) ON DELETE CASCADE,
                        plan_date DATE NOT NULL,
                        status VARCHAR DEFAULT 'PLANNED',
                        attachment_file JSONB,
                        sheet_metadata JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("production_plan_items", """
                    CREATE TABLE production_plan_items (
                        id SERIAL PRIMARY KEY,
                        plan_id INTEGER NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id),
                        process_name VARCHAR NOT NULL,
                        sequence INTEGER NOT NULL,
                        course_type VARCHAR DEFAULT 'INTERNAL',
                        quantity INTEGER DEFAULT 1,
                        partner_name VARCHAR,
                        work_center VARCHAR,
                        estimated_time DOUBLE PRECISION,
                        start_date DATE,
                        end_date DATE,
                        worker_id INTEGER REFERENCES staff(id),
                        equipment_id INTEGER REFERENCES equipments(id),
                        status VARCHAR DEFAULT 'PLANNED',
                        cost DOUBLE PRECISION DEFAULT 0.0,
                        attachment_file JSONB,
                        note TEXT
                    )
                """),
                ("work_orders", """
                    CREATE TABLE work_orders (
                        id SERIAL PRIMARY KEY,
                        plan_item_id INTEGER REFERENCES production_plan_items(id) ON DELETE CASCADE,
                        process_name VARCHAR NOT NULL,
                        worker_id INTEGER REFERENCES staff(id),
                        status VARCHAR DEFAULT 'PENDING',
                        work_date DATE,
                        good_quantity INTEGER DEFAULT 0,
                        bad_quantity INTEGER DEFAULT 0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("work_logs", """
                    CREATE TABLE work_logs (
                        id SERIAL PRIMARY KEY,
                        work_date DATE NOT NULL,
                        worker_id INTEGER REFERENCES staff(id),
                        note TEXT,
                        attachment_file JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("work_log_items", """
                    CREATE TABLE work_log_items (
                        id SERIAL PRIMARY KEY,
                        work_log_id INTEGER NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
                        plan_item_id INTEGER NOT NULL REFERENCES production_plan_items(id) ON DELETE CASCADE,
                        worker_id INTEGER REFERENCES staff(id),
                        start_time TIMESTAMP WITH TIME ZONE,
                        end_time TIMESTAMP WITH TIME ZONE,
                        good_quantity INTEGER DEFAULT 0,
                        bad_quantity INTEGER DEFAULT 0,
                        unit_price DOUBLE PRECISION DEFAULT 0.0,
                        note TEXT
                    )
                """),
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
                """),
                ("consumable_purchase_waits", """
                    CREATE TABLE consumable_purchase_waits (
                        id SERIAL PRIMARY KEY,
                        approval_id INTEGER NOT NULL REFERENCES approval_documents(id) ON DELETE CASCADE,
                        product_id INTEGER NOT NULL REFERENCES products(id),
                        quantity INTEGER NOT NULL,
                        remarks VARCHAR,
                        status VARCHAR DEFAULT 'PENDING',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("employee_annual_leaves", """
                    CREATE TABLE employee_annual_leaves (
                        id SERIAL PRIMARY KEY,
                        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                        year INTEGER NOT NULL,
                        base_days DOUBLE PRECISION DEFAULT 0.0,
                        adjustment_days DOUBLE PRECISION DEFAULT 0.0,
                        used_leave_hours DOUBLE PRECISION DEFAULT 0.0,
                        sick_leave_days DOUBLE PRECISION DEFAULT 0.0,
                        event_leave_days DOUBLE PRECISION DEFAULT 0.0,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("delivery_histories", """
                    CREATE TABLE delivery_histories (
                        id SERIAL PRIMARY KEY,
                        order_id INTEGER NOT NULL REFERENCES sales_orders(id),
                        delivery_date DATE DEFAULT CURRENT_DATE,
                        delivery_no VARCHAR UNIQUE,
                        note TEXT,
                        attachment_files JSONB,
                        statement_json JSONB,
                        supplier_info JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("delivery_history_items", """
                    CREATE TABLE delivery_history_items (
                        id SERIAL PRIMARY KEY,
                        delivery_id INTEGER NOT NULL REFERENCES delivery_histories(id) ON DELETE CASCADE,
                        order_item_id INTEGER NOT NULL REFERENCES sales_order_items(id),
                        quantity INTEGER NOT NULL
                    )
                """),
                ("customer_complaints", """
                    CREATE TABLE customer_complaints (
                        id SERIAL PRIMARY KEY,
                        partner_id INTEGER NOT NULL REFERENCES partners(id),
                        order_id INTEGER REFERENCES sales_orders(id),
                        delivery_history_id INTEGER REFERENCES delivery_histories(id),
                        receipt_date DATE DEFAULT CURRENT_DATE,
                        content TEXT NOT NULL,
                        action_note TEXT,
                        status VARCHAR DEFAULT 'RECEIVED',
                        attachment_files JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
                ("ignored_partner_duplicates", """
                    CREATE TABLE ignored_partner_duplicates (
                        id SERIAL PRIMARY KEY,
                        partner_id_1 INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                        partner_id_2 INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """),
            ]

            # [Safe Migration] Add reference columns and deleted_at column to approval_documents if missing
            try:
                if is_sqlite:
                    r = await db.execute(text("PRAGMA table_info(approval_documents)"))
                    cols = [c[1] for c in r.fetchall()]
                    if "deleted_at" not in cols:
                        try:
                            await db.execute(text("ALTER TABLE approval_documents ADD COLUMN deleted_at TIMESTAMP"))
                            print("Startup: Added deleted_at to approval_documents (SQLite)")
                        except Exception as inner_e:
                            print(f"Startup: Could not add deleted_at (SQLite): {inner_e}")
                    
                    if "reference_id" not in cols:
                        try:
                            await db.execute(text("ALTER TABLE approval_documents ADD COLUMN reference_id INTEGER"))
                            print("Startup: Added reference_id to approval_documents (SQLite)")
                        except Exception as inner_e:
                            print(f"Startup: Could not add reference_id (SQLite): {inner_e}")
                            
                    if "reference_type" not in cols:
                        try:
                            await db.execute(text("ALTER TABLE approval_documents ADD COLUMN reference_type VARCHAR"))
                            print("Startup: Added reference_type to approval_documents (SQLite)")
                        except Exception as inner_e:
                            print(f"Startup: Could not add reference_type (SQLite): {inner_e}")
                else:
                    # Postgres safety checks
                    check_cols = ["deleted_at", "reference_id", "reference_type"]
                    for col_name in check_cols:
                        r = await db.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name='approval_documents' AND column_name='{col_name}'"))
                        if not r.scalar():
                            try:
                                col_type = "TIMESTAMP" if col_name == "deleted_at" else ("INTEGER" if col_name == "reference_id" else "VARCHAR")
                                await db.execute(text(f"ALTER TABLE approval_documents ADD COLUMN {col_name} {col_type}"))
                                print(f"Startup: Added {col_name} to approval_documents (Postgres)")
                            except Exception as inner_e:
                                print(f"Startup: Could not add {col_name} (Postgres): {inner_e}")
                await db.commit()
            except Exception as e:
                print(f"Startup: approval_documents safety patch failed: {e}")
                await db.rollback()

            for t_name, create_sql in new_tables:
                try:
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
                    else:
                        check_sql = f"SELECT to_regclass('public.{t_name}')"
                        sql = create_sql

                    r = await db.execute(text(check_sql))
                    if not r.scalar():
                        await db.execute(text(sql))
                        await db.commit()
                        print(f"Startup: Created {t_name} table")
                except Exception as e:
                    print(f"Startup: Failed to create table {t_name}: {e}")
                    await db.rollback()

            # 5. Alter existing tables for enhancements
            try:
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

                # [Unify Approval Doc Types]
                # SUPPLIES -> CONSUMABLES_PURCHASE, VACATION -> LEAVE_REQUEST
                # Unified migration for both SQLite & Postgres
                await db.execute(text("UPDATE approval_documents SET doc_type = 'CONSUMABLES_PURCHASE' WHERE doc_type = 'SUPPLIES'"))
                await db.execute(text("UPDATE approval_documents SET doc_type = 'LEAVE_REQUEST' WHERE doc_type = 'VACATION'"))
                await db.execute(text("UPDATE approval_lines SET doc_type = 'CONSUMABLES_PURCHASE' WHERE doc_type = 'SUPPLIES'"))
                await db.execute(text("UPDATE approval_lines SET doc_type = 'LEAVE_REQUEST' WHERE doc_type = 'VACATION'"))

                # [NEW] Cleanup: Remove CEO from routine approvals (Legacy mobile bug fix)
                # Identify CEO ID and remove from steps for routine request types
                ceo_res = await db.execute(text("SELECT id FROM staff WHERE role = '대표이사' LIMIT 1"))
                ceo_id = ceo_res.scalar()
                if ceo_id:
                    # Delete CEO steps for routine docs that are still pending/in_progress
                    await db.execute(text(f"""
                        DELETE FROM approval_steps 
                        WHERE approver_id = {ceo_id}
                        AND document_id IN (
                            SELECT id FROM approval_documents 
                            WHERE doc_type IN ('CONSUMABLES_PURCHASE', 'LEAVE_REQUEST')
                            AND status IN ('PENDING', 'IN_PROGRESS')
                        )
                    """))
                    
                    # Synchronize document status: mark as COMPLETED if no pending steps remain
                    await db.execute(text("""
                        UPDATE approval_documents
                        SET status = 'COMPLETED'
                        WHERE doc_type IN ('CONSUMABLES_PURCHASE', 'LEAVE_REQUEST')
                        AND status IN ('PENDING', 'IN_PROGRESS')
                        AND id NOT IN (
                            SELECT DISTINCT document_id FROM approval_steps WHERE status = 'PENDING'
                        )
                    """))
                    print("Startup: Cleaned up legacy CEO approval steps for routine requests")

                print("Startup: Unified approval document types (Global)")

                await db.commit()
            except Exception as e:
                print(f"Startup: Alter table failed: {e}")
                await db.rollback()

            # 6. Fix WorkLogItems and WorkLogs
            try:
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
            except Exception as e:
                print(f"Startup: WorkLog fix failed: {e}")
                await db.rollback()
            
            # --- [NEW] Raw SQL Permission Migration (PostgreSQL) ---
            try:
                await db.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_sysadmin BOOLEAN DEFAULT FALSE;"))
                await db.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS can_access_external BOOLEAN DEFAULT FALSE;"))
                await db.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS can_view_others BOOLEAN DEFAULT FALSE;"))
                print("Startup: Permission columns verified/added via Raw SQL")
                await db.commit()
            except Exception as e:
                print(f"Startup: Raw SQL migration failed: {e}")
                await db.rollback()
            # -----------------------------------------------------

            # --- [NEW] Department System Migration ---
            try:
                # 1. departments 테이블 생성
                await db.execute(text("""
                    CREATE TABLE IF NOT EXISTS departments (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR NOT NULL UNIQUE,
                        description TEXT,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                """))
                # 2. staff.department_id 추가
                await db.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;"))
                # 3. approval_lines.department_id 추가
                await db.execute(text("ALTER TABLE approval_lines ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE;"))
                # 4. staff.extension 추가 (내선번호)
                await db.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS extension VARCHAR(20);"))
                await db.commit()
                print("Startup: Department system tables/columns verified/created")

                # 4. 기존 staff.department 문자열 → departments 테이블 자동 매핑
                dept_rows = await db.execute(text("""
                    SELECT DISTINCT department FROM staff
                    WHERE department IS NOT NULL AND department != '' AND department_id IS NULL
                """))
                dept_names = [row[0] for row in dept_rows.fetchall()]
                for dept_name in dept_names:
                    result = await db.execute(text("""
                        INSERT INTO departments (name, created_at)
                        VALUES (:name, NOW())
                        ON CONFLICT (name) DO NOTHING
                        RETURNING id
                    """), {"name": dept_name})
                    row = result.fetchone()
                    if not row:
                        row = (await db.execute(text("SELECT id FROM departments WHERE name = :name"), {"name": dept_name})).fetchone()
                    if row:
                        dept_id = row[0]
                        upd = await db.execute(text("UPDATE staff SET department_id = :did WHERE department = :dname AND department_id IS NULL"), {"did": dept_id, "dname": dept_name})
                        print(f"Startup: Dept '{dept_name}' → id={dept_id}, mapped {upd.rowcount} staff")
                await db.commit()
                print("Startup: Department auto-migration complete")
            except Exception as e:
                print(f"Startup: Department migration failed: {e}")
                await db.rollback()
            # ------------------------------------------------

            # --- [NEW] Sales Item Columns Migration (Postgres) ---
            # estimate_items: add product_name, make product_id nullable
            try:
                await db.execute(text("ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS product_name VARCHAR;"))
                await db.execute(text("ALTER TABLE estimate_items ALTER COLUMN product_id DROP NOT NULL;"))
                await db.commit()
                print("Startup: estimate_items.product_name added / product_id nullable (Postgres)")
            except Exception as e:
                print(f"Startup: estimate_items migration failed: {e}")
                await db.rollback()

            # sales_order_items: add product_name, make product_id nullable
            try:
                await db.execute(text("ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS product_name VARCHAR;"))
                await db.execute(text("ALTER TABLE sales_order_items ALTER COLUMN product_id DROP NOT NULL;"))
                await db.commit()
                print("Startup: sales_order_items.product_name added / product_id nullable (Postgres)")
            except Exception as e:
                print(f"Startup: sales_order_items migration failed: {e}")
                await db.rollback()
            # -------------------------------------------------------

            # --- [CURRENCY] 통화 컬럼 마이그레이션 ---
            try:
                await db.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS price_currency VARCHAR(3) DEFAULT 'KRW';"))
                await db.execute(text("ALTER TABLE product_price_histories ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KRW';"))
                await db.execute(text("ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KRW';"))
                await db.execute(text("ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KRW';"))
                await db.execute(text("ALTER TABLE delivery_history_items ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KRW';"))
                await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KRW';"))
                await db.commit()
                print("Startup: currency columns added to products/estimates/orders/delivery/purchase")
            except Exception as e:
                print(f"Startup: currency migration failed: {e}")
                await db.rollback()
            # -------------------------------------------------------

            # 7. [EMERGENCY] Initialize Admin User via Raw SQL (Bypassing ORM constraints)
            try:
                from passlib.context import CryptContext
                pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                hashed_pw = pwd_context.hash('5446220')
                
                # Full permissions for admin (JSON structure)
                FULL_PERMISSIONS = {
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
                import json
                perms_json = json.dumps(FULL_PERMISSIONS)

                # Try Raw SQL Insert first
                try:
                    await db.execute(text("""
                        INSERT INTO staff (login_id, name, password, role, department, main_duty, user_type, phone, is_active, is_sysadmin, can_access_external, can_view_others, menu_permissions)
                        VALUES ('admin', '관리자', :pw, 'MANAGER', '시스템관리부', '시스템 총괄', 'ADMIN', '010-0000-0000', true, true, true, true, :perms)
                    """), {"pw": hashed_pw, "perms": perms_json})
                    await db.commit()
                    print("✅ [RAW SQL SUCCESS] Admin created successfully!")
                except Exception as e:
                    await db.rollback()
                    # If exists, force update password and permissions
                    await db.execute(text("""
                        UPDATE staff SET 
                            password=:pw, 
                            is_sysadmin=true, 
                            can_access_external=true, 
                            can_view_others=true,
                            menu_permissions=:perms,
                            is_active=true
                        WHERE login_id='admin'
                    """), {"pw": hashed_pw, "perms": perms_json})
                    await db.commit()
                    print(f"⚠️ [RAW SQL UPDATE] Admin updated/forced: {e}")
            except Exception as e:
                await db.rollback()
                print(f"❌ [CRITICAL RAW SQL FAILURE] Failed to init admin: {e}")
                import traceback
                print(traceback.format_exc())
                
            # 8. Initialize Default Form Templates
            try:
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
                await db.commit()
            except Exception as e:
                print(f"Startup: Template init failed: {e}")
                await db.rollback()
            
            # 9. Fix Process Deletion Constraints (Postgres Only)
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
                        await db.commit()
                    except Exception as e: print(f"Startup: {table} FK update failed: {e}")

                # 10. [AUTO-FIX] Status Cascade Sync (SO -> Plan -> PO)
                try:
                    from app.api.utils.status_cascade import complete_production_for_order, on_production_item_completed
                    from app.models.sales import SalesOrder, OrderStatus
                    from app.models.production import ProductionPlan, ProductionPlanItem, ProductionStatus
                    
                    # A. 납품 완료된 수주 조사 및 연계
                    so_stmt = select(SalesOrder).where(SalesOrder.status == OrderStatus.DELIVERY_COMPLETED)
                    so_res = await db.execute(so_stmt)
                    for so in so_res.scalars().all():
                        await complete_production_for_order(db, order_id=so.id, reference="Startup-Fix")
                        
                    # B. 생산 완료된 계획 조사 및 연계 (미발주 건 자동 생성 및 날짜 동기화)
                    plan_stmt = select(ProductionPlan).where(ProductionPlan.status == ProductionStatus.COMPLETED)
                    plan_res = await db.execute(plan_stmt)
                    for plan in plan_res.scalars().all():
                        # [보강] 수주가 있는 경우 수주의 날짜를, 없으면 당일 날짜를 완료일로 설정
                        comp_date = plan.actual_completion_date or now_kst().date()
                        if plan.order:
                            comp_date = plan.order.actual_delivery_date or comp_date
                        
                        if not plan.actual_completion_date:
                            plan.actual_completion_date = comp_date
                            db.add(plan)

                        ppi_stmt = select(ProductionPlanItem).where(
                            ProductionPlanItem.plan_id == plan.id,
                            ProductionPlanItem.status == ProductionStatus.COMPLETED
                        )
                        ppi_res = await db.execute(ppi_stmt)
                        for item in ppi_res.scalars().all():
                            await on_production_item_completed(db, item, reference="Startup-Fix", completion_date=comp_date)
                    
                    await db.commit()
                    print("✅ [STARTUP] Status cascade synchronization completed successfully!")
                except Exception as e:
                    await db.rollback()
                    print(f"❌ [STARTUP] Status cascade synchronization failed: {e}")
            # 10. Fix Companies Table Missing Columns (Auto-Patch)
            try:
                if is_sqlite:
                    r = await db.execute(text("PRAGMA table_info(companies)"))
                    cols = [c[1] for c in r.fetchall()]
                    if "work_start_time" not in cols:
                        await db.execute(text("ALTER TABLE companies ADD COLUMN work_start_time TIME"))
                        print("Startup: Added work_start_time to companies (SQLite)")
                    if "work_end_time" not in cols:
                        await db.execute(text("ALTER TABLE companies ADD COLUMN work_end_time TIME"))
                        print("Startup: Added work_end_time to companies (SQLite)")
                else:
                    # Postgres column check
                    for col_name in ["work_start_time", "work_end_time"]:
                        result = await db.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name='companies' AND column_name='{col_name}'"))
                        if not result.scalar():
                            await db.execute(text(f"ALTER TABLE companies ADD COLUMN {col_name} TIME"))
                            print(f"Startup: Added {col_name} to companies (Postgres)")
                
                # Ensure defaults are set if they just got created or are null
                await db.execute(text("UPDATE companies SET work_start_time = '08:30:00' WHERE work_start_time IS NULL"))
                await db.execute(text("UPDATE companies SET work_end_time = '17:30:00' WHERE work_end_time IS NULL"))
                await db.commit()
            except Exception as e:
                print(f"Startup: Companies auto-patch failed: {e}")
                await db.rollback()

            # 10.2 Fix ProductionPlans Missing actual_completion_date
            try:
                if is_sqlite:
                    p_res = await db.execute(text("PRAGMA table_info(production_plans)"))
                    p_cols = [c[1] for c in p_res.fetchall()]
                    if "actual_completion_date" not in p_cols:
                        await db.execute(text("ALTER TABLE production_plans ADD COLUMN actual_completion_date DATE"))
                        print("Startup: Added actual_completion_date to production_plans (SQLite)")
                else:
                    p_res = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='production_plans' AND column_name='actual_completion_date'"))
                    if not p_res.scalar():
                        await db.execute(text("ALTER TABLE production_plans ADD COLUMN actual_completion_date DATE"))
                        print("Startup: Added actual_completion_date to production_plans (Postgres)")
                await db.commit()
            except Exception as e:
                print(f"Startup: ProductionPlans auto-patch failed: {e}")
                await db.rollback()

            # 10.3 Fix Orphaned Sales Orders (Completed status without a plan)
            try:
                # Identifying orders that are marked as completed but have no associated production plan.
                # This ensures they reappear in the planning list for correction.
                patch_stmt = text("""
                    UPDATE sales_orders 
                    SET status = 'CONFIRMED' 
                    WHERE status IN ('PRODUCTION_COMPLETED', 'DELIVERY_COMPLETED')
                    AND id NOT IN (SELECT order_id FROM production_plans WHERE order_id IS NOT NULL)
                """)
                await db.execute(patch_stmt)
                await db.commit()
                print("Startup: Reset status for orphaned Completed Sales Orders.")
            except Exception as e:
                print(f"Startup: Orphaned Sales Orders patch failed: {e}")
                await db.rollback()

            # 10.4 Fix Inconsistent Purchase/Outsourcing Status (Header COMPLETED vs Items)
            try:
                # PO Items: Set received_quantity = quantity for COMPLETED POs
                po_patch = text("""
                    UPDATE purchase_order_items 
                    SET received_quantity = quantity
                    WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE status = 'COMPLETED')
                    AND received_quantity < quantity
                """)
                await db.execute(po_patch)
                
                # PO Header Fix: Fill missing types and dates for COMPLETED orders
                po_header_patch = text("""
                    UPDATE purchase_orders
                    SET purchase_type = 'PART', actual_delivery_date = CURRENT_DATE
                    WHERE status = 'COMPLETED' AND (purchase_type IS NULL OR actual_delivery_date IS NULL)
                """)
                await db.execute(po_header_patch)
                
                # OO Items: Set status = 'COMPLETED' for COMPLETED OOs
                oo_patch = text("""
                    UPDATE outsourcing_order_items 
                    SET status = 'COMPLETED'
                    WHERE outsourcing_order_id IN (SELECT id FROM outsourcing_orders WHERE status = 'COMPLETED')
                    AND status != 'COMPLETED'
                """)
                await db.execute(oo_patch)
                
                # 10.5 Fix SalesOrder status reversion (Stuck in PRODUCTION_COMPLETED but has DH)
                order_fix_patch = text("""
                    UPDATE sales_orders
                    SET status = 'DELIVERY_COMPLETED'
                    WHERE status = 'PRODUCTION_COMPLETED'
                    AND id IN (SELECT order_id FROM delivery_histories)
                    AND id NOT IN (
                        SELECT soi.order_id 
                        FROM sales_order_items soi 
                        WHERE soi.delivered_quantity < soi.quantity
                    )
                """)
                # 10.6 Fix missing actual_delivery_date for completed OutsourcingOrders
                oo_header_patch = text("""
                    UPDATE outsourcing_orders
                    SET actual_delivery_date = order_date
                    WHERE status = 'COMPLETED' AND actual_delivery_date IS NULL
                """)
                await db.execute(oo_header_patch)

                await db.commit()
                print("Startup: Fixed status inconsistencies and backfilled missing dates (v10.6).")

            except Exception as e:
                print(f"Startup: Status patch failed: {e}")
                await db.rollback()

            # 11. Fix EmployeeTimeRecord Missing Columns (Hours Breakdown)
            try:
                new_cols = ["hours", "extension_hours", "night_hours", "holiday_hours", "holiday_night_hours"]
                if is_sqlite:
                    r = await db.execute(text("PRAGMA table_info(employee_time_records)"))
                    existing = [c[1] for c in r.fetchall()]
                    for col in new_cols:
                        if col not in existing:
                            await db.execute(text(f"ALTER TABLE employee_time_records ADD COLUMN {col} FLOAT DEFAULT 0.0"))
                            print(f"Startup: Added {col} to employee_time_records (SQLite)")
                else:
                    for col in new_cols:
                        result = await db.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name='employee_time_records' AND column_name='{col}'"))
                        if not result.scalar():
                            await db.execute(text(f"ALTER TABLE employee_time_records ADD COLUMN {col} FLOAT DEFAULT 0.0"))
                            print(f"Startup: Added {col} to employee_time_records (Postgres)")
                await db.commit()
            except Exception as e:
                print(f"Startup: EmployeeTimeRecord auto-patch failed: {e}")
                await db.rollback()

            # 12. BOM Feature Migration
            try:
                # 12-1. products 테이블에 item_type 컬럼 추가
                if is_sqlite:
                    r = await db.execute(text("PRAGMA table_info(products)"))
                    cols = [c[1] for c in r.fetchall()]
                    if "item_type" not in cols:
                        await db.execute(text("ALTER TABLE products ADD COLUMN item_type VARCHAR DEFAULT 'FINISHED'"))
                        print("Startup: Added item_type to products (SQLite)")
                else:
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='item_type'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE products ADD COLUMN item_type VARCHAR DEFAULT 'FINISHED'"))
                        print("Startup: Added item_type to products (Postgres)")

                # 12-3. recent_price 컬럼 추가 (소모품 단가 추적용)
                if is_sqlite:
                    r = await db.execute(text("PRAGMA table_info(products)"))
                    cols = [c[1] for c in r.fetchall()]
                    if "recent_price" not in cols:
                        await db.execute(text("ALTER TABLE products ADD COLUMN recent_price FLOAT DEFAULT 0.0"))
                        print("Startup: Added recent_price to products (SQLite)")
                else:
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='recent_price'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE products ADD COLUMN recent_price DOUBLE PRECISION DEFAULT 0.0"))
                        print("Startup: Added recent_price to products (Postgres)")

                # 12-2. 기존 데이터 item_type 기본값 일괄 업데이트 (NULL인 경우만)
                await db.execute(text("UPDATE products SET item_type = 'FINISHED' WHERE item_type IS NULL"))

                # 13. 고아(Orphan) 소모품 발주 대기 데이터 청소
                # 결재 문서(approval_documents)가 이미 삭제되었는데 남아있는 소모품 발주 대기 항목 삭제
                cleanup_query = "DELETE FROM consumable_purchase_waits WHERE approval_id NOT IN (SELECT id FROM approval_documents)"
                await db.execute(text(cleanup_query))
                print("Startup: Cleaned up orphan consumable_purchase_waits")
                await db.commit()
                print("Startup: BOM item_type migration done")
            except Exception as e:
                print(f"Startup: BOM item_type migration failed: {e}")
                await db.rollback()

            try:
                # 12-3. bom 테이블 생성 (없을 경우)
                if is_sqlite:
                    r = await db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='bom'"))
                    if not r.scalar():
                        await db.execute(text("""
                            CREATE TABLE bom (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                parent_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                                child_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                                required_quantity FLOAT NOT NULL DEFAULT 1.0
                            )
                        """))
                        await db.commit()
                        print("Startup: Created bom table (SQLite)")
                else:
                    r = await db.execute(text("SELECT to_regclass('public.bom')"))
                    if not r.scalar():
                        await db.execute(text("""
                            CREATE TABLE bom (
                                id SERIAL PRIMARY KEY,
                                parent_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                                child_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                                required_quantity DOUBLE PRECISION NOT NULL DEFAULT 1.0
                            )
                        """))
                        await db.commit()
                        print("Startup: Created bom table (Postgres)")
            except Exception as e:
                print(f"Startup: BOM table creation failed: {e}")
                await db.rollback()

            # 13. StockTransaction Table Creation
            try:
                if is_sqlite:
                    r = await db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_transactions'"))
                    if not r.scalar():
                        await db.execute(text("""
                            CREATE TABLE stock_transactions (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
                                quantity INTEGER NOT NULL,
                                transaction_type VARCHAR NOT NULL,
                                reference VARCHAR,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                            )
                        """))
                        await db.commit()
                        print("Startup: Created stock_transactions table (SQLite)")
                else:
                    r = await db.execute(text("SELECT to_regclass('public.stock_transactions')"))
                    if not r.scalar():
                        await db.execute(text("""
                            CREATE TABLE stock_transactions (
                                id SERIAL PRIMARY KEY,
                                stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
                                quantity INTEGER NOT NULL,
                                transaction_type VARCHAR NOT NULL,
                                reference VARCHAR,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            )
                        """))
                        await db.commit()
                        print("Startup: Created stock_transactions table (Postgres)")
            except Exception as e:
                print(f"Startup: StockTransaction table creation failed: {e}")
                await db.rollback()

            # 14. MRP Schema Fix (Auto-Patch)
            try:
                # 14-1. purchase_order_items: material_requirement_id
                if is_sqlite:
                    r = await db.execute(text("PRAGMA table_info(purchase_order_items)"))
                    cols = [c[1] for c in r.fetchall()]
                    if "material_requirement_id" not in cols:
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN material_requirement_id INTEGER"))
                        print("Startup: Added material_requirement_id to purchase_order_items (SQLite)")
                else:
                    r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_order_items' AND column_name='material_requirement_id'"))
                    if not r.scalar():
                        await db.execute(text("ALTER TABLE purchase_order_items ADD COLUMN material_requirement_id INTEGER"))
                        print("Startup: Added material_requirement_id to purchase_order_items (Postgres)")

                # 14. productionstatus Enum type repair (ensure 'CONFIRMED' exists)
                if not is_sqlite:
                    try:
                        await db.execute(text("ALTER TYPE productionstatus ADD VALUE IF NOT EXISTS 'CONFIRMED'"))
                        await db.commit()
                        print("Startup: Added 'CONFIRMED' to productionstatus Enum (PostgreSQL)")
                    except Exception as e:
                        await db.rollback()
                        print(f"Startup: productionstatus Enum update skipped or failed: {e}")

                # 14-3. Update orderstatus enum (Postgres)
                if not is_sqlite:
                    try:
                        await db.execute(text("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'PARTIALLY_DELIVERED'"))
                        await db.execute(text("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'DELIVERED'"))
                        await db.commit()
                        print("Startup: Updated orderstatus Enum (PostgreSQL)")
                    except Exception as e:
                        await db.rollback()
                        print(f"Startup: orderstatus Enum update skipped or failed: {e}")

                # 14-2. material_requirements table
                if is_sqlite:
                    r = await db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='material_requirements'"))
                    if not r.scalar():
                        await db.execute(text("""
                            CREATE TABLE material_requirements (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                product_id INTEGER NOT NULL REFERENCES products(id),
                                order_id INTEGER REFERENCES sales_orders(id),
                                plan_id INTEGER REFERENCES production_plans(id),
                                required_quantity INTEGER NOT NULL,
                                current_stock INTEGER DEFAULT 0,
                                open_purchase_qty INTEGER DEFAULT 0,
                                shortage_quantity INTEGER NOT NULL,
                                status VARCHAR DEFAULT 'PENDING',
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            )
                        """))
                        print("Startup: Created material_requirements table (SQLite)")
                    else:
                        # Check for missing columns in existing table
                        r = await db.execute(text("PRAGMA table_info(material_requirements)"))
                        cols = [c[1] for c in r.fetchall()]
                        if "plan_id" not in cols:
                            await db.execute(text("ALTER TABLE material_requirements ADD COLUMN plan_id INTEGER REFERENCES production_plans(id)"))
                            print("Startup: Added plan_id to material_requirements (SQLite)")
                else:
                    r = await db.execute(text("SELECT to_regclass('public.material_requirements')"))
                    if not r.scalar():
                        await db.execute(text("""
                            CREATE TABLE material_requirements (
                                id SERIAL PRIMARY KEY,
                                product_id INTEGER NOT NULL REFERENCES products(id),
                                order_id INTEGER REFERENCES sales_orders(id),
                                plan_id INTEGER REFERENCES production_plans(id),
                                required_quantity INTEGER NOT NULL,
                                current_stock INTEGER DEFAULT 0,
                                open_purchase_qty INTEGER DEFAULT 0,
                                shortage_quantity INTEGER NOT NULL,
                                status VARCHAR DEFAULT 'PENDING',
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            )
                        """))
                        print("Startup: Created material_requirements table (Postgres)")
                    else:
                        # Check for missing columns in existing table
                        r = await db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='material_requirements' AND column_name='plan_id'"))
                        if not r.scalar():
                            await db.execute(text("ALTER TABLE material_requirements ADD COLUMN plan_id INTEGER REFERENCES production_plans(id)"))
                            print("Startup: Added plan_id to material_requirements (Postgres)")
                
                await db.commit()
                # 15. Clean up existing consumable stock data (requested by user)
                try:
                    from cleanup_consumable_stocks import cleanup_consumable_stocks
                    await cleanup_consumable_stocks()
                except Exception as e:
                    print(f"Startup: Consumable stock cleanup failed: {e}")

                # [NEW] Fix missing purchase_type for consumables
                try:
                    from app.api.utils.purchasing import fix_purchase_type
                    await fix_purchase_type(db)
                except Exception as e:
                    print(f"Startup: Purchase type fix failed: {e}")
            except Exception as e:
                print(f"Startup: MRP auto-patch failed: {e}")
                await db.rollback()

    except Exception as e:
        print(f"Startup: DB initialization crashed: {e}")




