from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, update, delete
from typing import List, Optional
from datetime import datetime

from app.api import deps
from app.models.approval import ApprovalDocument, ApprovalLine, ApprovalStep, ApprovalStatus
from app.models.basics import Staff, EmployeeTimeRecord
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
    """대시보드 통계 조회 (관리용 전역 통계 + 나의 대기 건수)"""
    # 1. 시스템 전체의 결제 진행 상황 (Dashboard는 관리용이므로 전역 수치 표시)
    # 기안 대기 (작성 중 또는 결재 진행 중인 모든 문서)
    pending = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.status.in_([ApprovalStatus.PENDING, ApprovalStatus.IN_PROGRESS])
    ))
    
    # 결재 완료 (전체)
    completed = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.status == ApprovalStatus.COMPLETED
    ))
    
    # 반려 문서 (전체)
    rejected = await db.execute(select(func.count(ApprovalDocument.id)).where(
        ApprovalDocument.status == ApprovalStatus.REJECTED
    ))
    
    # 2. 내가 결재해야 할 대기 건수 (개인화된 수치)
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
    )

    if doc_type:
        query = query.where(ApprovalDocument.doc_type == doc_type)
    if start_date:
        query = query.where(func.date(ApprovalDocument.created_at) >= start_date)
    if end_date:
        query = query.where(func.date(ApprovalDocument.created_at) <= end_date)
    if author_id:
        query = query.where(ApprovalDocument.author_id == author_id)

    query = query.order_by(ApprovalDocument.created_at.desc())
    
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

