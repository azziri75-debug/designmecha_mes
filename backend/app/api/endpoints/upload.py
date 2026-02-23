from fastapi import APIRouter, File, UploadFile, HTTPException
import shutil
import os
from datetime import datetime
import uuid
from fastapi.responses import FileResponse
import urllib.parse
import mimetypes

router = APIRouter()

# Use absolute path based on project root to avoid CWD issues
# __file__ = backend/app/api/endpoints/upload.py → need 4 dirname to reach backend/
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))  # backend/
UPLOAD_DIR = os.path.join(_BASE_DIR, "uploads")
print(f"[UPLOAD INIT] _BASE_DIR={_BASE_DIR}, UPLOAD_DIR={UPLOAD_DIR}")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.post("/upload", response_model=dict)
async def upload_file(file: UploadFile = File(...)):
    try:
        # Generate unique filename
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        current_date = datetime.now().strftime("%Y%m%d")
        
        # Create date-based subdirectory
        save_dir = os.path.join(UPLOAD_DIR, current_date)
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
            
        file_path = os.path.join(save_dir, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Return the relative path (normalized for URL)
        relative_path = os.path.join(current_date, unique_filename).replace("\\", "/")
        return {"filename": file.filename, "url": f"/static/{relative_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download")
async def download_file(path: str, filename: str = None):
    try:
        # Strip common prefixes to get the relative path within uploads/
        clean_path = path
        for prefix in ["/static/", "static/", "/uploads/", "uploads/"]:
            if clean_path.startswith(prefix):
                clean_path = clean_path[len(prefix):]
                break
        # Also strip leading slash if still present
        clean_path = clean_path.lstrip("/")
        
        # Security: Prevent directory traversal
        if ".." in clean_path:
            raise HTTPException(status_code=400, detail="Invalid path")
            
        file_path = os.path.join(UPLOAD_DIR, clean_path)
        print(f"[DOWNLOAD DEBUG] path param='{path}', clean_path='{clean_path}', file_path='{file_path}', exists={os.path.exists(file_path)}")
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {clean_path}")
            
        if not filename: # Changed from download_filename to filename to match parameter
            # Try to extract from path if not provided
            basename = os.path.basename(file_path)
            if "_" in basename:
                # heuristic: take everything after first underscore
                filename = basename.split("_", 1)[1] # Changed from download_filename to filename
            else:
                filename = basename # Changed from download_filename to filename
                
        # Guess mime type
        media_type, _ = mimetypes.guess_type(file_path)
        if not media_type:
            media_type = 'application/octet-stream'

        # Starlette FileResponse handles UTF-8 filenames correctly with filename argument
        return FileResponse(
            path=file_path, 
            filename=filename, # Changed from download_filename to filename
            media_type=media_type
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Download error: {e}")
        raise HTTPException(status_code=500, detail="Download failed")

@router.get("/preview")
async def preview_file(path: str):
    try:
        # Strip common prefixes to get the relative path within uploads/
        clean_path = path
        for prefix in ["/static/", "static/", "/uploads/", "uploads/"]:
            if clean_path.startswith(prefix):
                clean_path = clean_path[len(prefix):]
                break
        # Also strip leading slash if still present
        clean_path = clean_path.lstrip("/")
        
        # Security: Prevent directory traversal
        if ".." in clean_path:
            raise HTTPException(status_code=400, detail="Invalid path")
            
        file_path = os.path.join(UPLOAD_DIR, clean_path)
        print(f"[PREVIEW DEBUG] path param='{path}', clean_path='{clean_path}', file_path='{file_path}', exists={os.path.exists(file_path)}")
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {clean_path}")
            
        # Determine media type for browser preview
        media_type, _ = mimetypes.guess_type(file_path)
        
        # Manual fallback for common types if mimetypes fails or returns octet-stream
        if not media_type or media_type == 'application/octet-stream':
             ext = os.path.splitext(file_path)[1].lower()
             mime_map = {
                 '.jpg': 'image/jpeg',
                 '.jpeg': 'image/jpeg',
                 '.png': 'image/png',
                 '.gif': 'image/gif',
                 '.webp': 'image/webp',
                 '.pdf': 'application/pdf',
                 '.txt': 'text/plain',
                 '.html': 'text/html',
                 '.json': 'application/json',
                 '.nc': 'text/plain',
                 '.gcode': 'text/plain',
                 '.tap': 'text/plain'
             }
             media_type = mime_map.get(ext, 'application/octet-stream')

        # Extract strict filename for header
        basename = os.path.basename(file_path)
        preview_filename = basename
        if "_" in basename:
            preview_filename = basename.split("_", 1)[1]
        
        return FileResponse(
            path=file_path,
            # filename parameter removed to prevent attachment behavior
            media_type=media_type,
            content_disposition_type='inline',
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Preview error: {e}")
        raise HTTPException(status_code=500, detail="Preview failed")
