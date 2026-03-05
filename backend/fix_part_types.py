import asyncio
from sqlalchemy import text
from app.db.session import async_session

async def update_item_types():
    print("Starting database item_type update...")
    try:
        async with async_session() as session:
            # Update any product that is NOT 'PRODUCED' and NOT 'CONSUMABLE' to 'PART'
            # This covers NULL, empty strings, 'RAW_MATERIAL', etc.
            query = text("""
                UPDATE products 
                SET item_type = 'PART' 
                WHERE item_type IS NULL 
                   OR item_type NOT IN ('PRODUCED', 'CONSUMABLE', 'PART')
            """)
            
            result = await session.execute(query)
            await session.commit()
            
            updated_count = result.rowcount
            print(f"Successfully updated {updated_count} rows in the products table to 'PART'.")
            
    except Exception as e:
        print(f"Error updating database: {e}")

if __name__ == "__main__":
    asyncio.run(update_item_types())
