import sqlite3

def check_db():
    try:
        print("Checking mes_erp.db (OLD)...")
        conn = sqlite3.connect('mes_erp.db')
        cursor = conn.cursor()
        
        # List tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables:", [t[0] for t in tables])
        
        if ('partners',) not in tables:
            print("CONFIRMED: 'partners' table matches missing in mes_erp.db")
        else:
            print("'partners' table EXISTS in mes_erp.db")
                
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
