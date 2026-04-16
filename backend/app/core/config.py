from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List, ClassVar
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "MES ERP System"
    API_V1_STR: str = "/api/v1"
    
    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_DB: str = "mes_erp"
    POSTGRES_PORT: int = 5432
    
    # Email (Daum SMTP)
    SMTP_SERVER: str = "smtp.daum.net"
    SMTP_PORT: int = 465
    SMTP_USER: str = "azziri@daum.net"
    SMTP_PASSWORD: str = "ntsyulnwlpqlqbgd"
    SMTP_SENDER: str = "no-reply@designmecha.co.kr"
    
    # Web Push (VAPID)
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:no-reply@designmecha.co.kr"

    @property
    def VAPID_PUBLIC_KEY_STR(self) -> str:
        key = self.VAPID_PUBLIC_KEY or ""
        return key.replace('"', '').replace("'", "").strip()

    @property
    def VAPID_PRIVATE_KEY_STR(self) -> str:
        key = self.VAPID_PRIVATE_KEY or ""
        return key.replace('"', '').replace("'", "").strip()
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://192.168.0.23:3000",
        "https://designmecha-mes.vercel.app"
    ]
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # Check if DATABASE_URL env var is set (e.g. from Render)
        import os
        env_db_url = os.getenv("DATABASE_URL")
        if env_db_url:
            # Fix for asyncpg: ensure we use postgresql+asyncpg:// scheme
            if env_db_url.startswith("postgres://"):
                 return env_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
            elif env_db_url.startswith("postgresql://"):
                 return env_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return env_db_url
            
        # Use SQLite for development fallback
        return "sqlite+aiosqlite:///./mes_erp_v2.db"

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")


settings = Settings()

# 진단 로그
print(f"[CONFIG] Project Name: {settings.PROJECT_NAME}")
if not settings.VAPID_PUBLIC_KEY_STR:
    print("[WARNING] VAPID_PUBLIC_KEY is not set or empty!")
else:
    print(f"[CONFIG] VAPID Public Key loaded (starts with: {settings.VAPID_PUBLIC_KEY_STR[:10]}...)")


