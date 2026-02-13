from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List

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
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
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
