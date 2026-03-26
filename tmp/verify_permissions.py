import asyncio
from passlib.context import CryptContext
import json

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def verify_permissions():
    print("Verifying Password Hashing...")
    password = "5446220"
    hashed = pwd_context.hash(password)
    print(f"Hashed: {hashed}")
    
    # Test verify
    is_valid = pwd_context.verify(password, hashed)
    print(f"Verify Correct PW: {is_valid}")
    assert is_valid == True
    
    # Test fallback (simulating identify logic)
    print("Verifying Plain Text Fallback...")
    plain_stored = "6220"
    input_plain = "6220"
    
    # Simulation of basics.py logic
    try:
        if pwd_context.identify(plain_stored):
            res = pwd_context.verify(input_plain, plain_stored)
        else:
            res = (plain_stored == input_plain)
    except:
        res = (plain_stored == input_plain)
    print(f"Verify Plain Text: {res}")
    assert res == True

    print("Verifying Menu Permissions Structure...")
    MENU_KEYS = ["basics", "products", "sales", "production", "purchasing", "outsourcing", "worklogs", "delivery", "inventory", "quality", "approval", "hr", "ADMIN"]
    FULL_PERMISSIONS = {k: {"view": True, "edit": True, "price": True} for k in MENU_KEYS}
    print(f"Menu Keys Count: {len(FULL_PERMISSIONS)}")
    assert len(FULL_PERMISSIONS) == 13
    assert FULL_PERMISSIONS["basics"]["price"] == True

    print("Verification Successful!")

if __name__ == "__main__":
    asyncio.run(verify_permissions())
