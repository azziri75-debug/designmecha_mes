import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'mes_erp_v2.db')
conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

menus = json.dumps(["basics", "products", "sales", "production", "purchase", "outsourcing", "quality", "inventory"])

# Check if 이준호 already exists
existing = c.execute("SELECT id FROM staff WHERE name = '이준호'").fetchone()
if not existing:
    c.execute(
        "INSERT INTO staff (name, role, main_duty, phone, is_active, user_type, password, menu_permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ('이준호', '대표', '총괄관리', '', 1, 'ADMIN', '6220', menus)
    )
    print("Created admin user: 이준호")
else:
    c.execute("UPDATE staff SET user_type='ADMIN', password='6220', menu_permissions=? WHERE name='이준호'", (menus,))
    print("Updated existing 이준호 to ADMIN")

conn.commit()

# Verify
rows = c.execute("SELECT id, name, user_type, password FROM staff").fetchall()
for r in rows:
    print(f"  ID={r[0]} Name={r[1]} Type={r[2]} PWD={r[3]}")

conn.close()
print("Done!")
