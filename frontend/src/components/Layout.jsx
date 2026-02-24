import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Package,
    Users,
    ShoppingCart,
    Factory,
    ClipboardCheck,
    Truck,
    BarChart3,
    Menu,
    DollarSign,
    LogOut,
    Shield,
    User,
    FileText,
    Boxes
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

const SidebarItem = ({ icon: Icon, label, to, active }) => {
    return (
        <Link
            to={to}
            className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group",
                active
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
        >
            <Icon className={cn("w-5 h-5", active ? "text-white" : "text-gray-400 group-hover:text-white")} />
            <span className="font-medium text-sm">{label}</span>
        </Link>
    );
};

const Layout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout, hasPermission } = useAuth();

    const navItems = [
        { icon: LayoutDashboard, label: '대시보드', to: '/', menuKey: null },
        { icon: Users, label: '기초 정보 (거래처/사원)', to: '/basics', menuKey: 'basics' },
        { icon: Package, label: '제품 및 공정 관리', to: '/products', menuKey: 'products' },
        { icon: DollarSign, label: '영업 관리 (견적/수주)', to: '/sales', menuKey: 'sales' },
        { icon: Factory, label: '생산 관리 (계획/지시)', to: '/production', menuKey: 'production' },
        { icon: ShoppingCart, label: '자재 구매 관리', to: '/purchase', menuKey: 'purchase' },
        { icon: Truck, label: '외주 발주 관리', to: '/outsourcing', menuKey: 'outsourcing' },
        { icon: ClipboardCheck, label: '품질 관리', to: '/quality', menuKey: 'quality' },
        { icon: Boxes, label: '재고 및 재고생산 관리', to: '/inventory', menuKey: 'inventory' },
        { icon: FileText, label: '양식 및 레이아웃 관리', to: '/forms', menuKey: 'basics' }, // basics permission for now
    ];

    // Filter nav items based on user permissions
    const visibleNavItems = navItems.filter(item => {
        if (!item.menuKey) return true; // Dashboard always visible
        return hasPermission(item.menuKey);
    });

    const handleLogout = () => {
        if (window.confirm('로그아웃 하시겠습니까?')) {
            logout();
            navigate('/login');
        }
    };

    return (
        <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-gray-800">
                    <div className="font-bold text-xl tracking-tight text-blue-500 flex items-center gap-2">
                        <Factory className="w-6 h-6" />
                        <span>MES ERP</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    {visibleNavItems.map((item) => (
                        <SidebarItem
                            key={item.to}
                            {...item}
                            active={location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))}
                        />
                    ))}
                </div>

                <div className="p-4 border-t border-gray-800 space-y-2">
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                            user?.user_type === 'ADMIN' ? "bg-purple-600" : "bg-blue-600"
                        )}>
                            {user?.user_type === 'ADMIN' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className="text-sm flex-1 min-w-0">
                            <div className="font-medium text-white truncate">{user?.name || '관리자'}</div>
                            <div className="text-xs text-gray-500">{user?.user_type === 'ADMIN' ? '관리자' : '사용자'}</div>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 w-full text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>로그아웃</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-900">
                <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold text-white">
                            {visibleNavItems.find(item => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/')))?.label || 'MES System'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Header Actions */}
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    <div className="max-w-7xl mx-auto space-y-6">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Layout;
