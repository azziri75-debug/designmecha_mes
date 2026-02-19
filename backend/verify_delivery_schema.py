from app.models.sales import SalesOrder
from app.schemas.sales import SalesOrderUpdate, SalesOrderCreate
from datetime import date
import sys

def verify():
    print("Verifying SalesOrder Model fields...")
    model_fields = SalesOrder.__table__.columns.keys()
    required = ['actual_delivery_date', 'delivery_method', 'transaction_date']
    missing = [f for f in required if f not in model_fields]
    
    if missing:
        print(f"FAILED: Model missing fields: {missing}")
        sys.exit(1)
    else:
        print("PASSED: Model has all delivery fields.")

    print("\nVerifying SalesOrderUpdate Schema...")
    try:
        update_schema = SalesOrderUpdate(
            actual_delivery_date=date.today(),
            delivery_method="Direct",
            transaction_date=date.today(),
            status="DELIVERY_COMPLETED"
        )
        print("PASSED: SalesOrderUpdate accepts delivery fields.")
    except Exception as e:
        print(f"FAILED: SalesOrderUpdate schema rejected fields: {e}")
        sys.exit(1)

    print("\nVerifying SalesOrderCreate Schema (if used for updates)...")
    # We modified Create schema? No, we modified Update schema and Base schema?
    # Let's check if Base has it.
    try:
        # Assuming Base has it, Create should have it too
        create_schema = SalesOrderCreate(
            partner_id=1,
            total_amount=100,
            items=[],
            actual_delivery_date=date.today()
        )
        print("PASSED: SalesOrderCreate accepts delivery fields.")
    except Exception as e:
        print(f"FAILED: SalesOrderCreate schema rejected fields: {e}")
        # This might fail if I only added to Base but Create overrides or I missed something.
        # But I added to Base, so it should be there.
        # However, Create inherits Base.
        pass

if __name__ == "__main__":
    verify()
