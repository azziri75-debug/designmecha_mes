import os
import re

versions_dir = r"e:\MES\backend\alembic\versions"
files = [f for f in os.listdir(versions_dir) if f.endswith(".py")]

all_revisions = {}
all_down_revisions = {} # child -> parent
parents_to_children = {} # parent -> [children]

def find_val(pattern, content):
    match = re.search(pattern, content)
    if match:
        return match.group(2)
    return None

# Patterns to handle both revision = '...' and revision: str = '...'
rev_pattern = r"(revision)\s*(?::\s*[^=]+)?\s*=\s*'([^']+)'"
down_rev_pattern = r"(down_revision)\s*(?::\s*[^=]+)?\s*=\s*'([^']+)'"

for f in files:
    with open(os.path.join(versions_dir, f), "r", encoding="utf-8") as file:
        content = file.read()
        rev = find_val(rev_pattern, content)
        down_rev = find_val(down_rev_pattern, content)
        
        if rev:
            all_revisions[rev] = f
            all_down_revisions[rev] = down_rev
            if down_rev not in parents_to_children:
                parents_to_children[down_rev] = []
            parents_to_children[down_rev].append(rev)
        else:
            print(f"Warning: No revision found in {f}")

heads = [rev for rev in all_revisions if rev not in parents_to_children]
roots = [rev for rev, down in all_down_revisions.items() if down is None]

print(f"\nTotal revisions found: {len(all_revisions)}")
print(f"Heads ({len(heads)}): {heads}")
for h in heads:
    print(f"  Head: {h} (File: {all_revisions[h]})")

print(f"\nRoots ({len(roots)}): {roots}")
for r in roots:
    print(f"  Root: {r} (File: {all_revisions.get(r, 'Unknown file')})")

print("\nSplits (Parents with multiple children):")
for p, children in parents_to_children.items():
    if len(children) > 1:
        print(f"  Parent {p} has children: {children}")
        for c in children:
            print(f"    - {c} ({all_revisions[c]})")
