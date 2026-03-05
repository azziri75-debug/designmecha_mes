#!/bin/bash
set -e

echo "=== [1/3] DB 스키마 패치 실행 중 ==="
python fix_db_issues.py || echo "DB 패치 스크립트 실행 중 오류 발생 (무시하고 계속)"

echo "=== [2/3] Alembic 마이그레이션 실행 중 ==="
alembic upgrade head || echo "Alembic 마이그레이션 실패 (무시하고 계속)"

echo "=== [3/3] Uvicorn 서버 시작 ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
