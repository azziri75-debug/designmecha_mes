from typing import Any, List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
import pandas as pd
import io
import json
import re
from datetime import datetime

from app.api import deps
from app.models.basics import Partner, Staff, Equipment
from app.models.product import Product

router = APIRouter()

# Mapping table names to Models and Columns
TABLE_CONFIG = {
    "products": {
        "model": Product,
        "columns": ["품명", "규격", "재질", "단위", "거래처명", "비고"],
        "mapping": {
            "품명": "name",
            "규격": "specification",
            "재질": "material",
            "단위": "unit",
            "거래처명": "partner_name", # Virtual field for mapping
            "비고": "note"
        }
    },
    "partners": {
        "model": Partner,
        "columns": ["업체명", "구분 (매출처/매입처/외주처)", "사업자번호", "대표자", "주소", "전화번호", "이메일"],
        "mapping": {
            "업체명": "name",
            "구분 (매출처/매입처/외주처)": "partner_type",
            "사업자번호": "registration_number",
            "대표자": "representative",
            "주소": "address",
            "전화번호": "phone",
            "이메일": "email"
        }
    },
    "staff": {
        "model": Staff,
        "columns": ["성명", "직책", "주업무", "전화번호", "권한(ADMIN/USER)"],
        "mapping": {
            "성명": "name",
            "직책": "role",
            "주업무": "main_duty",
            "전화번호": "phone",
            "권한(ADMIN/USER)": "user_type"
        }
    },
    "equipments": {
        "model": Equipment,
        "columns": ["장비명", "장비코드", "사양", "설치위치"],
        "mapping": {
            "장비명": "name",
            "장비코드": "code",
            "사양": "spec",
            "설치위치": "location"
        }
    }
}

# --- Helper Functions ---

def normalize_name(name: str) -> str:
    if not name: return ""
    # Remove (주), 주식회사, spaces, etc.
    name = re.sub(r'\(주\)|주식회사|\s+', '', name)
    return name.lower()

async def get_partner_matches(db: AsyncSession, name: str):
    if not name: return []
    
    norm_name = normalize_name(name)
    
    # 1. Exact Name Search
    result = await db.execute(select(Partner).where(Partner.name == name))
    exact = result.scalars().all()
    if exact:
        return [{"id": p.id, "name": p.name, "match_type": "EXACT"} for p in exact]
    
    # 2. Normalized Match Search (Fuzzy)
    result = await db.execute(select(Partner))
    all_partners = result.scalars().all()
    
    matches = []
    for p in all_partners:
        if normalize_name(p.name) == norm_name:
            matches.append({"id": p.id, "name": p.name, "match_type": "SIMILAR"})
        elif norm_name in normalize_name(p.name) or normalize_name(p.name) in norm_name:
            matches.append({"id": p.id, "name": p.name, "match_type": "SIMILAR"})
            
    return matches[:5] # Limit candidates

# --- Endpoints ---

@router.get("/template/{table_name}")
async def get_template(table_name: str):
    if table_name not in TABLE_CONFIG:
        raise HTTPException(status_code=404, detail="지원하지 않는 테이블입니다.")
    
    try:
        columns = TABLE_CONFIG[table_name]["columns"]
        df = pd.DataFrame(columns=columns)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Template')
        
        data = output.getvalue()
        filename = f"template_{table_name}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        print(f"[ERROR] Template generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"양식 생성 중 오류가 발생했습니다: {str(e)}")

@router.post("/verify/products")
async def verify_products(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db)
):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"엑셀 파일을 읽는 중 오류가 발생했습니다: {str(e)}")

    rows = []
    config = TABLE_CONFIG["products"]["mapping"]
    
    for index, row in df.iterrows():
        row_data = {}
        for excel_col, model_attr in config.items():
            val = row.get(excel_col)
            row_data[model_attr] = str(val).strip() if pd.notna(val) else None
            
        partner_name = row_data.get("partner_name")
        matches = await get_partner_matches(db, partner_name)
        
        status = "NONE"
        if any(m["match_type"] == "EXACT" for m in matches):
            status = "EXACT"
        elif matches:
            status = "SIMILAR"
            
        rows.append({
            "row_index": index + 2,
            "data": row_data,
            "status": status,
            "matches": matches
        })
        
    return {"rows": rows}

class ProductConfirmItem(BaseModel):
    row_index: int
    data: Dict[str, Any]
    mapping_type: str # "EXISTING", "NEW", "NONE"
    partner_id: Optional[int] = None
    new_partner_name: Optional[str] = None

@router.post("/confirm/products")
async def confirm_products(
    items: List[ProductConfirmItem],
    db: AsyncSession = Depends(deps.get_db)
):
    try:
        # 1. Create New Partners first
        new_partner_map = {} # name -> id
        for item in items:
            if item.mapping_type == "NEW" and item.new_partner_name:
                if item.new_partner_name not in new_partner_map:
                    # Check if exists first to avoid duplicates in one batch
                    res = await db.execute(select(Partner).where(Partner.name == item.new_partner_name))
                    existing = res.scalar_one_or_none()
                    if existing:
                        new_partner_map[item.new_partner_name] = existing.id
                    else:
                        new_p = Partner(name=item.new_partner_name, partner_type=["CUSTOMER"])
                        db.add(new_p)
                        await db.flush()
                        new_partner_map[item.new_partner_name] = new_p.id
        
        # 2. Create Products
        for item in items:
            p_id = None
            if item.mapping_type == "EXISTING":
                p_id = item.partner_id
            elif item.mapping_type == "NEW":
                p_id = new_partner_map.get(item.new_partner_name)
            
            product_data = item.data.copy()
            product_data.pop("partner_name", None) # Remove virtual field
            
            product = Product(
                **product_data,
                partner_id=p_id
            )
            db.add(product)
            
        await db.commit()
        return {"message": f"총 {len(items)}개의 제품이 성공적으로 등록되었습니다."}
    except Exception as e:
        await db.rollback()
        print(f"[ERROR] Product confirmation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"최종 저장 중 오류가 발생했습니다: {str(e)}")

# Generic upload remains for other tables
@router.post("/upload/{table_name}")
async def upload_excel(
    table_name: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db)
):
    if table_name not in TABLE_CONFIG:
        raise HTTPException(status_code=404, detail="지원하지 않는 테이블입니다.")
    
    config = TABLE_CONFIG[table_name]
    model = config["model"]
    mapping = config["mapping"]
    
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"엑셀 파일을 읽는 중 오류가 발생했습니다: {str(e)}")

    errors = []
    try:
        for index, row in df.iterrows():
            row_num = index + 2
            data = {}
            try:
                for excel_col, model_attr in mapping.items():
                    val = row.get(excel_col)
                    if pd.isna(val): val = None
                    elif isinstance(val, str): val = val.strip()
                    
                    # Special parsing for Partners 구분
                    if table_name == "partners" and "구분" in excel_col:
                        if val:
                            mapping_dict = {"매출처": "CUSTOMER", "매입처": "SUPPLIER", "외주처": "SUBCONTRACTOR"}
                            val = [mapping_dict.get(v.strip(), v.strip()) for v in str(val).split(',')]
                        else:
                            val = ["CUSTOMER"]
                    
                    data[model_attr] = val
                
                db.add(model(**data))
            except Exception as e:
                errors.append(f"{row_num}행: {str(e)}")
                continue

        if errors:
            await db.rollback()
            return JSONResponse(status_code=400, content={"message": "오류로 인해 취소됨", "errors": errors})
        
        await db.commit()
        return {"message": "업로드 성공"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
