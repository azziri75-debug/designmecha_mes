"""Direct DB migration: add staff auth columns and set defaults"""
import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'mes_erp_v2.db')

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Check existing columns
cols = [row[1] for row in c.execute('PRAGMA table_info(staff)')]
print(f"Current staff columns: {cols}")

# Add columns if missing
if 'user_type' not in cols:
    c.execute("ALTER TABLE staff ADD COLUMN user_type TEXT DEFAULT 'USER'")
    print("Added column: user_type")

if 'password' not in cols:
    c.execute("ALTER TABLE staff ADD COLUMN password TEXT")
    print("Added column: password")

if 'menu_permissions' not in cols:
    c.execute("ALTER TABLE staff ADD COLUMN menu_permissions TEXT DEFAULT '[]'")
    print("Added column: menu_permissions")

# Update all staff
ALL_MENUS = json.dumps(["basics", "products", "sales", "production", "purchase", "outsourcing", "quality", "inventory"])

# Set all passwords to 6220
c.execute("UPDATE staff SET password = '6220' WHERE password IS NULL OR password = ''")

# Set 이준호 as ADMIN
c.execute(f"UPDATE staff SET user_type = 'ADMIN', menu_permissions = ? WHERE name = '이준호'", (ALL_MENUS,))
admin_rows = c.rowcount
print(f"Set 이준호 as ADMIN: {admin_rows} rows updated")

# Set everyone else as USER with all menus
c.execute(f"UPDATE staff SET user_type = 'USER', menu_permissions = ? WHERE name != '이준호' AND (user_type IS NULL OR user_type = '')", (ALL_MENUS,))
# Also set menu_permissions for those who don't have it yet
c.execute(f"UPDATE staff SET menu_permissions = ? WHERE menu_permissions IS NULL OR menu_permissions = '' OR menu_permissions = '[]'", (ALL_MENUS,))

conn.commit()

# Verify
rows = c.execute("SELECT id, name, user_type, password, menu_permissions FROM staff").fetchall()
print(f"\nStaff records ({len(rows)}):")
for r in rows:
    print(f"  ID={r[0]} Name={r[1]} Type={r[2]} PWD={r[3]} Menus={r[4]}")

conn.close()
print("\nMigration complete!")
