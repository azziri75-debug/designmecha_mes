import json
import sqlite3
import os

# Database Path
DB_PATH = "e:/MES/backend/mes_erp_v2.db"

def seed():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    templates = [
        {
            "form_type": "ESTIMATE",
            "name": "기본 견적서 (이미지 기반)",
            "layout_data": {
                "blocks": [
                    {"id": "h1", "type": "header", "config": {"title": "견 적 서"}},
                    {"id": "i1", "type": "infoTable", "config": {}},
                    {"id": "s1", "type": "supplierTable", "config": {}},
                    {"id": "sb1", "type": "sumBox", "config": {}},
                    {"id": "p1", "type": "productList", "config": {}},
                    {"id": "m1", "type": "memo", "config": {}}
                ]
            }
        },
        {
            "form_type": "PURCHASE",
            "name": "기본 구매발주서 (이미지 기반)",
            "layout_data": {
                "blocks": [
                    {"id": "h1", "type": "boxedHeader", "config": {"title": "구매발주서"}},
                    {"id": "a1", "type": "approval", "config": {"steps": ["신청", "담당", "대표"]}},
                    {"id": "i1", "type": "infoTable", "config": {}},
                    {"id": "p1", "type": "productList", "config": {}},
                    {"id": "m1", "type": "memo", "config": {"title": "특기 사항 / 납품 조건"}}
                ]
            }
        },
        {
            "form_type": "PRODUCTION",
            "name": "기본 생산지시서",
            "layout_data": {
                "blocks": [
                    {"id": "h1", "type": "header", "config": {"title": "생산관리시트"}},
                    {"id": "a1", "type": "approval", "config": {"steps": ["담당", "대표이사"]}},
                    {"id": "i1", "type": "infoTable", "config": {}},
                    {"id": "p1", "type": "productList", "config": {}},
                    {"id": "t1", "type": "processTable", "config": {}},
                    {"id": "m1", "type": "memo", "config": {}}
                ]
            }
        },
        {
            "form_type": "PRODUCTION_DETAIL",
            "name": "세부 내역 (이미지 기반)",
            "layout_data": {
                "blocks": [
                    {"id": "h1", "type": "boxedHeader", "config": {"title": "세 부 내 역"}},
                    {"id": "d1", "type": "drawing", "config": {}},
                    {"id": "t1", "type": "processTable", "config": {}},
                    {"id": "m1", "type": "memo", "config": {"title": "NOTE."}}
                ]
            }
        }
    ]

    try:
        for t in templates:
            cursor.execute("SELECT id FROM form_templates WHERE form_type = ?", (t["form_type"],))
            existing = cursor.fetchone()
            layout_json = json.dumps(t["layout_data"], ensure_ascii=False)
            
            if existing:
                cursor.execute(
                    "UPDATE form_templates SET name = ?, layout_data = ? WHERE form_type = ?",
                    (t["name"], layout_json, t["form_type"])
                )
                print(f"Updated {t['form_type']}")
            else:
                cursor.execute(
                    "INSERT INTO form_templates (form_type, name, layout_data, is_active) VALUES (?, ?, ?, 1)",
                    (t["form_type"], t["name"], layout_json)
                )
                print(f"Inserted {t['form_type']}")
        
        conn.commit()
        print("Seeding complete.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    seed()
