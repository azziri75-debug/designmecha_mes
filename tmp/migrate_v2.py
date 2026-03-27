import sqlite3
import os

db_path = "backend/mes_erp_v2.db"
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found.")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    print("Adding gross_quantity...")
    cursor.execute("ALTER TABLE production_plan_items ADD COLUMN gross_quantity INTEGER DEFAULT 0;")
except sqlite3.OperationalError as e:
    print(f"Skipping gross_quantity: {e}")

try:
    print("Adding stock_use_quantity...")
    cursor.execute("ALTER TABLE production_plan_items ADD COLUMN stock_use_quantity INTEGER DEFAULT 0;")
except sqlite3.OperationalError as e:
    print(f"Skipping stock_use_quantity: {e}")

try:
    print("Adding stock_deducted...")
    cursor.execute("ALTER TABLE production_plan_items ADD COLUMN stock_deducted BOOLEAN DEFAULT 0;")
except sqlite3.OperationalError as e:
    print(f"Skipping stock_deducted: {e}")

conn.commit()
conn.close()
print("Migration completed.")
