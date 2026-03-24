import sys
try:
    import backend.app.api.endpoints.product as product
    print("Import successful")
except SyntaxError as e:
    print(f"SyntaxError: {e.msg} at {e.filename}:{e.lineno}:{e.offset}")
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    # traceback.print_exc() is not available without import
    import traceback
    traceback.print_exc()
    sys.exit(1)
