import sqlite3
import os

db_path = "e:/MES/backend/mes_erp_v2.db"

if not os.path.exists(db_path):
    print(f"Database file not found at {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- Production Plan Items (Last 10) ---")
    cursor.execute("SELECT id, course_type, status, process_name FROM production_plan_items ORDER BY id DESC LIMIT 10")
    rows = cursor.fetchall()
    
    if not rows:
        print("No items found.")
    else:
        print(f"{'ID':<5} {'Course Type':<15} {'Status':<15} {'Process Name'}")
        print("-" * 60)
        for row in rows:
            print(f"{row[0]:<5} {row[1]:<15} {row[2]:<15} {row[3]}")
            
    print("\n--- Summary by Course Type ---")
    cursor.execute("SELECT course_type, COUNT(*) FROM production_plan_items GROUP BY course_type")
    summary = cursor.fetchall()
    for row in summary:
        print(f"{row[0]}: {row[1]}")

    conn.close()

except Exception as e:
    print(f"Error: {e}")
