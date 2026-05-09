#!/bin/bash
set -e

echo "=== [1/4] DB 스키마 패치 실행 중 ==="
python fix_db_issues.py || echo "DB 패치 스크립트 실행 중 오류 발생 (무시하고 계속)"

echo "=== [2/4] 부품 타입(item_type) 일괄 수정 스크립트 실행 중 ==="
python fix_part_types.py || echo "부품 타입 강제 수정 스크립트 실행 중 오류 (무시하고 계속)"

echo "=== [3/5] 생산계획 누락 데이터 복구 스크립트 실행 중 ==="
python scripts/fix_missing_plan_items.py || echo "생산계획 복구 스크립트 실행 중 오류 (무시하고 계속)"

echo "=== [4/5] Alembic 마이그레이션 실행 중 ==="
alembic upgrade head || echo "Alembic 마이그레이션 실패 (무시하고 계속)"

echo "=== [5/5] Uvicorn 서버 시작 ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
