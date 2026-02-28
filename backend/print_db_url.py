import os
import asyncio
from app.core.config import settings

async def main():
    print(f"DATABASE_URL from settings: {settings.SQLALCHEMY_DATABASE_URI}")
    print(f"DATABASE_URL from env: {os.getenv('DATABASE_URL')}")

if __name__ == "__main__":
    asyncio.run(main())
