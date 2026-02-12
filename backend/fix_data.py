import sqlite3

def fix_data():
    db_files = ['mes_erp_v2.db', 'mes_erp.db'] # Fix both just in case
    
    for db_file in db_files:
        print(f"Checking {db_file}...")
        try:
            conn = sqlite3.connect(db_file)
            cursor = conn.cursor()
            
            # Check for NULLs
            cursor.execute("SELECT count(*) FROM processes WHERE course_type IS NULL")
            null_count = cursor.fetchone()[0]
            
            if null_count > 0:
                print(f"  Found {null_count} processes with NULL course_type. Updating...")
                cursor.execute("UPDATE processes SET course_type = 'INTERNAL' WHERE course_type IS NULL")
                conn.commit()
                print("  Update complete.")
            else:
                print("  No NULL course_type found.")
            
            # Verify
            cursor.execute("SELECT count(*) FROM processes WHERE course_type IS NULL")
            final_count = cursor.fetchone()[0]
            print(f"  Remaining NULLs: {final_count}")
            
            if final_count == 0:
                print("  SUCCESS: Data integrity restored.")
                
            conn.close()
        except Exception as e:
            print(f"  Error checking/updating {db_file}: {e}")

if __name__ == "__main__":
    fix_data()
