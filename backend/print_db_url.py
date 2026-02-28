import asyncio
import os
import sys

from app.core.config import settings
print("DATABASE_URI in settings:", settings.SQLALCHEMY_DATABASE_URI)
