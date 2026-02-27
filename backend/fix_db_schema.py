import sqlite3
import os

db_path = "e:/MES/backend/mes_erp_v2.db"
# If mes_app.db is also used, apply to both to be safe
db_paths = ["e:/MES/backend/mes_erp_v2.db", "e:/MES/backend/mes.db", "e:/MES/backend/mes_app.db"]

queries = [
    # 1. ProductProcess cost column
    "ALTER TABLE product_processes ADD COLUMN cost REAL;",
    
    # 2. ProductionPlanItem cost column
    "ALTER TABLE production_plan_items ADD COLUMN cost REAL;",
    
    # 3. StockProductions partner_id column
    "ALTER TABLE stock_productions ADD COLUMN partner_id INTEGER;",
    
    # 4. Measuring Instruments
    """CREATE TABLE IF NOT EXISTS measuring_instruments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR NOT NULL,
        code VARCHAR NOT NULL,
        spec VARCHAR,
        serial_number VARCHAR,
        calibration_cycle_months INTEGER,
        next_calibration_date DATE,
        is_active BOOLEAN,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
    );""",
    
    # 5. Calibration History
    """CREATE TABLE IF NOT EXISTS calibration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instrument_id INTEGER,
        calibration_date DATE NOT NULL,
        calibrator VARCHAR,
        result VARCHAR,
        certificate_no VARCHAR,
        note TEXT,
        attachment_file VARCHAR,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(instrument_id) REFERENCES measuring_instruments(id) ON DELETE CASCADE
    );""",
    
    # 6. Tool Repair History
    """CREATE TABLE IF NOT EXISTS tool_repair_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instrument_id INTEGER,
        repair_date DATE NOT NULL,
        repair_content TEXT NOT NULL,
        repair_company VARCHAR,
        cost INTEGER,
        note TEXT,
        attachment_file VARCHAR,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(instrument_id) REFERENCES measuring_instruments(id) ON DELETE CASCADE
    );""",
    
    # 7. Work Logs
    """CREATE TABLE IF NOT EXISTS work_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_date DATE NOT NULL,
        worker_id INTEGER,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        FOREIGN KEY(worker_id) REFERENCES staff(id)
    );""",
    
    # 8. Work Log Items
    """CREATE TABLE IF NOT EXISTS work_log_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_log_id INTEGER NOT NULL,
        plan_item_id INTEGER NOT NULL,
        worker_id INTEGER,
        start_time DATETIME,
        end_time DATETIME,
        good_quantity INTEGER,
        bad_quantity INTEGER,
        note TEXT,
        FOREIGN KEY(work_log_id) REFERENCES work_logs(id) ON DELETE CASCADE,
        FOREIGN KEY(plan_item_id) REFERENCES production_plan_items(id),
        FOREIGN KEY(worker_id) REFERENCES staff(id)
    );""",

    # 9. Equipment Repair History
    """CREATE TABLE IF NOT EXISTS equipment_repair_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id INTEGER,
        repair_date DATE NOT NULL,
        repair_content TEXT NOT NULL,
        repair_company VARCHAR,
        cost INTEGER,
        note TEXT,
        attachment_file VARCHAR,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
    );"""
]

for p in db_paths:
    if os.path.exists(p):
        print(f"Applying schema changes to {p}...")
        try:
            conn = sqlite3.connect(p)
            cur = conn.cursor()
            for q in queries:
                try:
                    cur.execute(q)
                    print(f"  Success: {q.split()[0]} {q.split()[1] if len(q.split()) > 1 else ''}")
                except Exception as e:
                    print(f"  Ignored/Error on '{q[:30]}...': {e}")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to process {p}: {e}")
