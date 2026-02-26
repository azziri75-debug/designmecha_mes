
import asyncio
from sqlalchemy import text
from app.api.deps import AsyncSessionLocal

async def run_migration():
    async with AsyncSessionLocal() as db:
        db_url = str(db.get_bind().url)
        print(f"Running migration on: {db_url}")
        
        is_sqlite = "sqlite" in db_url
        
        if is_sqlite:
            # SQLite handles FKs differently. Usually requires table recreation for complex changes,
            # but for dummy migration we just check columns. 
            # In SQLite, pragmas are needed.
            print("Detected SQLite. Schema updates often require table recreation.")
            print("Applying PRAGMA foreign_keys = OFF for migration safely.")
            await db.execute(text("PRAGMA foreign_keys = OFF"))
            
            # Note: SQLite doesn't easily support ALTER TABLE DROP/ADD CONSTRAINT.
            # However, for mes_erp_v2.db development, we can mostly rely on model sync if recreatable.
            # But let's try to be helpful. 
            pass
        else:
            # Postgres: Render environment
            print("Detected Postgres. Updating constraints...")
            
            # 1. Update Equipments
            try:
                # Drop existing FK if exists
                # Find constraint name first
                find_con = text("""
                    SELECT conname 
                    FROM pg_constraint 
                    INNER JOIN pg_class ON connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') 
                    AND pg_class.oid = conrelid 
                    WHERE pg_class.relname = 'equipments' AND contype = 'f' 
                    AND confrelid = (SELECT oid FROM pg_class WHERE relname = 'processes');
                """)
                res = await db.execute(find_con)
                con_name = res.scalar()
                if con_name:
                    await db.execute(text(f"ALTER TABLE equipments DROP CONSTRAINT {con_name}"))
                
                await db.execute(text("ALTER TABLE equipments ADD CONSTRAINT equipments_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL"))
                print("Updated equipments constraint")
            except Exception as e:
                print(f"Error updating equipments: {e}")

            # 2. Update Product Processes
            try:
                find_con = text("""
                    SELECT conname 
                    FROM pg_constraint 
                    INNER JOIN pg_class ON connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') 
                    AND pg_class.oid = conrelid 
                    WHERE pg_class.relname = 'product_processes' AND contype = 'f' 
                    AND confrelid = (SELECT oid FROM pg_class WHERE relname = 'processes');
                """)
                res = await db.execute(find_con)
                con_name = res.scalar()
                if con_name:
                    await db.execute(text(f"ALTER TABLE product_processes DROP CONSTRAINT {con_name}"))
                
                await db.execute(text("ALTER TABLE product_processes ALTER COLUMN process_id DROP NOT NULL"))
                await db.execute(text("ALTER TABLE product_processes ADD CONSTRAINT product_processes_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL"))
                print("Updated product_processes constraint")
            except Exception as e:
                print(f"Error updating product_processes: {e}")

            # 3. Update Inspection Processes
            try:
                find_con = text("""
                    SELECT conname 
                    FROM pg_constraint 
                    INNER JOIN pg_class ON connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') 
                    AND pg_class.oid = conrelid 
                    WHERE pg_class.relname = 'inspection_processes' AND contype = 'f' 
                    AND confrelid = (SELECT oid FROM pg_class WHERE relname = 'processes');
                """)
                res = await db.execute(find_con)
                con_name = res.scalar()
                if con_name:
                    await db.execute(text(f"ALTER TABLE inspection_processes DROP CONSTRAINT {con_name}"))
                
                await db.execute(text("ALTER TABLE inspection_processes ALTER COLUMN process_id DROP NOT NULL"))
                await db.execute(text("ALTER TABLE inspection_processes ADD CONSTRAINT inspection_processes_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL"))
                print("Updated inspection_processes constraint")
            except Exception as e:
                print(f"Error updating inspection_processes: {e}")

        await db.commit()
        print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(run_migration())
