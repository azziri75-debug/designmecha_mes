from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, update, delete
from typing import List, Optional
from datetime import datetime

from app.api import deps
from app.models.approval import ApprovalDocument, ApprovalLine, ApprovalStep, ApprovalStatus
from app.models.basics import Staff
from app.schemas.approval import (
    ApprovalDocumentCreate, ApprovalDocumentResponse,
    ApprovalLineCreate, ApprovalLineResponse,
    ApprovalAction, ApprovalStats
)

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
    return ROLE_RANKING.get(role, 0)

@router.get("/stats", response_model=ApprovalStats)
async def get_approval_stats(
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """대시보드 통계 조회"""
    # 내가 기안한 문서들
    pending = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.author_id == current_user.id,
        ApprovalDocument.status == ApprovalStatus.PENDING
    ))
    completed = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.author_id == current_user.id,
        ApprovalDocument.status == ApprovalStatus.COMPLETED
    ))
    rejected = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.author_id == current_user.id,
        ApprovalDocument.status == ApprovalStatus.REJECTED
    ))
    
    # 내가 결재해야 할 대기 건수
    waiting = await db.execute(select(func.count(ApprovalDocument.id)).join(ApprovalStep).where(
        ApprovalStep.approver_id == current_user.id,
        ApprovalStep.status == "PENDING",
        ApprovalDocument.current_sequence == ApprovalStep.sequence,
        ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS])
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
    """문서 종류별 결재선 템플릿 조회"""
    result = await db.execute(
        select(ApprovalLine)
        .options(selectinload(ApprovalLine.approver))
        .where(ApprovalLine.doc_type == doc_type)
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
    view_mode: str = "ALL", # ALL, MY_DRAFTS, MY_APPROVALS
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """결재 문서 목록 조회"""
    query = select(ApprovalDocument).options(
        selectinload(ApprovalDocument.author),
        selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver)
    ).order_by(ApprovalDocument.created_at.desc())
    
    if view_mode == "MY_DRAFTS":
        query = query.where(ApprovalDocument.author_id == current_user.id)
    elif view_mode == "MY_APPROVALS":
        query = query.join(ApprovalStep).where(ApprovalStep.approver_id == current_user.id)

    result = await db.execute(query)
    return result.scalars().all()

@router.post("/documents", response_model=ApprovalDocumentResponse)
async def create_document(
    doc_in: ApprovalDocumentCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """새 결재 문서 생성 (기안)"""
    # 1. 문서 저장
    db_doc = ApprovalDocument(
        author_id=current_user.id,
        doc_type=doc_in.doc_type,
        title=doc_in.title,
        content=doc_in.content,
        attachment_file=doc_in.attachment_file,
        status=ApprovalStatus.PENDING,
        current_sequence=1
    )
    db.add(db_doc)
    await db.flush()
    
    # 2. 결재선 템플릿에서 결재 단계(Steps) 생성
    lines_res = await db.execute(
        select(ApprovalLine)
        .options(selectinload(ApprovalLine.approver))
        .where(ApprovalLine.doc_type == doc_in.doc_type)
        .order_by(ApprovalLine.sequence)
    )
    lines = lines_res.scalars().all()
    
    if not lines:
        raise HTTPException(status_code=400, detail="결재선이 설정되지 않은 문서 종류입니다.")
    
    author_rank = get_staff_rank(current_user.role)
    current_seq = 1
    all_auto_approved = True
    
    for line in lines:
        approver_rank = get_staff_rank(line.approver.role)
        # 기안자 직급이 결재자와 동등하거나 높으면 자동 승인
        is_auto = author_rank >= approver_rank
        
        step = ApprovalStep(
            document_id=db_doc.id,
            approver_id=line.approver_id,
            sequence=line.sequence,
            status="APPROVED" if is_auto else "PENDING",
            processed_at=datetime.now() if is_auto else None,
            comment="기안자 직급에 따른 자동 승인" if is_auto else None
        )
        db.add(step)
        
        if is_auto:
            if current_seq == line.sequence:
                current_seq += 1
        else:
            all_auto_approved = False

    db_doc.current_sequence = current_seq
    if all_auto_approved:
        db_doc.status = ApprovalStatus.COMPLETED
    elif current_seq > 1:
        db_doc.status = ApprovalStatus.IN_PROGRESS

    await db.commit()
    
    # 다시 조회 (500 오류 방지 - 관계형 객체 로드)
    result = await db.execute(
        select(ApprovalDocument)
        .options(
            selectinload(ApprovalDocument.author),
            selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver)
        )
        .where(ApprovalDocument.id == db_doc.id)
    )
    return result.scalar_one()

