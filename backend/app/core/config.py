from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "MES ERP System"
    API_V1_STR: str = "/api/v1"
    
    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_DB: str = "mes_erp"
    POSTGRES_PORT: int = 5432
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"]
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # Check if DATABASE_URL env var is set (e.g. from Render)
        import os
        env_db_url = os.getenv("DATABASE_URL")
        if env_db_url:
            # Fix for asyncpg: replace postgres:// with postgresql+asyncpg://
            if env_db_url.startswith("postgres://"):
                 return env_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
            return env_db_url
            
        # Use SQLite for development fallback
        return "sqlite+aiosqlite:///./mes_erp_v2.db"

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")

settings = Settings()
