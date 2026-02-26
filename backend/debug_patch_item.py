import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(base_url="http://localhost:8000/api") as client:
        # Get the first plan item
        r_list = await client.get("/production/plans")
        if r_list.status_code != 200:
            print("Failed to get plans:", r_list.text)
            return
            
        plans = r_list.json()
        if not plans:
            print("No plans found")
            return
            
        target_item = None
        for plan in plans:
            if plan.get("items"):
                target_item = plan["items"][0]
                break
                
        if not target_item:
            print("No plan items found")
            return
            
        item_id = target_item["id"]
        print(f"Testing PATCH on plan item {item_id}")
        
        # Patch attachment
        r_patch = await client.patch(f"/production/plan-items/{item_id}", json={"note": "Test API"})
        print("Status Code:", r_patch.status_code)
        print("Response:", r_patch.text)

if __name__ == "__main__":
    asyncio.run(main())
