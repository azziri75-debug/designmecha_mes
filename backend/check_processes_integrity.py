
import asyncio
from sqlalchemy import select, func
from app.api.deps import get_db
from app.models.product import ProductProcess, Product

async def check_duplicates():
    async for db in get_db():
        # Check for products with duplicate sequences or duplicate process entries
        # Group by product_id and sequence
        stmt = select(
            ProductProcess.product_id, 
            ProductProcess.sequence, 
            func.count(ProductProcess.id).label('cnt')
        ).group_by(
            ProductProcess.product_id, 
            ProductProcess.sequence
        ).having(func.count(ProductProcess.id) > 1)
        
        result = await db.execute(stmt)
        duplicates = result.all()
        
        if not duplicates:
            print("No duplicate product-sequence pairs found.")
        else:
            print(f"Found {len(duplicates)} products with duplicate sequences:")
            for pid, seq, cnt in duplicates:
                prod_stmt = select(Product).where(Product.id == pid)
                prod_res = await db.execute(prod_stmt)
                prod = prod_res.scalar_one_or_none()
                name = prod.name if prod else f"ID:{pid}"
                print(f"Product: {name} (ID:{pid}), Seq: {seq}, Count: {cnt}")

        # Check for missing process associations (invalid process_id)
        from app.models.product import Process
        invalid_stmt = select(ProductProcess).outerjoin(Process, ProductProcess.process_id == Process.id).where(Process.id == None)
        invalid_res = await db.execute(invalid_stmt)
        invalids = invalid_res.scalars().all()
        if invalids:
            print(f"\nFound {len(invalids)} ProductProcess entries with missing Process master records:")
            for inv in invalids:
                print(f"PP ID: {inv.id}, Product ID: {inv.product_id}, Invalid Process ID: {inv.process_id}")
        else:
            print("\nNo ProductProcess entries with missing Process master records found.")

if __name__ == "__main__":
    import os
    import sys
    # Add backend to path
    sys.path.append(os.path.join(os.getcwd(), "backend"))
    asyncio.run(check_duplicates())
