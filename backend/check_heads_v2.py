import os
import re

versions_dir = r"e:\MES\backend\alembic\versions"
files = [f for f in os.listdir(versions_dir) if f.endswith(".py")]

revisions = {}
down_to_up = {}

for f in files:
    with open(os.path.join(versions_dir, f), "r", encoding="utf-8") as file:
        content = file.read()
        rev_match = re.search(r"revision[:\s=]+'([^']+)'", content)
        down_rev_match = re.search(r"down_revision[:\s=]+'([^']+)'", content)
        
        if rev_match:
            rev = rev_match.group(1)
            revisions[rev] = f
            
            down_rev = None
            if down_rev_match:
                down_rev = down_rev_match.group(1)
            
            if down_rev not in down_to_up:
                down_to_up[down_rev] = []
            down_to_up[down_rev].append(rev)

heads = []
for rev in revisions:
    is_down = False
    for ups in down_to_up.values():
        if rev in ups:
            # this rev is a parent or intermediate
            pass
    
    # A head is a rev that is NOT in down_to_up keys (except as None) 
    # and is NOT referenced by anyone else.
    is_parent = False
    for key in down_to_up:
        if key == rev:
            is_parent = True
            break
    if not is_parent:
        heads.append(rev)

print(f"Heads: {heads}")
for h in heads:
    print(f"  {h} ({revisions[h]})")

print("\nSplit check (Parents with multiple children):")
for parent, children in down_to_up.items():
    if len(children) > 1:
        print(f"  Parent {parent} has multiple children: {children}")
        for c in children:
            print(f"    - Child {c} ({revisions[c]})")
