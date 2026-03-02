from typing import Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
import pandas as pd
import io
import json
from datetime import datetime

from app.api import deps
from app.models.basics import Partner, Staff, Equipment
from app.models.product import Product, ProductGroup
from app.models.inventory import Inventory

router = APIRouter()

# Mapping table names to Models and Columns
TABLE_CONFIG = {
    "products": {
        "model": Product,
        "columns": ["품명", "규격", "재질", "단위", "비고"],
        "mapping": {
            "품명": "name",
            "규격": "specification",
            "재질": "material",
            "단위": "unit",
            "비고": "note"
        }
    },
    "partners": {
        "model": Partner,
        "columns": ["업체명", "구분(CUSTOMER/SUPPLIER/BOTH)", "사업자번호", "대표자", "주소", "전화번호", "이메일"],
        "mapping": {
            "업체명": "name",
            "구분(CUSTOMER/SUPPLIER/BOTH)": "partner_type",
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

@router.get("/template/{table_name}")
async def get_template(table_name: str):
    if table_name not in TABLE_CONFIG:
        raise HTTPException(status_code=404, detail="지원하지 않는 테이블입니다.")
    
    try:
        columns = TABLE_CONFIG[table_name]["columns"]
        df = pd.DataFrame(columns=columns)
        
        output = io.BytesIO()
        # Ensure openpyxl is explicitly used
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
    
    # Start transaction
    try:
        for index, row in df.iterrows():
            row_num = index + 2 # Header is line 1
            data = {}
            
            try:
                for excel_col, model_attr in mapping.items():
                    val = row.get(excel_col)
                    
                    # Basic cleaning
                    if pd.isna(val):
                        val = None
                    elif isinstance(val, str):
                        val = val.strip()
                    
                    # Special validation/transformation
                    if table_name == "partners" and excel_col == "구분(CUSTOMER/SUPPLIER/BOTH)":
                        if val:
                            val = [v.strip().upper() for v in str(val).split(',')]
                        else:
                            val = ["CUSTOMER"]
                    
                    data[model_attr] = val

                # Create instance
                obj = model(**data)
                db.add(obj)
                
                # Check for inventory auto-creation if product
                if table_name == "products":
                    await db.flush() # Get ID
                    inventory = Inventory(product_id=obj.id, quantity=0)
                    db.add(inventory)

            except Exception as e:
                errors.append(f"{row_num}행: 데이터 처리 중 오류 발생 ({str(e)})")
                continue

        if errors:
            await db.rollback()
            return JSONResponse(
                status_code=400,
                content={"message": "업로드 중 오류가 발생하여 전체 취소되었습니다.", "errors": errors}
            )
        
        await db.commit()
        return {"message": f"총 {len(df)}개의 데이터가 성공적으로 업로드되었습니다."}

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"서버 내부 오류: {str(e)}")
