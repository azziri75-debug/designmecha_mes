import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const MENUS = [
    { key: 'basics', label: '기초 정보 (거래처/사원)' },
    { key: 'products', label: '제품 및 공정 관리' },
    { key: 'sales', label: '영업 관리 (견적/수주)' },
    { key: 'production', label: '생산 관리 (계획/지시)' },
    { key: 'purchasing', label: '자재/소모품 구매 관리' },
    { key: 'outsourcing', label: '외주 발주 관리' },
    { key: 'quality', label: '품질 관리' },
    { key: 'inventory', label: '재고 관리' },
    { key: 'delivery', label: '납품 관리' },
    { key: 'worklogs', label: '작업 일지 관리' },
    { key: 'hr', label: '근태 관리' },
    { key: 'approval', label: '전자결재 및 문서 관리' },
];

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('mes_user');
        return saved ? JSON.parse(saved) : null;
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
