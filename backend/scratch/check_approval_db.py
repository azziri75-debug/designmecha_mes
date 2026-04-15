import asyncio
import os
import sys

# Add the backend directory to sys.path to allow imports
sys.path.append(os.getcwd())

from app.db.session import AsyncSessionLocal
from app.models.approval import ApprovalLine
from app.models.basics import Staff
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

async def check():
    async with AsyncSessionLocal() as db:
        # Check Approval Lines for INTERNAL_DRAFT
        lines_res = await db.execute(
            select(ApprovalLine)
            .options(selectinload(ApprovalLine.approver))
            .where(ApprovalLine.doc_type == 'INTERNAL_DRAFT')
        )
        lines = lines_res.scalars().all()
        print('--- INTERNAL_DRAFT Approval Lines ---')
        if not lines:
            print('No lines found for INTERNAL_DRAFT')
        for l in lines:
            name = l.approver.name if l.approver else "N/A"
            role = l.approver.role if l.approver else "N/A"
            print(f'DeptID: {l.department_id}, Approver: {name}, Role: {role}, Seq: {l.sequence}')
        
        # Check Staff Sample
        staff_res = await db.execute(select(Staff).limit(20))
        staff = staff_res.scalars().all()
        print('\n--- Staff Sample ---')
        for s in staff:
            print(f'Name: {s.name}, Role: {s.role}, DeptID: {s.department_id}')

if __name__ == "__main__":
    asyncio.run(check())
