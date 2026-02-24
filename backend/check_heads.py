import os
import re

versions_dir = r"e:\MES\backend\alembic\versions"
files = [f for f in os.listdir(versions_dir) if f.endswith(".py")]

revisions = {}
down_revisions = set()

for f in files:
    with open(os.path.join(versions_dir, f), "r", encoding="utf-8") as file:
        content = file.read()
        rev_match = re.search(r"revision[:\s=]+'([^']+)'", content)
        down_rev_match = re.search(r"down_revision[:\s=]+'([^']+)'", content)
        
        if rev_match:
            rev = rev_match.group(1)
            revisions[rev] = f
            if down_rev_match:
                down_rev = down_rev_match.group(1)
                down_revisions.add(down_rev)
            else:
                down_revisions.add(None)

heads = [rev for rev in revisions if rev not in down_revisions]
print(f"Heads found: {heads}")
for h in heads:
    print(f"Head: {h} (File: {revisions[h]})")
