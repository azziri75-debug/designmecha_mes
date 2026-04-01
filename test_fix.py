
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

async def test_imports():
    try:
        from app.api.endpoints import production, purchasing
        print("Successfully imported production and purchasing endpoints.")
    except Exception as e:
        print(f"Import failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_imports())
