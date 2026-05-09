import asyncio
import json
from sqlalchemy import text
import os
import sys

# Add the parent directory to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api import deps

async def check_column_exists(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table. Supports both SQLite and PostgreSQL."""
    try:
        # Detect DB engine from dialect
        dialect = db.bind.dialect.name if hasattr(db, 'bind') and db.bind else None
        
        # Try PostgreSQL information_schema first
        try:
            res = await db.execute(text("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = :table AND column_name = :col
            """), {"table": table_name, "col": column_name})
            rows = res.fetchall()
            return len(rows) > 0
        except Exception:
            pass
        
        # Fallback: SQLite PRAGMA
        try:
            res = await db.execute(text(f"PRAGMA table_info({table_name})"))
            columns = [row[1] for row in res.fetchall()]
            return column_name in columns
        except Exception:
            pass
    except Exception:
        pass
    
    return False  # If we can't check, assume it doesn't exist to be safe

async def fix_missing_plan_items():
    print("Starting data correction for missing Production Plan items...")
    
    fixed_plans_count = 0
    total_added_items = 0
    
    async for db in deps.get_db():
        # Check if gross_quantity exists in the schema (works for both PG and SQLite)
        has_gross_quantity = await check_column_exists(db, 'production_plan_items', 'gross_quantity')
        print(f"Schema check: gross_quantity column exists = {has_gross_quantity}")
        
        # Get all plans that are linked to an order
        plans_stmt = text("SELECT id, order_id FROM production_plans WHERE order_id IS NOT NULL")
        plans_res = await db.execute(plans_stmt)
        plans = plans_res.fetchall()
        print(f"Found {len(plans)} production plans linked to sales orders.")
        
        for plan in plans:
            plan_id = plan.id
            order_id = plan.order_id
            
            # Fetch original sales order items
            order_items_res = await db.execute(
                text("SELECT product_id, quantity FROM sales_order_items WHERE order_id = :oid"),
                {"oid": order_id}
            )
            order_items = order_items_res.fetchall()
            
            # Group order items by product_id and sum quantity
            order_product_qtys = {}
            for oi in order_items:
                if not oi.product_id:
                    continue
                order_product_qtys[oi.product_id] = order_product_qtys.get(oi.product_id, 0) + oi.quantity
                
            # Fetch existing plan items' product_ids
            plan_items_res = await db.execute(
                text("SELECT DISTINCT product_id FROM production_plan_items WHERE plan_id = :pid"),
                {"pid": plan_id}
            )
            plan_items = plan_items_res.fetchall()
            existing_product_ids = {pi.product_id for pi in plan_items if pi.product_id}
            
            plan_updated = False
            
            for product_id, total_qty in order_product_qtys.items():
                if product_id not in existing_product_ids:
                    print(f"[Plan ID: {plan_id}] Missing processes for Product ID: {product_id}. Generating...")
                    
                    # Fetch its standard processes
                    proc_res = await db.execute(text('''
                        SELECT pr.name as process_name, pr.course_type as proc_course_type, 
                               pp.sequence, pp.course_type as rel_course_type,
                               p.drawing_file, pp.attachment_file, pp.equipment_name, pp.estimated_time, pp.cost, pp.partner_name
                        FROM product_processes pp
                        JOIN processes pr ON pp.process_id = pr.id
                        JOIN products p ON pp.product_id = p.id
                        WHERE pp.product_id = :pid
                        ORDER BY pp.sequence
                    '''), {"pid": product_id})
                    processes = proc_res.fetchall()
                    
                    if not processes:
                        print(f"  -> Product {product_id} has NO standard processes. Adding '기본 공정'.")
                        if has_gross_quantity:
                            await db.execute(text('''
                                INSERT INTO production_plan_items 
                                (plan_id, product_id, process_name, sequence, course_type, quantity, gross_quantity, status, cost)
                                VALUES (:pid, :prod_id, '기본 공정', 1, 'INTERNAL', :qty, :gqty, 'PLANNED', 0)
                            '''), {"pid": plan_id, "prod_id": product_id, "qty": total_qty, "gqty": total_qty})
                        else:
                            await db.execute(text('''
                                INSERT INTO production_plan_items 
                                (plan_id, product_id, process_name, sequence, course_type, quantity, status, cost)
                                VALUES (:pid, :prod_id, '기본 공정', 1, 'INTERNAL', :qty, 'PLANNED', 0)
                            '''), {"pid": plan_id, "prod_id": product_id, "qty": total_qty})
                        total_added_items += 1
                        plan_updated = True
                    else:
                        print(f"  -> Product {product_id} has {len(processes)} standard processes. Adding them.")
                        for proc in processes:
                            final_attachments = []
                            for raw in [proc.drawing_file, proc.attachment_file]:
                                if not raw:
                                    continue
                                try:
                                    parsed = json.loads(raw) if isinstance(raw, str) else raw
                                    if isinstance(parsed, list):
                                        final_attachments.extend(parsed)
                                    else:
                                        final_attachments.append(parsed)
                                except Exception:
                                    final_attachments.append(raw)
                            
                            unique_attachments = []
                            seen_urls = set()
                            for att in final_attachments:
                                if isinstance(att, dict) and att.get('url'):
                                    if att['url'] not in seen_urls:
                                        unique_attachments.append(att)
                                        seen_urls.add(att['url'])
                                elif isinstance(att, str) and att not in seen_urls:
                                    unique_attachments.append(att)
                                    seen_urls.add(att)

                            final_attachment_json = json.dumps(unique_attachments, ensure_ascii=False) if unique_attachments else None
                            final_course_type = proc.rel_course_type or proc.proc_course_type or "INTERNAL"
                            item_cost = (proc.cost or 0) * total_qty
                            
                            if has_gross_quantity:
                                await db.execute(text('''
                                    INSERT INTO production_plan_items 
                                    (plan_id, product_id, process_name, sequence, course_type, partner_name, 
                                     work_center, estimated_time, attachment_file, quantity, gross_quantity, status, cost)
                                    VALUES (:pid, :prod_id, :pname, :seq, :ctype, :partner, :wc, :etime, :att, :qty, :gqty, 'PLANNED', :cost)
                                '''), {
                                    "pid": plan_id, "prod_id": product_id, "pname": proc.process_name,
                                    "seq": proc.sequence, "ctype": final_course_type, "partner": proc.partner_name,
                                    "wc": proc.equipment_name, "etime": proc.estimated_time, "att": final_attachment_json,
                                    "qty": total_qty, "gqty": total_qty, "cost": item_cost
                                })
                            else:
                                await db.execute(text('''
                                    INSERT INTO production_plan_items 
                                    (plan_id, product_id, process_name, sequence, course_type, partner_name, 
                                     work_center, estimated_time, attachment_file, quantity, status, cost)
                                    VALUES (:pid, :prod_id, :pname, :seq, :ctype, :partner, :wc, :etime, :att, :qty, 'PLANNED', :cost)
                                '''), {
                                    "pid": plan_id, "prod_id": product_id, "pname": proc.process_name,
                                    "seq": proc.sequence, "ctype": final_course_type, "partner": proc.partner_name,
                                    "wc": proc.equipment_name, "etime": proc.estimated_time, "att": final_attachment_json,
                                    "qty": total_qty, "cost": item_cost
                                })
                            total_added_items += 1
                            plan_updated = True
            
            if plan_updated:
                fixed_plans_count += 1
        
        if fixed_plans_count > 0:
            print(f"Committing changes to {fixed_plans_count} plans... Total {total_added_items} processes added.")
            await db.commit()
            print("Successfully updated database.")
        else:
            print("No missing items found. Database is already intact.")

if __name__ == "__main__":
    asyncio.run(fix_missing_plan_items())
