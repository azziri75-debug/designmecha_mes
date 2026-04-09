"""
DB Migration: 부서(Department) 시스템 추가
- departments 테이블 생성
- staff.department_id 컬럼 추가
- approval_lines.department_id 컬럼 추가
- 기존 staff.department 문자열 → department_id 자동 매핑
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import AsyncSessionLocal

async def run_migration():
    async with AsyncSessionLocal() as db:
        try:
            print("=== 부서 마이그레이션 시작 ===")
            
            # 1. departments 테이블 생성
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS departments (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR NOT NULL UNIQUE,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            print("✅ departments 테이블 생성 완료")
            
            # 2. staff.department_id 컬럼 추가
            try:
                await db.execute(text("""
                    ALTER TABLE staff 
                    ADD COLUMN IF NOT EXISTS department_id INTEGER 
                    REFERENCES departments(id) ON DELETE SET NULL
                """))
                print("✅ staff.department_id 컬럼 추가 완료")
            except Exception as e:
                print(f"  (컬럼 이미 존재할 수 있음: {e})")
            
            # 3. approval_lines.department_id 컬럼 추가
            try:
                await db.execute(text("""
                    ALTER TABLE approval_lines 
                    ADD COLUMN IF NOT EXISTS department_id INTEGER 
                    REFERENCES departments(id) ON DELETE CASCADE
                """))
                print("✅ approval_lines.department_id 컬럼 추가 완료")
            except Exception as e:
                print(f"  (컬럼 이미 존재할 수 있음: {e})")
            
            await db.commit()
            
            # 4. 기존 staff.department 문자열 → departments 테이블 자동 마이그레이션
            result = await db.execute(text("""
                SELECT DISTINCT department FROM staff 
                WHERE department IS NOT NULL AND department != ''
                ORDER BY department
            """))
            existing_depts = [row[0] for row in result.fetchall()]
            print(f"\n기존 부서 문자열 발견: {existing_depts}")
            
            dept_id_map = {}
            for dept_name in existing_depts:
                # departments 테이블에 없으면 삽입
                result = await db.execute(text("""
                    INSERT INTO departments (name, created_at)
                    VALUES (:name, NOW())
                    ON CONFLICT (name) DO NOTHING
                    RETURNING id
                """), {"name": dept_name})
                row = result.fetchone()
                
                if not row:
                    # 이미 존재하는 경우 id 조회
                    result = await db.execute(text(
                        "SELECT id FROM departments WHERE name = :name"
                    ), {"name": dept_name})
                    row = result.fetchone()
                
                if row:
                    dept_id_map[dept_name] = row[0]
                    print(f"  → '{dept_name}' → ID {row[0]}")
            
            # 5. staff.department_id 업데이트
            for dept_name, dept_id in dept_id_map.items():
                update_result = await db.execute(text("""
                    UPDATE staff 
                    SET department_id = :dept_id 
                    WHERE department = :dept_name AND department_id IS NULL
                """), {"dept_id": dept_id, "dept_name": dept_name})
                print(f"  ✅ '{dept_name}' 직원 {update_result.rowcount}명 → department_id={dept_id} 매핑")
            
            await db.commit()
            
            # 6. 결과 확인
            result = await db.execute(text("""
                SELECT d.name, COUNT(s.id) as member_count
                FROM departments d
                LEFT JOIN staff s ON s.department_id = d.id
                GROUP BY d.id, d.name
                ORDER BY d.name
            """))
            rows = result.fetchall()
            print("\n=== 마이그레이션 결과 ===")
            for row in rows:
                print(f"  부서: {row[0]}, 소속 직원: {row[1]}명")
            
            print("\n✅ 마이그레이션 완료!")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ 마이그레이션 실패: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(run_migration())
