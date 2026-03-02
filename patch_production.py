
import os

file_path = r'e:\MES\backend\app\api\endpoints\production.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = "selectinload(ProductionPlanItem.equipment),"
patch = "selectinload(ProductionPlanItem.equipment),\n                selectinload(ProductionPlanItem.worker),"

# Count occurrences before patching to verify correctly
occurrences = content.count(target)
print(f"Found {occurrences} occurrences of the target string.")

if occurrences > 0 and patch not in content:
    new_content = content.replace(target, patch)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Successfully patched {occurrences} occurrences.")
elif patch in content:
    print("Patch already exists in the file.")
else:
    print("No target occurrences found. Check the target string and file encoding.")
