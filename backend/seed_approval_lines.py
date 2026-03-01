import asyncio
from sqlalchemy import text
from app.api.deps import engine
from app.models.basics import Staff
from sqlalchemy.future import select

async def seed_approval_lines():
    async with engine.begin() as conn:
        # 1. Get Admin User (이준호)
        # Note: We need to use a session for querying or just a raw SQL
        pass

    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker
    
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as db:
        # Get admin
        result = await db.execute(select(Staff).where(Staff.name == "이준호"))
        admin = result.scalar_one_or_none()
        
        if not admin:
            print("Admin user '이준호' not found. Please run startup first.")
            return

        doc_types = ["ESTIMATE", "PRODUCTION_SHEET", "ESTIMATE_REQUEST", "PURCHASE_ORDER"]
        
        for doc_type in doc_types:
            # Check if lines exist
            check = await db.execute(text(f"SELECT id FROM approval_lines WHERE doc_type = '{doc_type}'"))
            if not check.scalar():
                # Add admin as the sole approver for testing
                await db.execute(text(
                    "INSERT INTO approval_lines (doc_type, approver_id, sequence) VALUES (:dt, :aid, :seq)"
                ), {"dt": doc_type, "aid": admin.id, "seq": 1})
                print(f"Seeded default approval line for {doc_type}")
        
        await db.commit()
    print("Approval lines seeding complete.")

if __name__ == "__main__":
    asyncio.run(seed_approval_lines())
