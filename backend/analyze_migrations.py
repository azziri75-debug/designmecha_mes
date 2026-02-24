import os
import re

versions_dir = r"e:\MES\backend\alembic\versions"
files = [f for f in os.listdir(versions_dir) if f.endswith(".py")]

all_revisions = {}
all_down_revisions = {} # child -> parent
parents_to_children = {} # parent -> [children]

for f in files:
    with open(os.path.join(versions_dir, f), "r", encoding="utf-8") as file:
        content = file.read()
        rev_match = re.search(r"revision[:\s=]+'([^']+)'", content)
        down_rev_match = re.search(r"down_revision[:\s=]+'([^']+)'", content)
        
        if rev_match:
            rev = rev_match.group(1)
            all_revisions[rev] = f
            
            down_rev = None
            if down_rev_match:
                down_rev = down_rev_match.group(1)
            
            all_down_revisions[rev] = down_rev
            if down_rev not in parents_to_children:
                parents_to_children[down_rev] = []
            parents_to_children[down_rev].append(rev)

heads = [rev for rev in all_revisions if rev not in parents_to_children]
roots = [rev for rev, down in all_down_revisions.items() if down is None]

print(f"Total revisions: {len(all_revisions)}")
print(f"Heads ({len(heads)}): {heads}")
for h in heads:
    print(f"  Head: {h} (File: {all_revisions[h]})")

print(f"\nRoots ({len(roots)}): {roots}")
for r in roots:
    print(f"  Root: {r} (File: {all_revisions[r]})")

print("\nSplits (Parents with multiple children):")
for p, children in parents_to_children.items():
    if len(children) > 1:
        print(f"  Parent {p} has children: {children}")
        for c in children:
            print(f"    - {c} ({all_revisions[c]})")

# Print full chains for each root
print("\nRevision Chains:")
for root in roots:
    print(f"\nChain starting at {root}:")
    current = [root]
    while current:
        next_level = []
        for c in current:
            print(f"  {c} ({all_revisions[c]})")
            children = parents_to_children.get(c, [])
            next_level.extend(children)
        current = next_level
