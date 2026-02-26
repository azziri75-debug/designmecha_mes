import asyncio
from sqlalchemy import text, inspect
from app.db.base import Base
import app.models # ensure all models are imported
from app.api.deps import engine
from sqlalchemy.schema import CreateColumn
from sqlalchemy.ext.compiler import compiles

async def add_missing_columns():
    async with engine.begin() as conn:
        # We need to run sync code for inspection
        def sync_inspect(connection):
            inspector = inspect(connection)
            for table_name in Base.metadata.tables.keys():
                if table_name not in inspector.get_table_names():
                    continue
                    
                existing_columns = {col['name'] for col in inspector.get_columns(table_name)}
                model_table = Base.metadata.tables[table_name]
                
                for column in model_table.columns:
                    if column.name not in existing_columns:
                        print(f"Missing column found: {table_name}.{column.name}")
                        try:
                            # Use sqlalchemy's compiler to get the column definition
                            col_type = column.type.compile(engine.dialect)
                            # Let's try to just add the column name and type. SQLite doesn't easily support full constraints in ALTER ADD.
                            sql = f"ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type}"
                            connection.execute(text(sql))
                            print(f"Successfully added {table_name}.{column.name}")
                        except Exception as e:
                            print(f"Failed to add {table_name}.{column.name}: {e}")
                            
        await conn.run_sync(sync_inspect)

if __name__ == "__main__":
    asyncio.run(add_missing_columns())
