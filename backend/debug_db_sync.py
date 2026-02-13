import sqlite3
import os

db_path = "mes_erp.db"
print(f"Checking DB: {os.path.abspath(db_path)}")

if not os.path.exists(db_path):
    print("DB file not found!")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT count(*) FROM sales_orders")
        print(f"Sales Orders: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT count(*) FROM production_plans")
        print(f"Production Plans: {cursor.fetchone()[0]}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()
