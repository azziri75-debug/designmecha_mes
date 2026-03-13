"""
kill_ghosts.py
==============
유령 데이터 영구 삭제 스크립트

실행 방법 (백엔드 루트에서):
    python kill_ghosts.py

작동 순서:
  1. ApprovalDocument에서 deleted_at IS NOT NULL인 소프트삭제 문서 목록 조회
  2. 해당 문서들과 연결된 EmployeeTimeRecord(approval_id 기준)를 먼저 물리적 삭제
  3. 소프트삭제 ApprovalDocument를 완전히 물리적 삭제
  4. approval_id가 NULL이거나 연결된 문서가 이미 삭제된 EmployeeTimeRecord도 추가 삭제
"""

import asyncio
import os
import sys

# 패키지 경로 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select
from app.core.config import settings


async def kill_ghosts():
    # DB 연결
    db_url = settings.SQLALCHEMY_DATABASE_URI
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("=" * 60)
        print("  유령 데이터(Ghost Data) 영구 삭제 스크립트 시작")
        print("=" * 60)

        # ─────────────────────────────────────────────────────────
        # STEP 1: 소프트 삭제된 ApprovalDocument ID 목록 수집
        # ─────────────────────────────────────────────────────────
        result = await session.execute(
            text("SELECT id, doc_type, author_id, created_at FROM approval_documents WHERE deleted_at IS NOT NULL")
        )
        deleted_docs = result.fetchall()
        deleted_doc_ids = [row[0] for row in deleted_docs]

        print(f"\n[STEP 1] 소프트 삭제된 결재 문서: {len(deleted_docs)}건")
        for row in deleted_docs:
            print(f"  - ID={row[0]}, type={row[1]}, author_id={row[2]}, created_at={row[3]}")

        if deleted_doc_ids:
            # ─────────────────────────────────────────────────────
            # STEP 2: 연결된 EmployeeTimeRecord 물리적 삭제 (approval_id 기준)
            # ─────────────────────────────────────────────────────
            ids_param = ",".join(str(i) for i in deleted_doc_ids)
            del_etr = await session.execute(
                text(f"DELETE FROM employee_time_records WHERE approval_id IN ({ids_param})")
            )
            print(f"\n[STEP 2] 연결된 EmployeeTimeRecord 삭제: {del_etr.rowcount}건")

            # ─────────────────────────────────────────────────────
            # STEP 3: 소프트 삭제된 ApprovalDocument 물리적 삭제
            # ─────────────────────────────────────────────────────
            # FK 제약 때문에 ApprovalStep 먼저 삭제
            del_steps = await session.execute(
                text(f"DELETE FROM approval_steps WHERE document_id IN ({ids_param})")
            )
            print(f"[STEP 3a] ApprovalStep 삭제: {del_steps.rowcount}건")

            # ConsumablePurchaseWait 먼저 삭제
            del_waits = await session.execute(
                text(f"DELETE FROM consumable_purchase_waits WHERE approval_id IN ({ids_param})")
            )
            print(f"[STEP 3b] ConsumablePurchaseWait 삭제: {del_waits.rowcount}건")

            del_docs = await session.execute(
                text(f"DELETE FROM approval_documents WHERE id IN ({ids_param})")
            )
            print(f"[STEP 3c] ApprovalDocument 물리 삭제: {del_docs.rowcount}건")
        else:
            print("  → 소프트 삭제된 문서 없음. 건너뜀.")

        # ─────────────────────────────────────────────────────────
        # STEP 4: approval_id가 NULL인 결재 카테고리 EmployeeTimeRecord 삭제
        # ─────────────────────────────────────────────────────────
        APPROVAL_CATS = ("'ANNUAL'", "'HALF_DAY'", "'SICK'", "'EARLY_LEAVE'", "'OUTING'", "'EVENT_LEAVE'")
        cats_sql = ", ".join(APPROVAL_CATS)
        del_null = await session.execute(
            text(f"DELETE FROM employee_time_records WHERE category IN ({cats_sql}) AND approval_id IS NULL")
        )
        print(f"\n[STEP 4] approval_id NULL인 유령 EmployeeTimeRecord 삭제: {del_null.rowcount}건")

        await session.commit()

        print("\n" + "=" * 60)
        print("  ✅ 유령 데이터 삭제 완료!")
        print("=" * 60)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(kill_ghosts())
