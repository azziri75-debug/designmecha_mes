/**
 * 생산 관련 유틸리티 함수
 */

/**
 * 생산 계획의 품목 리스트를 받아 대표 품명 문자열을 생성합니다.
 * 예: "제품A 외 2건", "제품B"
 * 
 * @param {Object} plan ProductionPlan 객체 (또는 items 배열 호환용)
 * @returns {string} 대표 품명 문자열
 */
export const getProductNameStr = (plan) => {
    if (!plan) return "-";

    // 배열이 들어온 경우 (이전 버전 호환성)
    if (Array.isArray(plan)) {
        return getProductNameStrFromItems(plan);
    }

    if (plan.order && plan.order.items && plan.order.items.length > 0) {
        const firstProd = plan.order.items[0]?.product?.name || plan.order.items[0]?.product_name || plan.order.items[0]?.name || "품명 미상";
        const otherCount = plan.order.items.length - 1;
        return otherCount > 0 ? `${firstProd} 외 ${otherCount}건` : firstProd;
    }
    
    if (plan.stock_production) {
        return plan.stock_production.product?.name || "품명 미상";
    }

    return getProductNameStrFromItems(plan.items);
};

const getProductNameStrFromItems = (items) => {
    if (!items || items.length === 0) return "-";

    // 품목 ID 기준으로 고유한 제품 목록 추출
    const productMap = items.reduce((acc, item) => {
        const pid = item.product_id || 'unknown';
        if (!acc[pid]) {
            acc[pid] = item.product?.name || item.product_name || `품목(${pid})`;
        }
        return acc;
    }, {});

    const uniqueProductNames = Object.values(productMap);
    const firstProd = uniqueProductNames[0] || "-";
    const otherCount = uniqueProductNames.length - 1;

    return otherCount > 0 ? `${firstProd} 외 ${otherCount}건` : firstProd;
};

/**
 * 생산 계획의 상태에 따른 색상을 반환합니다.
 */
export const getStatusColor = (status) => {
    switch (status) {
        case 'COMPLETED': return 'success';
        case 'CONFIRMED': return 'secondary';
        case 'PLANNED': return 'primary';
        case 'IN_PROGRESS': return 'info';
        case 'CANCELED': return 'error';
        default: return 'default';
    }
};
