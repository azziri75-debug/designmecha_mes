import asyncio
from app.api.deps import AsyncSessionLocal
from app.schemas.production import ProductionPlanCreate
from app.api.endpoints.production import create_production_plan

async def test():
    data = {"order_id":1,"stock_production_id":None,"plan_date":"2026-02-27","items":[{"product_id":1,"process_name":"기본 공정","sequence":1,"course_type":"INTERNAL","partner_name":"","worker_id":None,"equipment_id":None,"estimated_time":0,"start_date":None,"end_date":None,"cost":0,"quantity":10,"note":"","status":"PLANNED"}]}
    
    plan_create = ProductionPlanCreate(**data)
    
    async with AsyncSessionLocal() as db:
        try:
            res = await create_production_plan(plan_in=plan_create, db=db)
            print("Success")
        except Exception as e:
            import traceback
            traceback.print_exc()

import sys
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(test())
