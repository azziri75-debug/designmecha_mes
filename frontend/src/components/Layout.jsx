import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
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
    DollarSign
} from 'lucide-react';
import { cn } from '../lib/utils';

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

    const navItems = [
        { icon: LayoutDashboard, label: '대시보드', to: '/' },
        { icon: Users, label: '기초 정보 (거래처/사원)', to: '/basics' },
        { icon: Package, label: '제품 및 공정 관리', to: '/products' },
        { icon: DollarSign, label: '영업 관리', to: '/sales' },
        { icon: Package, label: '구매/자재', to: '/material' },

        { icon: Factory, label: '생산 관리 (계획/지시)', to: '/production' },
        { icon: ClipboardCheck, label: '품질 관리', to: '/quality' },
        { icon: Truck, label: '납품 및 재고', to: '/inventory' },
        { icon: BarChart3, label: '리포트 및 통계', to: '/reports' },
    ];

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
                    {navItems.map((item) => (
                        <SidebarItem
                            key={item.to}
                            {...item}
                            active={location.pathname === item.to || location.pathname.startsWith(item.to + '/')}
                        />
                    ))}
                </div>

                <div className="p-4 border-t border-gray-800">
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                            ADMIN
                        </div>
                        <div className="text-sm">
                            <div className="font-medium text-white">관리자</div>
                            <div className="text-xs text-gray-500">admin@mes.com</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-900">
                <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold text-white">
                            {navItems.find(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'))?.label || 'MES System'}
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