@router.get("/documents/{doc_id}", response_model=ApprovalDocumentResponse)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(deps.get_db)
):
    result = await db.execute(
        select(ApprovalDocument)
        .options(
            selectinload(ApprovalDocument.author),
            selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver)
        )
        .where(ApprovalDocument.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return doc

@router.post("/documents/{doc_id}/process")
async def process_approval(
    doc_id: int,
    action: ApprovalAction,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """승인 또는 반려 처리"""
    # 1. 문서 및 내 단계 찾기
    result = await db.execute(select(ApprovalDocument).where(ApprovalDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    
    # 현재 내 순서의 단계인지 확인
    step_res = await db.execute(
        select(ApprovalStep)
        .where(
            ApprovalStep.document_id == doc_id,
            ApprovalStep.approver_id == current_user.id,
            ApprovalStep.sequence == doc.current_sequence,
            ApprovalStep.status == "PENDING"
        )
    )
    my_step = step_res.scalar_one_or_none()
    
    if not my_step:
        raise HTTPException(status_code=403, detail="결재 권한이 없거나 현재 결재 순서가 아닙니다.")

    # 2. 상태 업데이트
    my_step.status = action.status # APPROVED or REJECTED
    my_step.comment = action.comment
    my_step.processed_at = datetime.now()
    
    if action.status == "REJECTED":
        doc.status = ApprovalStatus.REJECTED
        doc.rejection_reason = action.comment
    else:
        # 다음 단계가 있는지 확인
        next_step_res = await db.execute(
            select(ApprovalStep)
            .where(ApprovalStep.document_id == doc_id, ApprovalStep.sequence == doc.current_sequence + 1)
        )
        next_step = next_step_res.scalar_one_or_none()
        
        if next_step:
            doc.current_sequence += 1
            doc.status = ApprovalStatus.IN_PROGRESS
        else:
            doc.status = ApprovalStatus.COMPLETED
            
    await db.commit()
    return {"message": "처리되었습니다.", "status": doc.status}

@router.put("/documents/{doc_id}", response_model=ApprovalDocumentResponse)
async def update_document(
    doc_id: int,
    doc_in: ApprovalDocumentCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """문서 수정 (작성자이며 대기/반려 상태일 때만 가능)"""
    result = await db.execute(select(ApprovalDocument).where(ApprovalDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    
    if doc.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다.")
    
    if doc.status not in [ApprovalStatus.PENDING, ApprovalStatus.REJECTED]:
        raise HTTPException(status_code=400, detail="결재가 진행 중이거나 완료된 문서는 수정할 수 없습니다.")
    
    doc.title = doc_in.title
    doc.content = doc_in.content
    doc.attachment_file = doc_in.attachment_file
    
    # 수정 시 상태가 반려였다면 대기로 변경하고 결재 단계 초기화 가능
    # 여기서는 상태만 대기로 변경하고 다시 처음부터 결재받도록 함
    doc.status = ApprovalStatus.PENDING
    doc.current_sequence = 1
    doc.rejection_reason = None
    
    # 기존 단계들 삭제 후 다시 생성 (결재선 변경 대응)
    await db.execute(delete(ApprovalStep).where(ApprovalStep.document_id == doc_id))
    
    lines_res = await db.execute(
        select(ApprovalLine)
        .options(selectinload(ApprovalLine.approver))
        .where(ApprovalLine.doc_type == doc.doc_type)
        .order_by(ApprovalLine.sequence)
    )
    lines = lines_res.scalars().all()
    
    author_rank = get_staff_rank(current_user.role)
    current_seq = 1
    all_auto_approved = True
    
    for line in lines:
        approver_rank = get_staff_rank(line.approver.role)
        is_auto = author_rank >= approver_rank
        
        step = ApprovalStep(
            document_id=doc.id,
            approver_id=line.approver_id,
            sequence=line.sequence,
            status="APPROVED" if is_auto else "PENDING",
            processed_at=datetime.now() if is_auto else None,
            comment="기안자 직급에 따른 자동 승인" if is_auto else None
        )
        db.add(step)
        
        if is_auto:
            if current_seq == line.sequence:
                current_seq += 1
        else:
            all_auto_approved = False

    doc.current_sequence = current_seq
    if all_auto_approved:
        doc.status = ApprovalStatus.COMPLETED
    elif current_seq > 1:
        doc.status = ApprovalStatus.IN_PROGRESS
    else:
        doc.status = ApprovalStatus.PENDING

    await db.commit()
    
    # 다시 조회 (관계형 객체 로드)
    result = await db.execute(
        select(ApprovalDocument)
        .options(
            selectinload(ApprovalDocument.author),
            selectinload(ApprovalDocument.steps).selectinload(ApprovalStep.approver)
        )
        .where(ApprovalDocument.id == doc_id)
    )
    return result.scalar_one()

@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """문서 삭제 (작성자이며 대기/반려 상태일 때만 가능)"""
    result = await db.execute(select(ApprovalDocument).where(ApprovalDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    
    if doc.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
    
    if doc.status not in [ApprovalStatus.PENDING, ApprovalStatus.REJECTED]:
        raise HTTPException(status_code=400, detail="결재가 진행 중이거나 완료된 문서는 삭제할 수 없습니다.")
    
    await db.delete(doc) # Cascade delete will handle steps
    await db.commit()
    return {"message": "삭제되었습니다."}
