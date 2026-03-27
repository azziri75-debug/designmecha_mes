-- Material Requirements Planning (MRP) Net Requirement Migration
-- Run this SQL against your SQLite database (mes_erp_v2.db)

ALTER TABLE production_plan_items ADD COLUMN gross_quantity INTEGER DEFAULT 0;
ALTER TABLE production_plan_items ADD COLUMN stock_use_quantity INTEGER DEFAULT 0;
ALTER TABLE production_plan_items ADD COLUMN stock_deducted BOOLEAN DEFAULT 0;

-- Optional: Initialize existing rows (gross_quantity = quantity)
UPDATE production_plan_items SET gross_quantity = quantity;
