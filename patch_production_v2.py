
import os

file_path = r'e:\MES\backend\app\api\endpoints\production.py'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
target = "selectinload(ProductionPlanItem.equipment),"
patch = "                selectinload(ProductionPlanItem.worker),\n"

patched_count = 0
for i in range(len(lines)):
    new_lines.append(lines[i])
    if target in lines[i]:
        # Check if worker is already in the next line
        if i + 1 < len(lines) and "ProductionPlanItem.worker" in lines[i+1]:
            continue
        new_lines.append(patch)
        patched_count += 1

if patched_count > 0:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Successfully patched {patched_count} occurrences.")
else:
    print("No occurrences found that needed patching.")
