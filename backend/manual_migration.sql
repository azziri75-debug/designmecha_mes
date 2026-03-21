-- 1. 수주 품목(sales_order_items)과 생산계획 품목(production_plan_items) 간의 품목(규격) 또는 수량이 불일치하는 내역을 조회합니다.
SELECT 
    so.order_no AS 수주번호,
    soi.product_id AS 수주_품목ID,
    soi.quantity AS 수주_수량,
    ppi.id AS 생산계획아이템_ID,
    ppi.product_id AS 생산계획_잘못된품목ID,
    ppi.quantity AS 생산계획_잘못된수량
FROM sales_orders so
JOIN sales_order_items soi ON so.id = soi.order_id
JOIN production_plans pp ON so.id = pp.order_id
JOIN production_plan_items ppi ON pp.id = ppi.plan_id
WHERE soi.product_id != ppi.product_id OR soi.quantity != ppi.quantity;

-- 2. 위에서 조회된 생산계획 품목들을 올바른 수주 품목 정보로 업데이트(동기화)합니다.
UPDATE production_plan_items
SET 
    product_id = (
        SELECT soi.product_id 
        FROM sales_orders so 
        JOIN sales_order_items soi ON so.id = soi.order_id 
        JOIN production_plans pp ON so.id = pp.order_id 
        WHERE pp.id = production_plan_items.plan_id
        LIMIT 1
    ),
    quantity = (
        SELECT soi.quantity 
        FROM sales_orders so 
        JOIN sales_order_items soi ON so.id = soi.order_id 
        JOIN production_plans pp ON so.id = pp.order_id 
        WHERE pp.id = production_plan_items.plan_id
        LIMIT 1
    )
WHERE id IN (
    SELECT ppi.id
    FROM sales_orders so
    JOIN sales_order_items soi ON so.id = soi.order_id
    JOIN production_plans pp ON so.id = pp.order_id
    JOIN production_plan_items ppi ON pp.id = ppi.plan_id
    WHERE soi.product_id != ppi.product_id OR soi.quantity != ppi.quantity
);
