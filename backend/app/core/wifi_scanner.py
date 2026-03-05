import asyncio
import os
import sys
import subprocess
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# 프로젝트 루트 경로 추가 (app 모듈 임포트용)
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.config import settings
from app.models.hr import Staff, AttendanceLog, AttendanceLogType

# Database Engine 설정
engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URI)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def check_device_online(ip_address: str) -> bool:
    """
    지정한 IP 주소에 대해 Ping 테스트를 수행하여 온라인 여부 확인.
    NAS 환경(Linux)이나 Windows 환경에 따라 명령어 옵션이 다를 수 있음.
    """
    if not ip_address:
        return False
        
    # -c 1 (Linux/Mac), -n 1 (Windows)
    param = '-n' if os.name == 'nt' else '-c'
    command = ['ping', param, '1', '-w', '1000', ip_address]
    
    try:
        # Popen을 사용하여 비동기적으로 실행하거나 run 사용 (여기서는 간단히 subprocess.run)
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return result.returncode == 0
    except Exception as e:
        print(f"Ping error for {ip_address}: {e}")
        return False

async def scan_and_log_wifi():
    """
    1. DB에서 활성 사원의 MAC/IP 정보를 가져옴.
    2. 각 기기의 온라인 여부 확인 (Ping 또는 ARP 테이블 조회).
    3. 접속이 확인되면 AttendanceLog에 기록.
    """
    print(f"[{datetime.now()}] Starting Wi-Fi detection scan...")
    
    async with AsyncSessionLocal() as db:
        # MAC 또는 IP 주소가 등록된 활성 사원 조회
        stmt = select(Staff).where(
            Staff.is_active == True,
            (Staff.ip_address != None) | (Staff.mac_address != None)
        )
        result = await db.execute(stmt)
        staff_list = result.scalars().all()
        
        for staff in staff_list:
            is_online = await check_device_online(staff.ip_address)
            
            if is_online:
                print(f"Device found for {staff.name} ({staff.ip_address})")
                
                # 중복 로그 방지 로직 (예: 최근 10분 내 로그가 있으면 스킵)
                # 여기서는 원시 데이터를 최대한 남기는 뼈대만 작성
                new_log = AttendanceLog(
                    staff_id=staff.id,
                    log_time=datetime.now(),
                    log_type=AttendanceLogType.WIFI_DETECTED
                )
                db.add(new_log)
        
        await db.commit()
    
    print(f"[{datetime.now()}] Scan completed.")

async def main():
    """
    주기적으로 스캔을 수행하는 루프.
    실제 운영 시에는 Celery Beat나 별도의 Systemd 서비스로 관리하는 것이 좋음.
    """
    SCAN_INTERVAL_SECONDS = 300  # 5분 간격
    
    while True:
        try:
            await scan_and_log_wifi()
        except Exception as e:
            print(f"Scanner loop error: {e}")
            
        await asyncio.sleep(SCAN_INTERVAL_SECONDS)

if __name__ == "__main__":
    # 실행 시 주의: DB 연결 정보가 환경 변수나 config에 정확히 설정되어 있어야 함.
    print("Attendance Wi-Fi Scanner started.")
    asyncio.run(main())
