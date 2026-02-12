import sqlite3

try:
    conn = sqlite3.connect('mes_erp.db')
    cursor = conn.cursor()
    
    print("--- Tables ---")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    for table in tables:
        print(table[0])
        
    print("\n--- Partners Schema ---")
    cursor.execute("PRAGMA table_info(partners);")
    columns = cursor.fetchall()
    for col in columns:
        print(col)

    print("\n--- Products Schema ---")
    cursor.execute("PRAGMA table_info(products);")
    columns = cursor.fetchall()
    for col in columns:
        print(col)
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
