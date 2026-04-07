import asyncio
import sys
import os

# 현재 경로를 파이썬 패스에 추가하여 app 모듈을 찾을 수 있게 함
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# SQLAlchemy 엔진 및 Base 가져오기
from app.api.deps import engine
from app.db.base import Base
# 모든 모델을 불러와서 Metadata에 등록되도록 함
import app.models 

async def create_tables():
    print("🚀 새 테이블 생성 시도 중...")
    try:
        async with engine.begin() as conn:
            # Metadata에 등록된 모든 테이블 중 현재 DB에 없는 테이블만 생성합니다.
            # 데이터 마이그레이션 도구(Alembic) 없이 스키마를 동기화하는 가장 안전한 방법입니다.
            await conn.run_sync(Base.metadata.create_all)
        print("✅ 테이블 생성이 완료되었습니다!")
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(create_tables())
