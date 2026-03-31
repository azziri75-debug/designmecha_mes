from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from app.api.utils.email import send_approval_email, send_accounting_completion_email
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, update, delete
from typing import List, Optional
from datetime import datetime, date, timedelta, time

import traceback
import logging

logger = logging.getLogger(__name__)

from app.api import deps
from app.models.approval import ApprovalDocument, ApprovalLine, ApprovalStep, ApprovalStatus, ApprovalAttachment
from app.models.basics import Staff, EmployeeTimeRecord, Company
from app.models.purchasing import (
    ConsumablePurchaseWait, PurchaseOrder, PurchaseOrderItem, PurchaseStatus, 
    MaterialRequirement, OutsourcingOrder, OutsourcingStatus
)
from app.models.product import Product
from app.schemas.approval import (
    ApprovalDocumentCreate, ApprovalDocumentResponse,
    ApprovalLineCreate, ApprovalLineResponse,
    ApprovalAction, ApprovalStats,
    ApprovalAttachmentCreate, ApprovalAttachmentBase
)
from app.api.endpoints.hr import get_or_create_annual_leave, _business_days_between, sync_annual_leave_usage

router = APIRouter()

ROLE_RANKING = {
    "연구원": 1,
    "사원": 1,
    "대리": 2,
    "과장": 3,
    "차장": 4,
    "부장": 5,
    "이사": 6,
    "대표이사": 7
}

def get_staff_rank(role: str) -> int:
    if not role:
        return 0
    return ROLE_RANKING.get(role.strip(), 0)

@router.get("/stats", response_model=ApprovalStats)
async def get_approval_stats(
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """대시보드 통계 조회 (관리용 전역 통계 + 나의 대기 건수)"""
    # 1. 시스템 전체의 결제 진행 상황 (Dashboard는 관리용이므로 전역 수치 표시)
    # 기안 대기 (작성 중 또는 결재 진행 중인 모든 문서)
    pending = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS]),
        ApprovalDocument.deleted_at.is_(None)
    ))
    
    # 결재 완료 (전체)
    completed = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.status == ApprovalStatus.COMPLETED,
        ApprovalDocument.deleted_at.is_(None)
    ))
    
    # 반려 문서 (전체)
    rejected = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.status == ApprovalStatus.REJECTED,
        ApprovalDocument.deleted_at.is_(None)
    ))
    
    # 2. 내가 결재해야 할 대기 건수 (개인화된 수치)
    waiting = await db.execute(select(func.count(ApprovalDocument.id)).join(ApprovalStep).where(
        ApprovalStep.approver_id == current_user.id,
        ApprovalStep.status == "PENDING",
        ApprovalDocument.current_sequence == ApprovalStep.sequence,
        ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS]),
        ApprovalDocument.deleted_at.is_(None)
    ))

    return {
        "pending_count": pending.scalar() or 0,
        "completed_count": completed.scalar() or 0,
        "rejected_count": rejected.scalar() or 0,
        "waiting_for_me_count": waiting.scalar() or 0
    }

@router.get("/lines", response_model=List[ApprovalLineResponse])
async def get_approval_lines(
    doc_type: str = Query(...),
    db: AsyncSession = Depends(deps.get_db)
):
    """문서 종류별 결재선 템플릿 조회 (대소문자 구분 없음)"""
    doc_type_clean = doc_type.strip().upper()
    result = await db.execute(
        select(ApprovalLine)
        .options(selectinload(ApprovalLine.approver))
        .where(func.upper(ApprovalLine.doc_type) == doc_type_clean)
        .order_by(ApprovalLine.sequence)
    )
    return result.scalars().all()

@router.post("/lines", response_model=List[ApprovalLineResponse])
async def set_approval_lines(
    doc_type: str,
    lines: List[ApprovalLineCreate],
    db: AsyncSession = Depends(deps.get_db)
):
    """문서 종류별 결재선 템플릿 설정"""
    # 기존 설정 삭제
    await db.execute(delete(ApprovalLine).where(ApprovalLine.doc_type == doc_type))
    
    for line in lines:
        db_line = ApprovalLine(**line.model_dump())
        db.add(db_line)
    
    await db.commit()
    
    # 다시 조회 (관계형 객체 approver 로드 포함)
    result = await db.execute(
        select(ApprovalLine)
        .options(selectinload(ApprovalLine.approver))
        .where(ApprovalLine.doc_type == doc_type)
        .order_by(ApprovalLine.sequence)
    )
    return result.scalars().all()

@router.get("/documents", response_model=List[ApprovalDocumentResponse])
async def list_documents(
    view_mode: str = "ALL", # ALL, MY_DRAFTS, MY_WAITING, MY_COMPLETED, MY_REJECTED, WAITING_FOR_ME, ALL_PENDING, ALL_COMPLETED, ALL_REJECTED
    doc_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    author_id: Optional[int] = None,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """결재 문서 목록 조회"""
    query = select(ApprovalDocument).options(
        selectinload(ApprovalDocument.author),
        selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver)
    ).where(ApprovalDocument.deleted_at.is_(None))

    if doc_type:
        query = query.where(ApprovalDocument.doc_type == doc_type)
    if start_date:
        query = query.where(func.date(ApprovalDocument.created_at) >= start_date)
    if end_date:
        query = query.where(func.date(ApprovalDocument.created_at) <= end_date)
    if author_id:
        query = query.where(ApprovalDocument.author_id == author_id)

    query = query.options(selectinload(ApprovalDocument.attachments)).order_by(ApprovalDocument.created_at.desc())
    
    # 일반 사용자의 경우 본인이 작성자이거나 결재자인 문서만 조회 가능하도록 가시성 제한
    if current_user.user_type != "ADMIN":
        if view_mode in ["ALL", "ALL_PENDING", "ALL_COMPLETED", "ALL_REJECTED"]:
            query = query.where(ApprovalDocument.author_id == current_user.id)
    
    if view_mode == "MY_DRAFTS":
        query = query.where(ApprovalDocument.author_id == current_user.id)
    elif view_mode == "MY_WAITING":
        query = query.where(
            ApprovalDocument.author_id == current_user.id,
            ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS])
        )
    elif view_mode == "MY_COMPLETED":
        query = query.where(
            ApprovalDocument.author_id == current_user.id,
            ApprovalDocument.status == ApprovalStatus.COMPLETED
        )
    elif view_mode == "MY_REJECTED":
        query = query.where(
            ApprovalDocument.author_id == current_user.id,
            ApprovalDocument.status == ApprovalStatus.REJECTED
        )
    elif view_mode == "WAITING_FOR_ME" or view_mode == "MY_APPROVALS":
        query = query.join(ApprovalStep).where(
            ApprovalStep.approver_id == current_user.id,
            ApprovalStep.status == "PENDING",
            ApprovalStep.sequence == ApprovalDocument.current_sequence,
            ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS])
        )
    elif view_mode == "ALL_PENDING":
        query = query.where(ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS]))
    elif view_mode == "ALL_COMPLETED":
        query = query.where(ApprovalDocument.status == ApprovalStatus.COMPLETED)
    elif view_mode == "ALL_REJECTED":
        query = query.where(ApprovalDocument.status == ApprovalStatus.REJECTED)

    result = await db.execute(query)
    return result.scalars().all()

