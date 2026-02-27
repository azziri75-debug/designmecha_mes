import httpx
import asyncio

async def test_create_plan():
    async with httpx.AsyncClient() as client:
        payload = {
            "order_id": 1,
            "plan_date": "2023-11-20"
        }
        print(f"Sending request to /api/v1/production/plans with payload: {payload}")
        response = await client.post("http://localhost:8000/api/v1/production/plans", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")

if __name__ == "__main__":
    asyncio.run(test_create_plan())
