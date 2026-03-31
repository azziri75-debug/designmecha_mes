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

if __name__ == "__main__":
    asyncio.run(main())