@router.get("/documents/by-reference", response_model=Optional[ApprovalDocumentResponse])
async def get_document_by_reference(
    reference_id: int,
    reference_type: str,
    db: AsyncSession = Depends(deps.get_db)
):
    """레퍼런스(PO ID 등)로 연결된 결재 문서 조회"""
    query = select(ApprovalDocument).options(
        selectinload(ApprovalDocument.author),
        selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver),
        selectinload(ApprovalDocument.attachments)
    ).where(
        ApprovalDocument.reference_id == reference_id,
        ApprovalDocument.reference_type == reference_type,
        ApprovalDocument.deleted_at.is_(None)
    ).order_by(ApprovalDocument.created_at.desc()).limit(1)

    result = await db.execute(query)
    return result.scalars().first()

@router.post("/documents", response_model=ApprovalDocumentResponse)
async def create_document(
    doc_in: ApprovalDocumentCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """새 결재 문서 생성 (기안)"""
    try:
        # 0. Log Payload for Debugging
        logger.info(f"[APPROVAL] Creating document for user {current_user.id}. Type: {doc_in.doc_type}")
        
        # 1. Duplicate Check for Attendance
        if doc_in.doc_type in ["VACATION", "EARLY_LEAVE", "OVERTIME"]:
            content = doc_in.content or {}
            target_dates = []
            if doc_in.doc_type == "VACATION":
                s_date = content.get("start_date")
                e_date = content.get("end_date") or s_date
                if s_date:
                    # Basic range check (could be more sophisticated with daily overlaps)
                    target_dates = [s_date] 
            else:
                t_date = content.get("date")
                if t_date: target_dates = [t_date]
            
            if target_dates:
                # Check for existing non-rejected documents of the same type or other attendance types on the same date
                # To keep it simple and DB agnostic, we fetch recent docs for the user and filter in Python
                # Usually only a handful of docs per user per month
                recent_limit = datetime.now() - timedelta(days=60)
                stmt = select(ApprovalDocument).where(
                    ApprovalDocument.author_id == current_user.id,
                    ApprovalDocument.doc_type.in_(["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]),
                    ApprovalDocument.status.notin_([ApprovalStatus.REJECTED, ApprovalStatus.CANCELLED]),
                    ApprovalDocument.deleted_at.is_(None),  # 소프트 삭제된 문서 제외 (Bug #3 대응)
                    ApprovalDocument.created_at >= recent_limit
                )
                result = await db.execute(stmt)
                existing_docs = result.scalars().all()
                
                for edoc in existing_docs:
                    ec = edoc.content or {}
                    if edoc.doc_type == "VACATION":
                        if ec.get("start_date") in target_dates or ec.get("end_date") in target_dates:
                            raise HTTPException(status_code=400, detail="해당 일자 인근에 이미 등록된 근태 내역이 있습니다. 다른 날짜를 선택해 주세요.")
                    else:
                        if ec.get("date") in target_dates:
                            raise HTTPException(status_code=400, detail="해당 일자에 이미 등록된 근태 내역이 있습니다. 다른 날짜를 선택해 주세요.")

        # 1.5 Duplicate Check for Linked Documents (Purchase Order, etc.)
        if doc_in.reference_id and doc_in.reference_type:
            stmt = select(ApprovalDocument).where(
                ApprovalDocument.reference_id == doc_in.reference_id,
                ApprovalDocument.reference_type == doc_in.reference_type,
                ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS, ApprovalStatus.COMPLETED]),
                ApprovalDocument.deleted_at.is_(None)
            )
            existing_res = await db.execute(stmt)
            if existing_res.scalars().first():
                raise HTTPException(
                    status_code=400, 
                    detail="이미 해당 건에 대해 진행 중이거나 완료된 결재 문서가 존재합니다."
                )

        # 2. 문서 저장
        db_doc = ApprovalDocument(
            author_id=current_user.id,
            doc_type=doc_in.doc_type,
            title=doc_in.title,
            content=doc_in.content,
            attachment_file=doc_in.attachment_file,
            status=ApprovalStatus.PENDING,
            current_sequence=1,
            reference_id=doc_in.reference_id,
            reference_type=doc_in.reference_type
        )
        db.add(db_doc)
        await db.flush()
        
        # 3. 첨부파일 저장
        if doc_in.attachments_to_add:
            for att in doc_in.attachments_to_add:
                db_att = ApprovalAttachment(
                    document_id=db_doc.id,
                    filename=att.filename,
                    url=att.url
                )
                db.add(db_att)
        
        # [NEW] 원본 데이터(PO/OO)와 첨부파일 동기화
        await db.flush()
        await db.refresh(db_doc, ["attachments"])
        await sync_attachments_to_reference(db, db_doc)
        
        # 4. 결재 단계(Steps) 생성 (지정된 결재자 우선, 없으면 템플릿 사용)
        lines_to_process = []
        if doc_in.custom_approvers:
            for ca in doc_in.custom_approvers:
                s_res = await db.execute(select(Staff).where(Staff.id == ca.staff_id))
                target_s = s_res.scalars().first()
                if target_s:
                    lines_to_process.append({"approver_id": ca.staff_id, "sequence": ca.sequence, "role": target_s.role})
        else:
            # Get default approval lines from template (Case-insensitive & Trimmed)
            doc_type_clean = doc_in.doc_type.strip().upper()
            print(f"[DEBUG] Fetching approval lines for: '{doc_type_clean}' (Original: '{doc_in.doc_type}')")
            lines_res = await db.execute(
                select(ApprovalLine)
                .options(selectinload(ApprovalLine.approver))
                .where(func.upper(ApprovalLine.doc_type) == doc_type_clean)
                .order_by(ApprovalLine.sequence)
            )
            lines = lines_res.scalars().all()
            print(f"[DEBUG] Found {len(lines)} default lines for {doc_type_clean}")
            if not lines:
                 print(f"[WARNING] No default approval lines found for {doc_type_clean}")
            for line in lines:
                if line.approver:
                    lines_to_process.append({"approver_id": line.approver_id, "sequence": line.sequence, "role": line.approver.role})
                else:
                    # If approver is NULL but role is specified (generic placeholder) - Not currently supported in model, but for safety:
                    print(f"[WARNING] ApprovalLine ID {line.id} has no approver_id")

        # Validate approval lines for non-draft documents
        if not lines_to_process:
            # Check if this document type is one that *must* have a predefined line
            if doc_in.doc_type not in ["INTERNAL_DRAFT", "EXPENSE_REPORT", "CONSUMABLES_PURCHASE", "EARLY_LEAVE", "LEAVE_REQUEST", "PURCHASE_ORDER", "OVERTIME"]:
                pass 
        
        author_rank = get_staff_rank(current_user.role)
        # [FIX] 하드코딩된 1 대신 결재선의 최소 순번부터 시작하도록 수정
        current_seq = min([l["sequence"] for l in lines_to_process]) if lines_to_process else 1
        all_auto_approved = True
        
        if lines_to_process:
            for lp in lines_to_process:
                approver_role = lp.get("role", "")
                approver_rank = get_staff_rank(approver_role)
                is_auto = (lp["approver_id"] == current_user.id) or (author_rank >= approver_rank)
                
                step = ApprovalStep(
                    document_id=db_doc.id,
                    approver_id=lp["approver_id"],
                    sequence=lp["sequence"],
                    status="APPROVED" if is_auto else "PENDING",
                    processed_at=datetime.now() if is_auto else None,
                    comment="기안자 자동 승인" if (lp["approver_id"] == current_user.id) else ("기안자 직급에 따른 자동 승인" if is_auto else None)
                )
                db.add(step)
                
                if is_auto:
                    if current_seq == lp["sequence"]:
                        current_seq += 1
                else:
                    all_auto_approved = False
        else:
            all_auto_approved = False

        db_doc.current_sequence = current_seq
        if all_auto_approved:
            db_doc.status = ApprovalStatus.COMPLETED
            print(f"[DEBUG] Document {db_doc.id} auto-completed. Type: {db_doc.doc_type}")
            # [NEW] 회계 담당자 알림
            await notify_accounting_managers(db, db_doc, background_tasks)
            if db_doc.doc_type in ["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]:
                await create_attendance_record(db, db_doc)
            elif db_doc.doc_type in ["SUPPLIES", "CONSUMABLES_PURCHASE"]:
                print(f"[DEBUG] Triggering process_consumables for auto-approved doc {db_doc.id}")
                await process_consumables(db, db_doc)
            
            if db_doc.doc_type == "PURCHASE_ORDER" or db_doc.reference_id:
                await sync_reference_status(db, db_doc)
        elif current_seq > 1:
            db_doc.status = ApprovalStatus.IN_PROGRESS

        await db.commit()

        # 🚨 신규 로직: 1차(또는 다음) 결재권자 이메일 발송
        if db_doc.status in [ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS]:
            next_step_res = await db.execute(
                select(ApprovalStep)
                .options(selectinload(ApprovalStep.approver))
                .where(
                    ApprovalStep.document_id == db_doc.id,
                    ApprovalStep.status == "PENDING"
                ).order_by(ApprovalStep.sequence.asc())
            )
            next_step = next_step_res.scalars().first()
            if next_step and getattr(next_step, "approver", None):
                approver_email = next_step.approver.email
                if approver_email:
                    background_tasks.add_task(
                        send_approval_email,
                        to_email=approver_email,
                        doc_title=db_doc.title,
                        drafter_name=current_user.name,
                        reference_id=str(db_doc.id)
                    )

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        error_msg = traceback.format_exc()
        logger.error(f"[APPROVAL_ERROR] Failed to create document: {error_msg}")
        await db.rollback()
        
        # Provide more specific error if possible
        detail_msg = f"결재 문서 생성 중 서버 오류 발생: {str(e)}"
        if "id" in str(e).lower() and "null" in str(e).lower():
            detail_msg = "결재선 데이터(결재자 ID)가 올바르지 않거나 누락되었습니다."
        elif "enum" in str(e).lower():
            detail_msg = "유효하지 않은 상태 또는 구분 값이 포함되었습니다."
            
        raise HTTPException(status_code=400, detail=detail_msg)
    
    # 다시 조회 (500 오류 방지 - 관계형 객체 로드)
    result = await db.execute(
        select(ApprovalDocument)
        .options(
            selectinload(ApprovalDocument.author),
            selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver),
            selectinload(ApprovalDocument.attachments)
        )
        .where(ApprovalDocument.id == db_doc.id)
    )
    return result.scalars().first()

@router.get("/documents/{doc_id}", response_model=ApprovalDocumentResponse)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    result = await db.execute(
        select(ApprovalDocument)
        .options(
            selectinload(ApprovalDocument.author),
            selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver),
            selectinload(ApprovalDocument.attachments)
        )
        .where(ApprovalDocument.id == doc_id, ApprovalDocument.deleted_at.is_(None))
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return doc

@router.post("/documents/{doc_id}/process")
async def process_approval(
    doc_id: int,
    action: ApprovalAction,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """승인 또는 반려 처리"""
    # 1. 문서 및 내 단계 찾기
    result = await db.execute(select(ApprovalDocument).where(ApprovalDocument.id == doc_id))
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    
    # [HOTFIX] 현재 진행되어야 할 실제 결재 단계(Sequence) 찾기
    pending_steps_res = await db.execute(
        select(ApprovalStep)
        .where(ApprovalStep.document_id == doc_id, ApprovalStep.status == "PENDING")
        .order_by(ApprovalStep.sequence.asc())
    )
    all_pending = pending_steps_res.scalars().all()
    if not all_pending:
        raise HTTPException(status_code=400, detail="이미 결재가 완료된 문서입니다.")
    
    true_current_seq = all_pending[0].sequence
    
    # 문서의 current_sequence가 어긋나 있다면 동기화 (기존 데이터 복구용)
    if doc.current_sequence != true_current_seq:
        print(f"[APPROVAL_FIX] Syncing Doc {doc.id} sequence from {doc.current_sequence} to {true_current_seq}")
        doc.current_sequence = true_current_seq

    # 현재 내 순서의 단계인지 확인
    my_step = next((s for s in all_pending if s.approver_id == current_user.id and s.sequence == true_current_seq), None)
    
    if not my_step:
        raise HTTPException(status_code=403, detail="결재 권한이 없거나 현재 결재 순서가 아닙니다.")

    # 2. 상태 업데이트
    my_step.status = action.status # APPROVED or REJECTED
    my_step.comment = action.comment
    my_step.processed_at = datetime.now()
    
    if action.status == "REJECTED":
        doc.status = ApprovalStatus.REJECTED
        doc.rejection_reason = action.comment
        # [Rollback] 근태 기록 및 소모품 대기열 파기
        await db.execute(delete(EmployeeTimeRecord).where(EmployeeTimeRecord.approval_id == doc.id))
        await db.execute(delete(ConsumablePurchaseWait).where(ConsumablePurchaseWait.approval_id == doc.id))
        
        # 연차 동기화 (차감된 것 복구)
        if doc.doc_type in ["VACATION", "EARLY_LEAVE", "LEAVE_REQUEST"]:
            # year can be extracted from doc.created_at or start_date
            content = doc.content or {}
            target_year = doc.created_at.year
            if content.get("start_date"):
                try: target_year = int(content.get("start_date")[:4])
                except: pass
            elif content.get("date"):
                try: target_year = int(content.get("date")[:4])
                except: pass
            
            await db.flush() # Ensure doc status is REJECTED in session
            await sync_annual_leave_usage(db, doc.author_id, target_year)
        
        # 구매발주/외주발주 상태 동기화 (반려 시 롤백)
        if doc.doc_type == "PURCHASE_ORDER" or doc.reference_id:
            await sync_reference_status(db, doc)
    else:
        # 다음 단계가 있는지 확인
        next_step_res = await db.execute(
            select(ApprovalStep)
            .where(ApprovalStep.document_id == doc_id, ApprovalStep.sequence == doc.current_sequence + 1)
        )
        next_step = next_step_res.scalars().first()
        
        if next_step:
            doc.current_sequence += 1
            doc.status = ApprovalStatus.IN_PROGRESS
            
            # 🚨 신규 로직: 다음 결재권자 이메일 발송
            next_step_approver_res = await db.execute(
                select(Staff).where(Staff.id == next_step.approver_id)
            )
            next_approver = next_step_approver_res.scalars().first()
            if next_approver and next_approver.email:
                background_tasks.add_task(
                    send_approval_email,
                    to_email=next_approver.email,
                    doc_title=doc.title,
                    drafter_name=doc.author.name if doc.author else "기안자",
                    reference_id=str(doc.id)
                )
        else:
            doc.status = ApprovalStatus.COMPLETED
            print(f"[DEBUG] Document {doc.id} completed via process_approval. Type: {doc.doc_type}")
            # [NEW] 회계 담당자 알림
            await notify_accounting_managers(db, doc, background_tasks)
            # 최종 승인 시 처리 (Attendance, Consumables 등)
            if doc.doc_type in ["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]:
                await create_attendance_record(db, doc)
            elif doc.doc_type in ["SUPPLIES", "CONSUMABLES_PURCHASE"]:
                print(f"[DEBUG] Triggering process_consumables for approved doc {doc.id}")
                await process_consumables(db, doc)
            
            # 구매발주/외주발주 상태 동기화 (최종 승인 시)
            if doc.doc_type == "PURCHASE_ORDER" or doc.reference_id:
                await sync_reference_status(db, doc)
            
    await db.commit()
    return {"message": "처리되었습니다.", "status": doc.status}

def calculate_ot_details(record_date, start_time_str, end_time_str):
    """
    Calculate hours breakdown for Extension, Night, Holiday, Holiday-Night.
    Night window: 22:00 ~ 06:00
    """
    
    def parse_time_flexible(t_str):
        if not t_str: return None
        for fmt in ("%H:%M", "%H:%M:%S", "%H:%M:%S.%f"):
            try:
                return datetime.strptime(t_str, fmt).time()
            except ValueError:
                continue
        return None

    try:
        # Standardizing times
        start_t = parse_time_flexible(start_time_str)
        end_t = parse_time_flexible(end_time_str)
        
        if not start_t or not end_t: return None
        
        start_dt = datetime.combine(record_date, start_t)
        end_dt = datetime.combine(record_date, end_t)
        if end_dt <= start_dt:
            end_dt += timedelta(days=1)
            
        is_holiday = record_date.weekday() >= 5 # Simplified: Sat=5, Sun=6
        
        total_hours = (end_dt - start_dt).total_seconds() / 3600.0
        details = {
            "hours": total_hours,
            "extension_hours": 0.0,
            "night_hours": 0.0,
            "holiday_hours": 0.0,
            "holiday_night_hours": 0.0
        }
        
        # Iterate in 15-min intervals for simplicity and accuracy
        curr = start_dt
        step = timedelta(minutes=15)
        while curr < end_dt:
            # Check if current time is holiday or not
            # If it crossed midnight, the 'holiday' status might change
            step_is_holiday = curr.date().weekday() >= 5
            
            # Check if night (22:00 - 06:00)
            h = curr.hour
            is_night = (h >= 22 or h < 6)
            
            val = 0.25 # 15 mins
            if step_is_holiday:
                if is_night: details["holiday_night_hours"] += val
                else: details["holiday_hours"] += val
            else:
                if is_night: details["night_hours"] += val
                else: details["extension_hours"] += val
            
            curr += step
            
        return details
    except Exception as e:
        print(f"OT Calculation Error: {e}")
        return None

async def process_consumables(db: AsyncSession, doc: ApprovalDocument):
    """결재 완료된 소모품 신청서를 기반으로 품목 마스터 자동 등록 및 발주 대기 생성"""
    print(f"[DEBUG] process_consumables called for Doc ID: {doc.id}, Type: {doc.doc_type}")
    try:
        
        content = doc.content or {}
        items = content.get("items")
        print(f"[DEBUG] Items in doc {doc.id}: {items}")
        
        # 만약 과거 데이터라서 문자열(Textarea)로 들어왔다면 무시 (하위 호환)
        if not items or not isinstance(items, list):
            print(f"[DEBUG] No items list found in doc {doc.id}. Skipping.")
            return
            
        for item in items:
            # Handle potential non-dict items (legacy or malformed data)
            if not isinstance(item, dict):
                print(f"[DEBUG] Skipping non-dict item in consumables: {item}")
                continue
                
            name = item.get("product_name")
            qty_val = item.get("quantity", 1)
            try:
                qty = int(qty_val) if qty_val else 1
            except (ValueError, TypeError):
                qty = 1
            remarks = item.get("remarks", "")
            
            if not name: 
                print("[DEBUG] Skipping item with no product_name")
                continue
            
            print(f"[DEBUG] Adding to ConsumablePurchaseWait (No Master Create): {name}, Qty: {qty}")
            
            # 대기열 등록 (품목 마스터 없이 기안 텍스트 그대로 저장)
            wait_record = ConsumablePurchaseWait(
                approval_id=doc.id,
                product_id=None,
                requested_item_name=name,
                quantity=qty,
                remarks=remarks,
                requester_name=doc.author.name if doc.author else None,
                department=doc.author.department if doc.author else None,
                status="PENDING" # Explicitly set
            )
            db.add(wait_record)
            
        await db.flush()
        print(f"[DEBUG] process_consumables completed for Doc ID: {doc.id}")
    except Exception as e:
        print(f"Error processing consumables: {e}")

async def create_attendance_record(db: AsyncSession, doc: ApprovalDocument):
    """결재 완료된 문서 기반 근태 기록 자동 생성 및 연차 차감"""
    try:
        if doc.doc_type not in ["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]:
            return

        content = doc.content or {}
        
        if doc.doc_type in ["VACATION", "LEAVE_REQUEST"]:
            start_date_str = content.get("start_date")
            end_date_str = content.get("end_date")
            if not start_date_str: return
            
            # 🚨 수정: 시간/타임존 찌꺼기가 묻어와도 무조건 YYYY-MM-DD만 파싱하도록 방어
            start_date = date.fromisoformat(str(start_date_str).split('T')[0])
            end_date = date.fromisoformat(str(end_date_str).split('T')[0]) if end_date_str else start_date
            v_type = content.get("vacation_type", "연차")
            
            # 연차 레코드 조회/생성
            leave_record = await get_or_create_annual_leave(db, doc.author_id, start_date.year)
            
            # 사용 일수 계산
            if v_type in ["반차", "반차(Half-day)"]:
                applied_days = 0.5
            else:
                applied_days = float(_business_days_between(start_date, end_date))
            
            # 연차 유형별 업데이트
            if v_type in ["병가", "SICK"]:
                leave_record.sick_leave_days += applied_days
            elif v_type in ["경조사", "경조휴가", "EVENT"]:
                leave_record.event_leave_days += applied_days
            else: # 연차, 반차 등
                leave_record.used_leave_hours += applied_days * 8.0
            
            # 개별 근태 기록 생성
            curr = start_date
            while curr <= end_date:
                if curr.weekday() < 5:
                    record = EmployeeTimeRecord(
                        staff_id=doc.author_id,
                        record_date=curr,
                        category="HALF_DAY" if "반차" in v_type else ("SICK" if "병가" in v_type else ("EVENT_LEAVE" if "경조" in v_type else "ANNUAL")),
                        content=f"{v_type} ({content.get('half_day_type', '')}) - {content.get('reason', '') or content.get('vacation_reason', '')}",
                        author_id=doc.author_id,
                        status="APPROVED",
                        approval_id=doc.id
                    )
                    db.add(record)
                curr += timedelta(days=1)
                
        elif doc.doc_type == "EARLY_LEAVE":
            date_str = content.get("date")
            if not date_str: return
            # 🚨 수정: 날짜 찌꺼기 방어
            record_date = date.fromisoformat(str(date_str).split('T')[0])
            e_type = content.get("type", content.get("leave_type", "조퇴"))
            
            # 연차 레코드 조회/생성
            leave_record = await get_or_create_annual_leave(db, doc.author_id, record_date.year)
            
            # 시간 계산
            hours = 0.0
            try:
                t1_str = content.get("leave_time") or content.get("time")
                t2_str = content.get("return_time") or content.get("end_time")
                
                if t1_str:
                    def to_minutes(t_s):
                        if not t_s: return 0
                        parts = t_s.split(':')
                        h = int(parts[0])
                        m = int(parts[1]) if len(parts) > 1 else 0
                        return h * 60 + m
                    
                    m1 = to_minutes(t1_str)
                    
                    if t2_str:
                        m2 = to_minutes(t2_str)
                        delta = m2 - m1
                        if delta < 0: delta += 1440
                        hours = round(delta / 60.0, 2)
                    else:
                        comp_res = await db.execute(select(Company))
                        comp = comp_res.scalars().first()
                        work_end_str = "17:30"
                        if comp:
                            if isinstance(comp.work_end_time, str):
                                work_end_str = comp.work_end_time
                            elif comp.work_end_time:
                                work_end_str = comp.work_end_time.strftime("%H:%M")
                        
                        m_end = to_minutes(work_end_str)
                        delta = m_end - m1
                        if delta > 0:
                            hours = round(delta / 60.0, 2)
            except Exception as e:
                print(f"Error calculating duration: {e}")
            
            # 🚨 수정: 프론트에서 넘어온 hours가 없거나 NaN일 경우를 철저히 대비
            raw_hours = content.get("hours", 0)
            try:
                hours = float(raw_hours) if raw_hours else 0.0
            except ValueError:
                hours = 0.0
                
            leave_record.used_leave_hours += hours
            
            from app.models.basics import EmployeeTimeRecord
            record = EmployeeTimeRecord(
                staff_id=doc.author_id,
                record_date=record_date,
                category="EARLY_LEAVE" if "조퇴" in e_type else "OUTING",
                content=f"{e_type}: {t1_str} ~ {t2_str or ''} - {content.get('reason', '') or content.get('leave_reason', '')}",
                author_id=doc.author_id,
                status="APPROVED",
                hours=hours,
                approval_id=doc.id
            )
            db.add(record)
            
        elif doc.doc_type == "OVERTIME":
            date_str = content.get("date")
            if not date_str: return
            record_date = date.fromisoformat(str(date_str).split('T')[0])
            
            start_t = content.get("start_time")
            end_t = content.get("end_time")
            ot_details = calculate_ot_details(record_date, start_t, end_t) if start_t and end_t else None
            
            record = EmployeeTimeRecord(
                staff_id=doc.author_id,
                record_date=record_date,
                category="OVERTIME",
                content=f"특근: {start_t} ~ {end_t} - {content.get('reason', '')}",
                author_id=doc.author_id,
                status="APPROVED",
                approval_id=doc.id
            )
            
            if ot_details:
                record.hours = ot_details["hours"]
                record.extension_hours = ot_details["extension_hours"]
                record.night_hours = ot_details["night_hours"]
                record.holiday_hours = ot_details["holiday_hours"]
                record.holiday_night_hours = ot_details["holiday_night_hours"]
                
            db.add(record)
            
        await db.flush()
    except Exception as e:
        # 에러 로그를 명확히 남겨서 추적 가능하게 함
        import logging
        logging.error(f"[ATTENDANCE ERROR] Failed to create attendance for Doc {doc.id}: {str(e)}")

async def is_editable(doc: ApprovalDocument, user: Staff = None) -> bool:
    """문서가 수정/삭제 가능한 상태인지 확인 (PENDING, REJECTED 또는 자동 승인만 된 IN_PROGRESS)"""
    if not doc:
        return False
        
    if user and user.user_type == "ADMIN":
        return True
        
    # [보안 강화] '진행 중'이거나 '완료'된 문서는 수정 불가 (사용자 요구사항 반영)
    if doc.status in [ApprovalStatus.IN_PROGRESS, ApprovalStatus.COMPLETED]:
        # '진행 중'인 경우 중, 지금까지 완료된 모든 단계가 '자동 승인'인 경우만 예외적으로 허용 (기안 직후 상태)
        # 하지만 요구사항에 따라 더 보수적으로 'PENDING'과 'REJECTED'(재기안용)만 허용하는 것이 안전함.
        for step in doc.steps:
            if step.status == "APPROVED" and "자동 승인" not in (step.comment or ""):
                return False
                
    # [사용자 요구사항] 결제가 완료되기 전에는 수정이 가능하도록 변경
    if doc.status in [ApprovalStatus.PENDING, ApprovalStatus.REJECTED, ApprovalStatus.IN_PROGRESS]:
        return True
    
    return False

async def notify_accounting_managers(db: AsyncSession, doc: ApprovalDocument, background_tasks: BackgroundTasks):
    try:
        # 회계 담당자(is_accounting=True)이면서 활성 상태인 사원 조회
        from app.api.deps import ensure_staff_columns
        managers = []
        for _ in range(5):
            try:
                stmt = select(Staff).where(Staff.is_accounting == True, Staff.is_active == True)
                res = await db.execute(stmt)
                managers = res.scalars().all()
                break
            except Exception as e:
                if not await ensure_staff_columns(db, e):
                    logger.error(f"[NOTIFY] Database error retrieving accounting managers: {e}")
                    return # Exit if we can't fix it
        
        if not managers:
            logger.info(f"[NOTIFY] 회계 담당자가 지정되지 않아 알림을 건너뜁니다. (Doc ID: {doc.id})")
            return

        # 기안자 정보 확인
        drafter_name = "기안자"
        if doc.author:
            drafter_name = doc.author.name
        else:
             author_res = await db.get(Staff, doc.author_id)
             if author_res:
                 drafter_name = author_res.name

        for manager in managers:
            if manager.email:
                background_tasks.add_task(
                    send_accounting_completion_email,
                    to_email=manager.email,
                    doc_title=doc.title,
                    drafter_name=drafter_name,
                    doc_id=doc.id
                )
                logger.info(f"[NOTIFY] 회계 담당자({manager.name})에게 완료 알림 메일 등록 (Doc ID: {doc.id})")
    except Exception as e:
        logger.error(f"[NOTIFY ERROR] 회계 담당자 알림 실패: {str(e)}")

async def sync_attachments_to_reference(db: AsyncSession, doc: ApprovalDocument):
    """결재 문서의 첨부파일을 연동된 원본 객체(PO/OO)의 attachment_file 필드에 동기화 (1:N 대응)"""
    if not doc.reference_id or not doc.reference_type:
        return

    # 최신 첨부파일 리스트 준비 (JSON 배열 형태)
    attachments_json = []
    if doc.attachments:
        attachments_json = [{"name": a.filename, "url": a.url} for a in doc.attachments]
    
    try:
        if doc.reference_type == "PURCHASE":
            stmt = select(PurchaseOrder).where(PurchaseOrder.id == doc.reference_id)
            res = await db.execute(stmt)
            order = res.scalars().first()
            if order:
                import json
                # 기존 파일과 합치거나 덮어쓰기 (결재 시점의 파일이 최종본이 되도록 덮어쓰기 권장)
                order.attachment_file = json.dumps(attachments_json, ensure_ascii=False)
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(order, "attachment_file")
                print(f"[DEBUG] Synced {len(attachments_json)} attachments to PurchaseOrder {order.id}")
        
        elif doc.reference_type == "OUTSOURCING":
            stmt = select(OutsourcingOrder).where(OutsourcingOrder.id == doc.reference_id)
            res = await db.execute(stmt)
            order = res.scalars().first()
            if order:
                import json
                order.attachment_file = json.dumps(attachments_json, ensure_ascii=False)
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(order, "attachment_file")
                print(f"[DEBUG] Synced {len(attachments_json)} attachments to OutsourcingOrder {order.id}")

        await db.flush()
    except Exception as e:
        print(f"[ERROR] sync_attachments_to_reference failed: {e}")

@router.put("/documents/{doc_id}", response_model=ApprovalDocumentResponse)
async def update_document(
    doc_id: int,
    doc_in: ApprovalDocumentCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    try:
        logger.info(f"[APPROVAL] Updating document {doc_id} by user {current_user.id}")
        
        result = await db.execute(select(ApprovalDocument).where(ApprovalDocument.id == doc_id))
        doc = result.scalars().first()
        if not doc:
            raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
        
        if doc.author_id != current_user.id and current_user.user_type != "ADMIN":
            raise HTTPException(status_code=403, detail="수정 권한이 없습니다.")
    
        # 관계형 데이터 로드 (is_editable에서 필요)
        result = await db.execute(
            select(ApprovalDocument)
            .options(selectinload(ApprovalDocument.steps))
            .where(ApprovalDocument.id == doc_id)
        )
        doc = result.scalars().first()
        
        if not await is_editable(doc, current_user):
            raise HTTPException(status_code=400, detail="결재가 이미 진행되어 수정할 수 없습니다.")
    
        doc.title = doc_in.title
        doc.content = doc_in.content
        doc.attachment_file = doc_in.attachment_file
        
        # Update attachments
        if doc_in.attachments_to_add is not None:
            # For simplicity, we replace attachments if provided
            await db.execute(delete(ApprovalAttachment).where(ApprovalAttachment.document_id == doc_id))
            for att in doc_in.attachments_to_add:
                db_att = ApprovalAttachment(
                    document_id=doc_id,
                    filename=att.filename,
                    url=att.url
                )
                db.add(db_att)
        
        # [NEW] 원본 데이터(PO/OO)와 첨부파일 동기화
        await db.flush()
        await db.refresh(doc, ["attachments"])
        await sync_attachments_to_reference(db, doc)
    
        # 수정 시 상태가 반려였다면 대기로 변경하고 결재 단계 초기화 가능
        # ADMIN이 수정하는 경우 상태를 유지하거나 필요시 변경함
        was_completed = doc.status == ApprovalStatus.COMPLETED
    
        # [FIX] 반려된 상태에서 수정하는 경우 무조건 상태 초기화 (관리자도 재청구 가능해야 함)
        is_rejected = doc.status == ApprovalStatus.REJECTED
        should_reset_status = (current_user.user_type != "ADMIN") or is_rejected
    
        if should_reset_status:
            doc.status = ApprovalStatus.PENDING
            doc.rejection_reason = None
            
            # Delete existing steps before regenerating (Avoid duplicates on partial update)
            await db.execute(delete(ApprovalStep).where(ApprovalStep.document_id == doc_id))
            
            lines_to_process = []
            if doc_in.custom_approvers:
                for ca in doc_in.custom_approvers:
                    s_res = await db.execute(select(Staff).where(Staff.id == ca.staff_id))
                    target_s = s_res.scalars().first()
                    if target_s:
                        lines_to_process.append({"approver_id": ca.staff_id, "sequence": ca.sequence, "role": target_s.role})
            else:
                doc_type_clean = doc.doc_type.strip().upper()
                lines_res = await db.execute(
                    select(ApprovalLine)
                    .options(selectinload(ApprovalLine.approver))
                    .where(func.upper(ApprovalLine.doc_type) == doc_type_clean)
                    .order_by(ApprovalLine.sequence)
                )
                lines = lines_res.scalars().all()
                for line in lines:
                    if line.approver:
                        lines_to_process.append({"approver_id": line.approver_id, "sequence": line.sequence, "role": line.approver.role})
            
            author_rank = get_staff_rank(current_user.role)
            # [FIX] 하드코딩된 1 대신 결재선의 최소 순번부터 시작하도록 수정 (순번 어긋남 방지)
            current_seq = min([l["sequence"] for l in lines_to_process]) if lines_to_process else 1
            all_auto_approved = True
            
            if lines_to_process:
                for lp in lines_to_process:
                    approver_role = lp.get("role", "")
                    approver_rank = get_staff_rank(approver_role)
                    is_auto = (lp["approver_id"] == current_user.id) or (author_rank >= approver_rank)
                    
                    step = ApprovalStep(
                        document_id=doc.id,
                        approver_id=lp["approver_id"],
                        sequence=lp["sequence"],
                        status="APPROVED" if is_auto else "PENDING",
                        processed_at=datetime.now() if is_auto else None,
                        comment="기안자 자동 승인" if (lp["approver_id"] == current_user.id) else ("기안자 직급에 따른 자동 승인" if is_auto else None)
                    )
                    db.add(step)
                    
                    if is_auto:
                        if current_seq == lp["sequence"]:
                            current_seq += 1
                    else:
                        all_auto_approved = False
            else:
                all_auto_approved = False

            doc.current_sequence = current_seq
            if all_auto_approved:
                doc.status = ApprovalStatus.COMPLETED
                print(f"[DEBUG] Document {doc.id} auto-completed after update. Type: {doc.doc_type}")
                # [NEW] 회계 담당자 알림
                await notify_accounting_managers(db, doc, background_tasks)
                if doc.doc_type in ["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]:
                    await create_attendance_record(db, doc)
                elif doc.doc_type in ["SUPPLIES", "CONSUMABLES_PURCHASE"]:
                    print(f"[DEBUG] Triggering process_consumables for updated/auto-approved doc {doc.id}")
                    await process_consumables(db, doc)
            elif current_seq > 1:
                doc.status = ApprovalStatus.IN_PROGRESS
            else:
                doc.status = ApprovalStatus.PENDING
        else:
            # ADMIN: status is preserved, but sync records if completed
            if was_completed:
                if doc.doc_type in ["VACATION", "EARLY_LEAVE", "OVERTIME", "LEAVE_REQUEST"]:
                    await db.execute(delete(EmployeeTimeRecord).where(EmployeeTimeRecord.approval_id == doc.id))
                    await create_attendance_record(db, doc)
    
        await db.commit()

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        error_msg = traceback.format_exc()
        logger.error(f"[APPROVAL_ERROR] Failed to update document: {error_msg}")
        await db.rollback()
        detail_msg = f"결재 문서 수정 중 서버 오류 발생: {str(e)}"
        if "id" in str(e).lower() and "null" in str(e).lower():
            detail_msg = "결재선 데이터(결재자 ID)가 올바르지 않거나 누락되었습니다."
        raise HTTPException(status_code=400, detail=detail_msg)
    
    # 다시 조회 (관계형 객체 로드)
    result = await db.execute(
        select(ApprovalDocument)
        .options(
            selectinload(ApprovalDocument.author),
            selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver),
            selectinload(ApprovalDocument.attachments)
        )
        .where(ApprovalDocument.id == doc_id)
    )
    return result.scalars().first()

@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """문서 삭제 (작성자이며 대기/반려 상태일 때만 가능)"""
    result = await db.execute(select(ApprovalDocument).where(ApprovalDocument.id == doc_id))
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    
    if doc.author_id != current_user.id and current_user.user_type != "ADMIN":
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
    
    # 관계형 데이터 로드 (is_editable에서 필요)
    result = await db.execute(
        select(ApprovalDocument)
        .options(selectinload(ApprovalDocument.steps))
        .where(ApprovalDocument.id == doc_id)
    )
    doc = result.scalars().first()
    
    if not await is_editable(doc, current_user):
        raise HTTPException(status_code=400, detail="결재가 이미 진행되어 삭제할 수 없습니다.")
    
    # 소모품 신청 기안(SUPPLIES)인 경우의 비즈니스 로직 처리
    if doc.doc_type == "SUPPLIES":
        from app.models.purchasing import ConsumablePurchaseWait, PurchaseOrder, PurchaseOrderItem, PurchaseStatus
        
        # 1. 연결된 소모품 발주 대기 데이터 조회
        stmt = select(ConsumablePurchaseWait).where(ConsumablePurchaseWait.approval_id == doc_id)
        res = await db.execute(stmt)
        waits = res.scalars().all()
        wait_ids = [w.id for w in waits]
        
        # 2. 발주 진행 여부 확인 (PENDING이 아닌 항목이 있는지)
        has_active_order = any(w.status != "PENDING" for w in waits)
        
        if not has_active_order:
            # 2-1. 전부 대기 상태인 경우: 자식 데이터부터 강제 연쇄 삭제 (고아 데이터 방지)
            if waits:
                await db.execute(delete(ConsumablePurchaseWait).where(ConsumablePurchaseWait.approval_id == doc_id))
            # Bug 3 Fix: Use Soft Delete
            doc.deleted_at = datetime.now()
            
            # Trigger leave sync if relevant
            if doc.doc_type in ["VACATION", "EARLY_LEAVE"]:
                await sync_annual_leave_usage(db, doc.author_id, doc.created_at.year)
                
            await db.commit()
            return {"message": "기안이 삭제되었으며, 연관된 발주 대기 항목도 모두 정리되었습니다."}
        else:
            # 2-2. 이미 발주가 진행된 경우: 삭제 대신 '취소(CANCELLED)' 상태로 전환 (비즈니스 우회 로직)
            doc.status = ApprovalStatus.CANCELLED
            
            # 연결된 발주 대기 항목들도 모두 취소 처리
            for w in waits:
                w.status = "CANCELLED"
            
            # 발주서(PurchaseOrder)가 생성되어 있다면 해당 발주서도 취소 검토
            if wait_ids:
                po_stmt = select(PurchaseOrder).join(PurchaseOrderItem).where(
                    PurchaseOrderItem.consumable_purchase_wait_id.in_(wait_ids)
                )
                po_res = await db.execute(po_stmt)
                linked_pos = po_res.scalars().all()
                for po in linked_pos:
                    # 입고가 이미 완료된 건이 아니라면 취소 상태로 변경
                    if po.status not in [PurchaseStatus.COMPLETED, PurchaseStatus.PARTIAL]:
                        po.status = PurchaseStatus.CANCELED
            
            await db.commit()
            return {"message": "이미 발주가 진행된 항목이 있어 삭제 대신 기안과 발주 상태를 '취소'로 변경했습니다."}

    # 일반 문서(휴가 등)의 경우 Soft Delete 처리 및 연계 기록 삭제
    doc.deleted_at = datetime.now()
    
    # [Fix] 전자결재 문서와 연계된 Attendance 기록 물리적 삭제 (찌꺼기 제거)
    # EmployeeTimeRecord is imported at top of file from app.models.basics
    if doc.doc_type in ["VACATION", "EARLY_LEAVE", "OVERTIME"]:
        await db.execute(delete(EmployeeTimeRecord).where(EmployeeTimeRecord.approval_id == doc_id))
        print(f"Deleted related EmployeeTimeRecord entries for document {doc_id}")

    await db.commit()
    
    # [Fix] 잔여 연차 동기화 (commit 직후 호출)
    if doc.doc_type in ["VACATION", "EARLY_LEAVE"]:
        await sync_annual_leave_usage(db, doc.author_id, doc.created_at.year)
        
    return {"message": "삭제되었습니다."}
async def sync_reference_status(db: AsyncSession, doc: ApprovalDocument):
    """
    결재 문서의 상태 변화를 연동된 기존 업무 DB(구매/외주/소모품)에 동기화.
    - COMPLETED: PENDING -> ORDERED
    - REJECTED: ORDERED -> PENDING (또는 반려 상태 유지)
    """
    if not doc.reference_id or not doc.reference_type:
        return
    
    print(f"[DEBUG] sync_reference_status called for Doc {doc.id}, Ref: {doc.reference_type} {doc.reference_id}, Status: {doc.status}")
    
    try:
        if doc.reference_type == "PURCHASE":
            stmt = select(PurchaseOrder).where(PurchaseOrder.id == doc.reference_id)
            res = await db.execute(stmt)
            order = res.scalars().first()
            if order:
                if doc.status == ApprovalStatus.COMPLETED:
                    order.status = PurchaseStatus.ORDERED
                    print(f"[DEBUG] PurchaseOrder {order.id} status updated to ORDERED")
                elif doc.status == ApprovalStatus.REJECTED:
                    order.status = PurchaseStatus.PENDING
                    print(f"[DEBUG] PurchaseOrder {order.id} status rolled back to PENDING (Rejected)")
        
        elif doc.reference_type == "OUTSOURCING":
            stmt = select(OutsourcingOrder).where(OutsourcingOrder.id == doc.reference_id)
            res = await db.execute(stmt)
            order = res.scalars().first()
            if order:
                if doc.status == ApprovalStatus.COMPLETED:
                    order.status = OutsourcingStatus.ORDERED
                    print(f"[DEBUG] OutsourcingOrder {order.id} status updated to ORDERED")
                elif doc.status == ApprovalStatus.REJECTED:
                    order.status = OutsourcingStatus.PENDING
                    print(f"[DEBUG] OutsourcingOrder {order.id} status rolled back to PENDING (Rejected)")

        await db.flush()
    except Exception as e:
        print(f"Error in sync_reference_status: {e}")
