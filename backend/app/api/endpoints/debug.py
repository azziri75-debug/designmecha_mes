from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.api import deps

router = APIRouter()

@router.get("/fks")
async def get_fks(
    table_name: str = "products",
    db: AsyncSession = Depends(deps.get_db)
):
    """
    Inspect Foreign Keys for a given table.
    """
    # PostgreSQL specific query
    query = text(f"""
        SELECT
            tc.constraint_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.delete_rule
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='{table_name}';
    """)
    
    try:
        result = await db.execute(query)
        fks = result.fetchall()
        
        fk_list = []
        for fk in fks:
            fk_list.append({
                "constraint_name": fk[0],
                "column_name": fk[1],
                "foreign_table": fk[2],
                "foreign_column": fk[3],
                "delete_rule": fk[4]
            })
            
        return {"table": table_name, "fks": fk_list}
    except Exception as e:
        return {"error": str(e)}
