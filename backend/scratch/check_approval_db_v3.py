import asyncio
import os
import sys

# Ensure the backend directory is in the path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.db.session import AsyncSessionLocal
from app.models.approval import ApprovalLine
from app.models.basics import Staff
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

async def check():
    async with AsyncSessionLocal() as db:
        # Check Staff roles
        staff_res = await db.execute(select(Staff))
        staff_list = staff_res.scalars().all()
        print("--- Staff roles ---")
        role_counts = {}
        for s in staff_list:
            print(f"Name: {s.name}, Role: '{s.role}', DeptID: {s.department_id}")
            role_counts[s.role] = role_counts.get(s.role, 0) + 1
        print("\nRole Summary:", role_counts)

        # Check Approval Lines for INTERNAL_DRAFT
        lines_res = await db.execute(
            select(ApprovalLine)
            .options(selectinload(ApprovalLine.approver))
            .where(ApprovalLine.doc_type == 'INTERNAL_DRAFT')
        )
        lines = lines_res.scalars().all()
        print("\n--- Approval Lines (INTERNAL_DRAFT) ---")
        for l in lines:
            print(f"Dept: {l.department_id}, Approver: {l.approver.name if l.approver else 'N/A'}, Role: {l.role}, Seq: {l.sequence}")

if __name__ == "__main__":
    asyncio.run(check())
