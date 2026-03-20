-- Weight-based Pricing Migration Script (PostgreSQL)
-- Run this in your database tool (DBeaver, pgAdmin, or psql)

-- 1. Create the PricingType enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricingtype') THEN
        CREATE TYPE pricingtype AS ENUM ('UNIT', 'WEIGHT');
    END IF;
END $$;

-- 2. Add columns to purchase_order_items
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS pricing_type pricingtype DEFAULT 'UNIT';
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS total_weight DOUBLE PRECISION;

-- 3. Add columns to outsourcing_order_items
ALTER TABLE outsourcing_order_items ADD COLUMN IF NOT EXISTS pricing_type pricingtype DEFAULT 'UNIT';
ALTER TABLE outsourcing_order_items ADD COLUMN IF NOT EXISTS total_weight DOUBLE PRECISION;
