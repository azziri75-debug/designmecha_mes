import sqlite3

def check_db():
    try:
        conn = sqlite3.connect('mes_erp_v2.db')
        cursor = conn.cursor()
        
        # List tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables:", [t[0] for t in tables])
        
        # Check columns for key tables
        for table_name in ['processes', 'product_processes', 'products', 'partners', 'contacts']:
            if (table_name,) in tables:
                print(f"\nColumns in {table_name}:")
                cursor.execute(f"PRAGMA table_info({table_name})")
                columns = cursor.fetchall()
                for col in columns:
                    print(f"  - {col[1]} ({col[2]})")
            else:
                print(f"\nTable {table_name} NOT FOUND")
                
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
