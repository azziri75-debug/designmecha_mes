import sqlite3

def fix_orphans():
    db_files = ['mes_erp_v2.db'] # Focus on the active DB
    
    for db_file in db_files:
        print(f"Checking {db_file}...")
        try:
            conn = sqlite3.connect(db_file)
            cursor = conn.cursor()
            
            # Count orphans
            query = """
                SELECT count(*) FROM product_processes 
                WHERE process_id NOT IN (SELECT id FROM processes)
            """
            cursor.execute(query)
            orphan_count = cursor.fetchone()[0]
            
            if orphan_count > 0:
                print(f"  Found {orphan_count} orphan product_processes. Deleting...")
                delete_query = """
                    DELETE FROM product_processes 
                    WHERE process_id NOT IN (SELECT id FROM processes)
                """
                cursor.execute(delete_query)
                conn.commit()
                print("  Deletion complete.")
            else:
                print("  No orphan product_processes found.")
                
            # Verify
            cursor.execute(query)
            final_count = cursor.fetchone()[0]
            print(f"  Remaining orphans: {final_count}")
            
            conn.close()
        except Exception as e:
            print(f"  Error checking/updating {db_file}: {e}")

if __name__ == "__main__":
    fix_orphans()
