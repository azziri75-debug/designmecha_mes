
import asyncio
from app.api.deps import AsyncSessionLocal
from sqlalchemy import text
from app.models.approval import ApprovalDocument, ApprovalStep

async def check_zombies():
    async with AsyncSessionLocal() as db:
        # 1. Check for COMPLETED documents that still have PENDING steps
        res = await db.execute(text("""
            SELECT d.id, d.title, d.status, s.id as step_id, s.approver_id, s.status as step_status
            FROM approval_documents d
            JOIN approval_steps s ON d.id = s.document_id
            WHERE d.status = 'COMPLETED' AND s.status = 'PENDING'
        """))
        zombies = res.fetchall()
        print(f"Found {len(zombies)} zombie pending steps in COMPLETED documents.")
        for z in zombies:
            print(f"  Doc ID: {z.id}, Title: {z.title}, Step ID: {z.step_id}, Approver: {z.approver_id}")

        # 2. Check for PENDING/IN_PROGRESS documents with NO PENDING steps
        res = await db.execute(text("""
            SELECT id, title, status FROM approval_documents
            WHERE status IN ('PENDING', 'IN_PROGRESS')
            AND id NOT IN (SELECT document_id FROM approval_steps WHERE status = 'PENDING')
        """))
        stuck = res.fetchall()
        print(f"Found {len(stuck)} stuck documents (Pending status but no pending steps).")
        for s in stuck:
            print(f"  Doc ID: {s.id}, Title: {s.title}, Status: {s.status}")

        # 3. Check for admin duplicates
        res = await db.execute(text("SELECT id, login_id, name, role FROM staff WHERE name = '관리자'"))
        admins = res.fetchall()
        print(f"Found {len(admins)} admin accounts.")
        for a in admins:
            print(f"  ID: {a.id}, LoginID: {a.login_id}, Name: {a.name}, Role: {a.role}")

if __name__ == "__main__":
    asyncio.run(check_zombies())
