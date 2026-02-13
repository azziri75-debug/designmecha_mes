from fastapi import APIRouter
from app.api.endpoints import basics, product, sales, production, quality, reports

api_router = APIRouter()

api_router.include_router(basics.router, prefix="/basics", tags=["basics"])
api_router.include_router(product.router, prefix="/product", tags=["product"])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(production.router, prefix="/production", tags=["production"])
api_router.include_router(production.router, prefix="/production", tags=["production"])
api_router.include_router(quality.router, prefix="/quality", tags=["quality"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])

from app.api.endpoints import upload, debug
api_router.include_router(upload.router, tags=["upload"])
api_router.include_router(debug.router, prefix="/debug", tags=["debug"])
