from fastapi import APIRouter
from app.api.endpoints import basics, product, sales, production, quality, reports, purchasing, inventory

api_router = APIRouter()

api_router.include_router(basics.router, prefix="/basics", tags=["basics"])
api_router.include_router(product.router, prefix="/product", tags=["product"])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(production.router, prefix="/production", tags=["production"])
api_router.include_router(quality.router, prefix="/quality", tags=["quality"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(purchasing.router, prefix="/purchasing", tags=["purchasing"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])

from app.api.endpoints import upload, debug
api_router.include_router(upload.router, tags=["upload"])
api_router.include_router(debug.router, prefix="/debug", tags=["debug"])
