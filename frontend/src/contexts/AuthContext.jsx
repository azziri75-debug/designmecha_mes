import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const MENUS = [
    { key: 'basics', label: '기초 정보 (거래처/사원)' },
    { key: 'products', label: '제품 및 공정 관리' },
    { key: 'sales', label: '영업 관리 (견적/수주)' },
    { key: 'production', label: '생산 관리 (계획/지시)' },
    { key: 'purchase', label: '자재 구매 관리' },
    { key: 'outsourcing', label: '외주 발주 관리' },
    { key: 'quality', label: '품질 관리' },
    { key: 'inventory', label: '납품 및 재고' },
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

    const hasPermission = (menuKey) => {
        if (!user) return false;
        if (user.user_type === 'ADMIN') return true;
        return (user.menu_permissions || []).includes(menuKey);
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