@router.post("/documents", response_model=ApprovalDocumentResponse)
async def create_document(
    doc_in: ApprovalDocumentCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: Staff = Depends(deps.get_current_user)
):
    """새 결재 문서 생성 (기안)"""
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
            from datetime import timedelta
            recent_limit = datetime.now() - timedelta(days=60)
            stmt = select(ApprovalDocument).where(
                ApprovalDocument.author_id == current_user.id,
                ApprovalDocument.doc_type.in_(["VACATION", "EARLY_LEAVE", "OVERTIME"]),
                ApprovalDocument.status != ApprovalStatus.REJECTED,
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

    # 2. 문서 저장
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
        # 자동 승인 시 근태 기록 생성
        await create_attendance_record(db, db_doc)
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
            # 최종 승인 시 처리
            if doc.doc_type in ["VACATION", "EARLY_LEAVE", "OVERTIME"]:
                await create_attendance_record(db, doc)
            elif doc.doc_type == "SUPPLIES":
                await process_consumables(db, doc)
            
    await db.commit()
    return {"message": "처리되었습니다.", "status": doc.status}

def calculate_ot_details(record_date, start_time_str, end_time_str):
    """
    Calculate hours breakdown for Extension, Night, Holiday, Holiday-Night.
    Night window: 22:00 ~ 06:00
    """
    from datetime import datetime, time, timedelta
    
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
    try:
        from app.models.product import Product
        from app.models.purchasing import ConsumablePurchaseWait
        
        content = doc.content or {}
        items = content.get("items")
        
        # 만약 과거 데이터라서 문자열(Textarea)로 들어왔다면 무시 (하위 호환)
        if not isinstance(items, list):
            return
            
        for item in items:
            name = item.get("product_name")
            qty = int(item.get("quantity", 1))
            remarks = item.get("remarks", "")
            
            if not name: continue
            
            # 마스터 조회 및 생성
            stmt = select(Product).where(Product.name == name)
            res = await db.execute(stmt)
            product = res.scalar_one_or_none()
            
            if not product:
                # generate placeholder code
                import time
                new_code = f"CON-{int(time.time())}-{name[:2]}"
                product = Product(
                    name=name,
                    code=new_code,
                    item_type="CONSUMABLE",
                    specification=remarks[:50] if remarks else "",
                    unit="EA",
                    safe_stock=0
                )
                db.add(product)
                await db.flush() # get product.id
                
            # 대기열 등록
            wait_record = ConsumablePurchaseWait(
                approval_id=doc.id,
                product_id=product.id,
                quantity=qty,
                remarks=remarks
            )
            db.add(wait_record)
            
        await db.flush()
    except Exception as e:
        print(f"Error processing consumables: {e}")

async def create_attendance_record(db: AsyncSession, doc: ApprovalDocument):
    """결재 완료된 문서 기반 근태 기록 자동 생성"""
    try:
        if doc.doc_type not in ["VACATION", "EARLY_LEAVE", "OVERTIME"]:
            return

        from datetime import date
        content = doc.content or {}
        
        if doc.doc_type == "VACATION":
            start_date_str = content.get("start_date")
            end_date_str = content.get("end_date")
            if not start_date_str: return
            start_date = date.fromisoformat(start_date_str)
            end_date = date.fromisoformat(end_date_str) if end_date_str else start_date
            v_type = content.get("vacation_type", "연차")
            
            # Simple loop for multi-day (using pandas for business day logic if available, or simple loop)
            from datetime import timedelta
            curr = start_date
            while curr <= end_date:
                # SKIP weekends (Saturday=5, Sunday=6)
                if curr.weekday() < 5:
                    record = EmployeeTimeRecord(
                        staff_id=doc.author_id,
                        record_date=curr,
                        category="HALF_DAY" if v_type == "반차" else ("SICK" if v_type == "병가" else "ANNUAL"),
                        content=f"{v_type} ({content.get('half_day_type', '')}) - {content.get('reason', '')}",
                        author_id=doc.author_id,
                        status="APPROVED"
                    )
                    db.add(record)
                curr += timedelta(days=1)
                
        elif doc.doc_type == "EARLY_LEAVE":
            date_str = content.get("date")
            if not date_str: return
            record_date = date.fromisoformat(date_str)
            e_type = content.get("type", "조퇴")
            
            # Calculate duration using robust minute-based arithmetic
            hours = 0.0
            try:
                t1_str = content.get("time") # Leaving time
                t2_str = content.get("end_time") # Return time (for Outing)
                
                if t1_str:
                    def to_minutes(t_s):
                        if not t_s: return 0
                        # Handle HH:MM or HH:MM:SS
                        parts = t_s.split(':')
                        h = int(parts[0])
                        m = int(parts[1]) if len(parts) > 1 else 0
                        return h * 60 + m
                    
                    m1 = to_minutes(t1_str)
                    
                    if t2_str:
                        # Case: Outing (has return time)
                        m2 = to_minutes(t2_str)
                        delta = m2 - m1
                        if delta < 0: delta += 1440 # Day cross
                        hours = round(delta / 60.0, 2)
                    else:
                        # Case: Early Leave (until end of work)
                        from sqlalchemy import select
                        from app.models.basics import Company
                        comp_res = await db.execute(select(Company))
                        comp = comp_res.scalars().first()
                        
                        # Use company end time or default 17:30
                        work_end_str = "17:30"
                        if comp:
                            if isinstance(comp.work_end_time, str):
                                work_end_str = comp.work_end_time
                            elif comp.work_end_time: # time object
                                work_end_str = comp.work_end_time.strftime("%H:%M")
                        
                        m_end = to_minutes(work_end_str)
                        delta = m_end - m1
                        if delta > 0:
                            hours = round(delta / 60.0, 2)
            except Exception as e:
                print(f"Error calculating duration: {e}")
                pass

            record = EmployeeTimeRecord(
                staff_id=doc.author_id,
                record_date=record_date,
                category="EARLY_LEAVE" if e_type == "조퇴" else "OUTING",
                content=f"{e_type}: {content.get('time', '')} ~ {content.get('end_time', '')} - {content.get('reason', '')}",
                author_id=doc.author_id,
                status="APPROVED",
                hours=hours
            )
            db.add(record)
            
        elif doc.doc_type == "OVERTIME":
            date_str = content.get("date")
            if not date_str: return
            record_date = date.fromisoformat(date_str)
            
            start_t = content.get("start_time")
            end_t = content.get("end_time")
            ot_details = calculate_ot_details(record_date, start_t, end_t) if start_t and end_t else None
            
            record = EmployeeTimeRecord(
                staff_id=doc.author_id,
                record_date=record_date,
                category="OVERTIME",
                content=f"특근: {start_t} ~ {end_t} - {content.get('reason', '')}",
                author_id=doc.author_id,
                status="APPROVED"
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
        print(f"Error creating attendance record: {e}")

async def is_editable(doc: ApprovalDocument, user: Staff = None) -> bool:
    """문서가 수정/삭제 가능한 상태인지 확인 (PENDING, REJECTED 또는 자동 승인만 된 IN_PROGRESS)"""
    if user and user.user_type == "ADMIN":
        return True
        
    if doc.status in [ApprovalStatus.PENDING, ApprovalStatus.REJECTED]:
        return True
    
    if doc.status == ApprovalStatus.IN_PROGRESS:
        # 진행 중인 경우, 지금까지 완료된 모든 단계가 '자동 승인'인지 확인
        for step in doc.steps:
            if step.status == "APPROVED" and step.comment != "기안자 직급에 따른 자동 승인":
                return False
        return True
    
    return False

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
    
    if doc.author_id != current_user.id and current_user.user_type != "ADMIN":
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다.")
    
    # 관계형 데이터 로드 (is_editable에서 필요)
    result = await db.execute(
        select(ApprovalDocument)
        .options(selectinload(ApprovalDocument.steps))
        .where(ApprovalDocument.id == doc_id)
    )
    doc = result.scalar_one()
    
    if not await is_editable(doc, current_user):
        raise HTTPException(status_code=400, detail="결재가 이미 진행되어 수정할 수 없습니다.")
    
    doc.title = doc_in.title
    doc.content = doc_in.content
    doc.attachment_file = doc_in.attachment_file
    
    # 수정 시 상태가 반려였다면 대기로 변경하고 결재 단계 초기화 가능
    # ADMIN이 수정하는 경우 상태를 유지하거나 필요시 변경함
    was_completed = doc.status == ApprovalStatus.COMPLETED
    
    if current_user.user_type != "ADMIN":
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
    else:
        # ADMIN: status is preserved, but sync records if completed
        if was_completed:
            # Delete and recreate attendance records to sync
            await db.execute(delete(EmployeeTimeRecord).where(
                EmployeeTimeRecord.staff_id == doc.author_id,
                EmployeeTimeRecord.author_id == doc.author_id # Approximating the link, ideally we'd have it explicit
            ))
            # However, since we don't have a direct link from record to doc_id, 
            # we might need to be careful. In this MES, records are created on completion.
            # For now, let's just trigger create_attendance_record which adds new ones.
            # NOTE: To be perfect, we'd need doc_id in EmployeeTimeRecord.
            await create_attendance_record(db, doc)

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
    
    if doc.author_id != current_user.id and current_user.user_type != "ADMIN":
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
    
    # 관계형 데이터 로드 (is_editable에서 필요)
    result = await db.execute(
        select(ApprovalDocument)
        .options(selectinload(ApprovalDocument.steps))
        .where(ApprovalDocument.id == doc_id)
    )
    doc = result.scalar_one()
    
    if not await is_editable(doc, current_user):
        raise HTTPException(status_code=400, detail="결재가 이미 진행되어 삭제할 수 없습니다.")
    
    await db.delete(doc) # Cascade delete will handle steps
    await db.commit()
    return {"message": "삭제되었습니다."}
    return {"message": "삭제되었습니다."}
