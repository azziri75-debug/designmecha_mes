import asyncio
from sqlalchemy.future import select
from sqlalchemy import text, func
from app.db.base import Base
from app.api.deps import engine
from app.models.approval import ApprovalDocument, ApprovalStep
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

async def check():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as db:
        print("Checking DB for pending approvals using scheduler logic...")
        
        stmt = select(
            ApprovalDocument.id.label('doc_id'),
            ApprovalDocument.title,
            ApprovalDocument.status.label('doc_status'),
            ApprovalDocument.current_sequence,
            ApprovalStep.id.label('step_id'),
            ApprovalStep.status.label('step_status'),
            ApprovalStep.sequence.label('step_sequence'),
            ApprovalStep.approver_id
        ).join(
            ApprovalStep, ApprovalDocument.id == ApprovalStep.document_id
        ).where(
            ApprovalStep.status == "PENDING",
            ApprovalDocument.status.in_(["PENDING", "IN_PROGRESS"]),
            ApprovalStep.sequence == ApprovalDocument.current_sequence,
            ApprovalDocument.current_sequence > 0
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        print(f"Total matching pending documents found: {len(rows)}")
        for r in rows:
            print(f"Doc ID: {r.doc_id}, Title: {r.title}, DocStatus: {r.doc_status}, "
                  f"CurrSeq: {r.current_sequence}, StepID: {r.step_id}, "
                  f"StepStatus: {r.step_status}, StepSeq: {r.step_sequence}, ApproverID: {r.approver_id}")
            
        print("\nChecking all documents in DB exactly:")
        all_docs = await db.execute(select(ApprovalDocument.id, ApprovalDocument.title, ApprovalDocument.status, ApprovalDocument.current_sequence))
        docs = all_docs.all()
        print(f"Total documents in system: {len(docs)}")
        for d in docs:
            print(f"  Doc ID: {d.id}, Title: {d.title}, Status: {d.status}, CurrSeq: {d.current_sequence}")

if __name__ == "__main__":
    asyncio.run(check())
