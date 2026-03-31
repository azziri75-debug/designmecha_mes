import sqlite3

try:
    conn = sqlite3.connect('mes.db')
    cursor = conn.cursor()
    cursor.execute('ALTER TABLE staff ADD COLUMN staff_no VARCHAR(50);')
    conn.commit()
    print('staff_no added successfully.')
except Exception as e:
    print('Migration failed or already applied:', e)
finally:
    if 'conn' in locals():
        conn.close()
