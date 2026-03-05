import os

for pyfile in ['app/api/endpoints/product.py', 'app/api/endpoints/sales.py']:
    with open(pyfile, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace('selectinload(Product.bom_items).joinedload(BOM.child_product)', 'selectinload(Product.bom_items).selectinload(BOM.child_product)')
    
    with open(pyfile, 'w', encoding='utf-8') as f:
        f.write(content)
print("done")
