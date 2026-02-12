import asyncio
import sys
import os
import json
from sqlalchemy import select
from app.api import deps
from app.models.sales import Estimate

# Add current directory to path
sys.path.append(os.getcwd())

from app.main import app

async def check_attachments():
    print("Checking Estimate Attachments...")
    
    # We need a DB session. 
    # Since we can't easily inject Depends(deps.get_db) here without a request,
    # we'll use the session factory directly if available, or just mock a request cycle if needed.
    # Actually, deps.get_db is a generator. We can iterate it.
    
    async for db in deps.get_db():
        try:
            query = select(Estimate)
            result = await db.execute(query)
            estimates = result.scalars().all()
            
            print(f"Found {len(estimates)} estimates.")
            
            missing_count = 0
            total_files = 0
            
            for est in estimates:
                if not est.attachment_file:
                    continue
                    
                files = []
                if isinstance(est.attachment_file, list):
                    files = est.attachment_file
                elif isinstance(est.attachment_file, str):
                    try:
                        files = json.loads(est.attachment_file)
                    except:
                        print(f"Estimate {est.id}: Failed to parse JSON: {est.attachment_file}")
                        continue
                        
                for file_info in files:
                    total_files += 1
                    url = file_info.get('url')
                    name = file_info.get('name')
                    
                    if not url:
                        print(f"Estimate {est.id}: Missing URL for file {name}")
                        continue
                        
                    # Convert URL to local path
                    # URL: /static/path/to/file
                    # Local: uploads/path/to/file
                    
                    if url.startswith("/static/"):
                        rel_path = url.replace("/static/", "", 1)
                        # Handle URL decoding if necessary (though usually stored raw/decoded in DB?)
                        # backend logic usually requires decoded path for os.path operations
                        import urllib.parse
                        rel_path = urllib.parse.unquote(rel_path)
                        
                        local_path = os.path.join("uploads", rel_path)
                        
                        if not os.path.exists(local_path):
                            print(f"[MISSING] Estimate {est.id}: File not found on disk: {local_path} (URL: {url})")
                            missing_count += 1
                            
                            # Debug: list parent dir
                            parent = os.path.dirname(local_path)
                            if os.path.exists(parent):
                                print(f"  Parent dir exists. Contents: {os.listdir(parent)}")
                            else:
                                print(f"  Parent dir does NOT exist: {parent}")
                        else:
                            # print(f"[OK] Estimate {est.id}: {name}")
                            pass
                    else:
                        print(f"Estimate {est.id}: Invalid URL format: {url}")
            
            print(f"\nCheck Complete.")
            print(f"Total Files: {total_files}")
            print(f"Missing Files: {missing_count}")
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            break # Run once

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(check_attachments())
