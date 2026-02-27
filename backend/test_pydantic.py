from app.schemas.production import ProductionPlanCreate

data = {
    'order_id': 1,
    'plan_date': '2026-02-27',
    'items': [{
        'product_id': 1,
        'process_name': 'Test',
        'sequence': 1,
        'course_type': 'INTERNAL',
        'worker_id': None,
        'equipment_id': None,
        'quantity': 10
    }]
}

try:
    plan = ProductionPlanCreate(**data)
    print('Success')
except Exception as e:
    print(e)
