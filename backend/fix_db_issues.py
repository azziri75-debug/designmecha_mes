import asyncio
from sqlalchemy import text
from app.api.deps import engine

async def main():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        print(f"Database dialect: {dialect}")
        
        # 1. Add purchase_type column to purchase_orders table
        try:
            if dialect == 'sqlite':
                res = await conn.execute(text("PRAGMA table_info(purchase_orders)"))
                columns = [row[1] for row in res.fetchall()]
                if 'purchase_type' not in columns:
                    await conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN purchase_type VARCHAR;"))
                    print("Added 'purchase_type' column to 'purchase_orders'.")
                else:
                    print("'purchase_type' column already exists in 'purchase_orders'.")
            elif dialect == 'postgresql':
                await conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_type VARCHAR;"))
                print("Added 'purchase_type' column to 'purchase_orders'.")
                
            # Update existing data
            res = await conn.execute(text("UPDATE purchase_orders SET purchase_type = 'PART';"))
            print(f"Updated purchase_type to 'PART' for existing {res.rowcount} rows.")
        except Exception as e:
            print(f"Failed to update purchase_orders: {e}")
            
        # 2. Update products item_type
        try:
            query = text("""
                UPDATE products 
                SET item_type = 'PRODUCED' 
                WHERE item_type IS NULL OR item_type NOT IN ('PART', 'CONSUMABLE');
            """)
            res = await conn.execute(query)
            print(f"Updated item_type to 'PRODUCED' for {res.rowcount} products.")
        except Exception as e:
            print(f"Failed to update products: {e}")

        # 3. Alter consumable_purchase_waits for new purchasing flow
        try:
            if dialect == 'sqlite':
                # Check if requested_item_name exists
                res = await conn.execute(text("PRAGMA table_info(consumable_purchase_waits)"))
                columns = [row[1] for row in res.fetchall()]
                if 'requested_item_name' not in columns:
                    print("Refactoring 'consumable_purchase_waits' table for SQLite...")
                    await conn.execute(text("""
                        CREATE TABLE consumable_purchase_waits_new (
                            id INTEGER PRIMARY KEY,
                            approval_id INTEGER NOT NULL REFERENCES approval_documents(id),
                            product_id INTEGER REFERENCES products(id),
                            requested_item_name VARCHAR,
                            quantity INTEGER NOT NULL,
                            remarks VARCHAR,
                            requester_name VARCHAR,
                            department VARCHAR,
                            status VARCHAR DEFAULT 'PENDING',
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        );
                    """))
                    await conn.execute(text("""
                        INSERT INTO consumable_purchase_waits_new 
                        (id, approval_id, product_id, requested_item_name, quantity, remarks, status, created_at)
                        SELECT 
                            cw.id, cw.approval_id, cw.product_id, p.name, cw.quantity, cw.remarks, cw.status, cw.created_at 
                        FROM consumable_purchase_waits cw
                        LEFT JOIN products p ON cw.product_id = p.id;
                    """))
                    await conn.execute(text("DROP TABLE consumable_purchase_waits;"))
                    await conn.execute(text("ALTER TABLE consumable_purchase_waits_new RENAME TO consumable_purchase_waits;"))
                    print("Refactored 'consumable_purchase_waits' successfully.")
            elif dialect == 'postgresql':
                await conn.execute(text("ALTER TABLE consumable_purchase_waits ADD COLUMN IF NOT EXISTS requested_item_name VARCHAR;"))
                await conn.execute(text("ALTER TABLE consumable_purchase_waits ADD COLUMN IF NOT EXISTS requester_name VARCHAR;"))
                await conn.execute(text("ALTER TABLE consumable_purchase_waits ADD COLUMN IF NOT EXISTS department VARCHAR;"))
                await conn.execute(text("ALTER TABLE consumable_purchase_waits ALTER COLUMN product_id DROP NOT NULL;"))
                # backfill requested_item_name
                await conn.execute(text("""
                    UPDATE consumable_purchase_waits
                    SET requested_item_name = p.name
                    FROM products p
                    WHERE consumable_purchase_waits.product_id = p.id AND consumable_purchase_waits.requested_item_name IS NULL;
                """))
                print("Refactored 'consumable_purchase_waits' for PostgreSQL.")
        except Exception as e:
            print(f"Failed to refactor consumable_purchase_waits: {e}")

        # 4. Add staff_no column to staff table
        try:
            if dialect == 'sqlite':
                res = await conn.execute(text("PRAGMA table_info(staff)"))
                columns = [row[1] for row in res.fetchall()]
                if 'staff_no' not in columns:
                    await conn.execute(text("ALTER TABLE staff ADD COLUMN staff_no VARCHAR(50);"))
                    print("Added 'staff_no' column to 'staff' (SQLite).")
                else:
                    print("'staff_no' column already exists in 'staff'.")
            elif dialect == 'postgresql':
                await conn.execute(text("ALTER TABLE staff ADD COLUMN IF NOT EXISTS staff_no VARCHAR(50);"))
                print("Added 'staff_no' column to 'staff' (PostgreSQL).")
        except Exception as e:
            print(f"Failed to add staff_no to staff table: {e}")

        # 5. Create performance indexes for large list queries and joins
        index_statements = [
            "CREATE INDEX IF NOT EXISTS idx_products_group_id ON products(group_id)",
            "CREATE INDEX IF NOT EXISTS idx_products_partner_id ON products(partner_id)",
            "CREATE INDEX IF NOT EXISTS idx_products_item_type ON products(item_type)",
            "CREATE INDEX IF NOT EXISTS idx_product_processes_product_id ON product_processes(product_id)",
            "CREATE INDEX IF NOT EXISTS idx_bom_parent_product_id ON bom(parent_product_id)",
            "CREATE INDEX IF NOT EXISTS idx_bom_child_product_id ON bom(child_product_id)",
            "CREATE INDEX IF NOT EXISTS idx_product_price_histories_pid_date ON product_price_histories(product_id, date DESC)",
            "CREATE INDEX IF NOT EXISTS idx_estimates_partner_id ON estimates(partner_id)",
            "CREATE INDEX IF NOT EXISTS idx_estimates_estimate_date ON estimates(estimate_date DESC)",
            "CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON estimate_items(estimate_id)",
            "CREATE INDEX IF NOT EXISTS idx_estimate_items_product_id ON estimate_items(product_id)",
            "CREATE INDEX IF NOT EXISTS idx_sales_orders_partner_id ON sales_orders(partner_id)",
            "CREATE INDEX IF NOT EXISTS idx_sales_orders_order_date ON sales_orders(order_date DESC)",
            "CREATE INDEX IF NOT EXISTS idx_sales_orders_delivery_date ON sales_orders(delivery_date DESC)",
            "CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status)",
            "CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id ON sales_order_items(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_id ON sales_order_items(product_id)",
            "CREATE INDEX IF NOT EXISTS idx_delivery_histories_order_id ON delivery_histories(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_production_plans_order_id ON production_plans(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_production_plans_sp_id ON production_plans(stock_production_id)",
            "CREATE INDEX IF NOT EXISTS idx_production_plans_spo_id ON production_plans(stock_production_order_id)",
            "CREATE INDEX IF NOT EXISTS idx_production_plans_status ON production_plans(status)",
            "CREATE INDEX IF NOT EXISTS idx_production_plans_plan_date ON production_plans(plan_date DESC)",
            "CREATE INDEX IF NOT EXISTS idx_production_plan_items_plan_id ON production_plan_items(plan_id)",
            "CREATE INDEX IF NOT EXISTS idx_production_plan_items_product_id ON production_plan_items(product_id)",
            "CREATE INDEX IF NOT EXISTS idx_production_plan_items_worker_id ON production_plan_items(worker_id)",
            "CREATE INDEX IF NOT EXISTS idx_production_plan_items_status ON production_plan_items(status)",
            "CREATE INDEX IF NOT EXISTS idx_work_log_items_plan_item_id ON work_log_items(plan_item_id)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_partner_id ON purchase_orders(partner_id)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_id ON purchase_orders(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_purchase_type ON purchase_orders(purchase_type)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date DESC)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(purchase_order_id)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON purchase_order_items(product_id)",
            "CREATE INDEX IF NOT EXISTS idx_purchase_order_items_ppi_id ON purchase_order_items(production_plan_item_id)",
            "CREATE INDEX IF NOT EXISTS idx_outsourcing_orders_partner_id ON outsourcing_orders(partner_id)",
            "CREATE INDEX IF NOT EXISTS idx_outsourcing_orders_order_id ON outsourcing_orders(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_outsourcing_orders_status ON outsourcing_orders(status)",
            "CREATE INDEX IF NOT EXISTS idx_outsourcing_orders_order_date ON outsourcing_orders(order_date DESC)",
            "CREATE INDEX IF NOT EXISTS idx_outsourcing_order_items_oo_id ON outsourcing_order_items(outsourcing_order_id)",
            "CREATE INDEX IF NOT EXISTS idx_outsourcing_order_items_product_id ON outsourcing_order_items(product_id)",
            "CREATE INDEX IF NOT EXISTS idx_outsourcing_order_items_ppi_id ON outsourcing_order_items(production_plan_item_id)",
            "CREATE INDEX IF NOT EXISTS idx_material_requirements_product_id ON material_requirements(product_id)",
            "CREATE INDEX IF NOT EXISTS idx_material_requirements_order_id ON material_requirements(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_material_requirements_plan_id ON material_requirements(plan_id)",
            "CREATE INDEX IF NOT EXISTS idx_material_requirements_status ON material_requirements(status)",
            "CREATE INDEX IF NOT EXISTS idx_stocks_product_id ON stocks(product_id)",
        ]
        created_idx_count = 0
        for idx_sql in index_statements:
            try:
                async with conn.begin_nested():
                    await conn.execute(text(idx_sql))
                    created_idx_count += 1
            except Exception as e:
                print(f"Skipped index ({idx_sql}): {e}")
        print(f"Verified/created {created_idx_count} performance indexes.")

if __name__ == "__main__":
    asyncio.run(main())
