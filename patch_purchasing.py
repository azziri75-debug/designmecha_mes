
import os

file_path = r'e:\MES\backend\app\api\endpoints\purchasing.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Target for pending items
target_pending = "selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product),"
patch_pending = target_pending + "\n            selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.partner),"

# Target for orders (creation/read/update)
target_order = "selectinload(ProductionPlanItem.plan).selectinload(ProductionPlan.stock_production).selectinload(StockProduction.product)"
patch_order = target_order.replace("product)", "product).selectinload(StockProduction.partner)")

new_content = content
if target_pending in content and patch_pending not in content:
    new_content = new_content.replace(target_pending, patch_pending)
    print("Patched pending items endpoints.")

if target_order in new_content:
    # We use a unique marker to avoid double patching if already patched by above or manual
    if "selectinload(StockProduction.partner)" not in new_content:
        new_content = new_content.replace(target_order, target_order + ".selectinload(StockProduction.partner)")
        print("Patched order endpoints.")
    else:
        print("Order endpoints seem already patched or partially patched.")

if new_content != content:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully updated purchasing.py")
else:
    print("No changes needed or target strings not found.")
