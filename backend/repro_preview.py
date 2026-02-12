import asyncio
import sys
import os
from httpx import AsyncClient, ASGITransport
import shutil

# Add current directory to path
sys.path.append(os.getcwd())

from app.main import app

async def verify_preview():
    print("Starting verification for Preview Endpoint...")
    
    # 1. Create a dummy file in uploads/estimates
    upload_dir = "uploads/estimates"
    os.makedirs(upload_dir, exist_ok=True)
    filename = "test_preview_file.txt"
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("This is a test file for preview.")
    
    print(f"Created test file at: {file_path}")
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        
        # 2. Call Preview Endpoint
        url_path = f"/static/estimates/{filename}"
        print(f"\nRequesting Preview for: {url_path}")
        
        res = await ac.get("/api/v1/preview", params={"path": url_path})
        
        print(f"Status Code: {res.status_code}")
        if res.status_code == 200:
            print("Preview Success!")
            print(f"Content: {res.text}")
            print(f"Headers: {res.headers}")
        else:
            print(f"Preview Failed: {res.text}")

        # 3. Call Download Endpoint
        print(f"\nRequesting Download for: {url_path}")
        res = await ac.get("/api/v1/download", params={"path": url_path, "filename": filename})
        print(f"Status Code: {res.status_code}")
        if res.status_code == 200:
             print("Download Success!")
        else:
             print(f"Download Failed: {res.text}")

    # Cleanup
    if os.path.exists(file_path):
        os.remove(file_path)
    print("\nTest file removed.")

if __name__ == "__main__":
    try:
        asyncio.run(verify_preview())
    except Exception as e:
        print(f"An error occurred: {e}")
