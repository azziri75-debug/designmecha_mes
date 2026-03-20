import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
try:
    import app.main
    print("Import successful")
except Exception:
    import traceback
    traceback.print_exc()
