import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeParseJSON } from '../lib/utils';

const AuthContext = createContext(null);

const MENUS = [
    { key: 'dashboard', label: '대시보드' },
    { key: 'basics', label: '기초 정보' },
    { key: 'products_produced', label: '생산 제품 관리' },
    { key: 'products_parts', label: '부품 관리' },
    { key: 'products_consumables', label: '소모품 관리' },
    { key: 'sales_order', label: '영업 관리' },
    { key: 'sales_settlement', label: '결산 자료' },
    { key: 'production', label: '생산 관리' },
    { key: 'worklogs', label: '작업 일지 관리' },
    { key: 'inventory', label: '재고/재고생산' },
    { key: 'purchasing_materials', label: '자재 구매 관리' },
    { key: 'purchasing_consumables', label: '소모품 발주 관리' },
    { key: 'outsourcing', label: '외주 발주 관리' },
    { key: 'delivery', label: '납품 관리' },
    { key: 'quality_status', label: '품질 관리' },
    { key: 'quality_complaints', label: '고객 불만 관리' },
    { key: 'hr', label: '근태 관리' },
    { key: 'approval', label: '전자결재/문서' },
    { key: 'ADMIN', label: 'DB 관리' },
];

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('mes_user') || localStorage.getItem('user');
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error("Auth initialization error:", e);
            return null;
        }
    });

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('mes_user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('mes_user');
    };

    const hasPermission = (menuKey, action = 'view') => {
        if (!user) return false;
        if (user.user_type === 'ADMIN') return true;

        const perms = user.menu_permissions || [];

        // Backward compatibility for array-based permissions (assumes view/edit access)
        if (Array.isArray(perms)) {
            return perms.includes(menuKey);
        }

        // Granular permissions object: { menuKey: { view: true, edit: false, showPrice: true } }
        if (perms && typeof perms === 'object') {
            const menuPerm = perms[menuKey];
            if (!menuPerm) return false;
            // 'view' is default check. If checking for 'view', it must be explicitly true.
            return !!menuPerm[action];
        }

        return false;
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, hasPermission, MENUS }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
export { MENUS };
export default AuthContext;
