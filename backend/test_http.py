import sys
import httpx
import asyncio

async def test_api():
    payload = {
        "order_id": 4,
        "plan_date": "2026-02-27",
        "items": [
            {
                "product_id": 3,
                "process_name": "기본 공정",
                "sequence": 1,
                "course_type": "INTERNAL",
                "partner_name": "",
                "worker_id": None,
                "equipment_id": None,
                "estimated_time": 0,
                "start_date": None,
                "end_date": None,
                "cost": 0,
                "quantity": 10,
                "note": "",
                "status": "PLANNED"
            }
        ]
    }
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post("http://localhost:8000/api/v1/production/plans", json=payload)
            print("Status:", res.status_code)
            print("Response:", res.text)
        except Exception as e:
            print("Error connecting:", e)

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
asyncio.run(test_api())
