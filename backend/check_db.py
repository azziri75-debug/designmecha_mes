import sqlite3
conn = sqlite3.connect('mes.db')
print("ESTIMATES:")
res1 = conn.execute('SELECT id, attachment_file FROM estimates ORDER BY id DESC LIMIT 5').fetchall()
for r in res1: print(r)

print("PRODUCTION PLANS:")
res2 = conn.execute('SELECT id, attachment_file FROM production_plans ORDER BY id DESC LIMIT 5').fetchall()
for r in res2: print(r)
