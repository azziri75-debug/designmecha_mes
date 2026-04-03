import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
    LayoutDashboard,
    Package,
    Users,
    ShoppingCart,
    ShoppingBag,
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
    Boxes,
    Database,
    Clock,
    Wrench,
    Blocks,
    Cpu,
    Plus,
    Mail, Send
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Fab } from '@mui/material';

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
    
    const [contactModalOpen, setContactModalOpen] = useState(false);
    const [contactForm, setContactForm] = useState({ subject: '', content: '' });

    const handleSendSysadmin = async () => {
        try {
            await api.post('/basics/sysadmin/contact', contactForm);
            alert('관리자에게 메일이 성공적으로 발송되었습니다.');
            setContactModalOpen(false);
            setContactForm({ subject: '', content: '' });
        } catch (e) {
            alert('발송 실패: 등록된 관리자 이메일이 없거나 서버 오류입니다.');
        }
    };

    const navItems = [
        { icon: LayoutDashboard, label: '대시보드', to: '/', menuKey: 'dashboard' },
        { icon: Users, label: '기초정보', to: '/basics', menuKey: 'basics' },
        { icon: Blocks, label: '생산제품관리', to: '/products/produced', menuKey: 'products_produced' },
        { icon: Cpu, label: '부품관리', to: '/products/parts', menuKey: 'products_parts' },
        { icon: DollarSign, label: '영업관리', to: '/sales', menuKey: 'sales_order' },
        { icon: Factory, label: '생산관리', to: '/production', menuKey: 'production' },
        { icon: ShoppingCart, label: '자재구매관리', to: '/purchasing/materials', menuKey: 'purchasing_materials' },
        { icon: Truck, label: '외주발주관리', to: '/outsourcing', menuKey: 'outsourcing' },
        { icon: ClipboardCheck, label: '작업일지관리', to: '/work-logs', menuKey: 'worklogs' },
        { icon: Truck, label: '납품관리', to: '/delivery', menuKey: 'delivery' },
        { icon: Boxes, label: '재고및재고생산관리', to: '/inventory', menuKey: 'inventory' },
        { icon: ClipboardCheck, label: '품질관리', to: '/quality', menuKey: 'quality_status' },
        { icon: Shield, label: '고객불만관리', to: '/complaints', menuKey: 'quality_complaints' },
        { icon: Wrench, label: '소모품관리', to: '/products/consumables', menuKey: 'products_consumables' },
        { icon: ShoppingBag, label: '소모품발주관리', to: '/purchasing/consumables', menuKey: 'purchasing_consumables' },
        { icon: FileText, label: '전자결재및문서관리', to: '/approval', menuKey: 'approval' },
        { icon: BarChart3, label: '결산자료', to: '/settlement', menuKey: 'sales_settlement' },
        { icon: Clock, label: '근태관리', to: '/attendance', menuKey: 'hr' },
        { icon: Database, label: 'DB관리', to: '/db-management', menuKey: 'ADMIN' },
    ];

    // Filter nav items based on user permissions
    const visibleNavItems = navItems.filter(item => {
        if (!item.menuKey) return true; // Dashboard always visible
        const permitted = hasPermission(item.menuKey);
        return permitted;
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
                    <div className="font-bold text-lg tracking-tight text-blue-500 flex items-center gap-2">
                        <Factory className="w-5 h-5" />
                        <span>DESIGNMECHA MES</span>
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
                        onClick={() => setContactModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 w-full text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-md transition-colors"
                    >
                        <Mail className="w-4 h-4" />
                        <span>시스템 관리자 문의</span>
                    </button>

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
                    <div className="w-full mx-auto space-y-6">
                        <Outlet />
                    </div>
                </div>
            </main>


            <Dialog open={contactModalOpen} onClose={() => setContactModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold', color: '#d32f2f' }}>🛠️ 시스템 관리자 문의</DialogTitle>
                <DialogContent dividers className="flex flex-col gap-4">
                    <TextField 
                        label="제목" 
                        fullWidth 
                        value={contactForm.subject} 
                        onChange={e => setContactForm({...contactForm, subject: e.target.value})} 
                    />
                    <TextField 
                        label="문의 내용" 
                        multiline 
                        rows={6} 
                        fullWidth 
                        placeholder="발생한 오류나 요청사항을 상세히 적어주세요."
                        value={contactForm.content} 
                        onChange={e => setContactForm({...contactForm, content: e.target.value})} 
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setContactModalOpen(false)}>취소</Button>
                    <Button onClick={handleSendSysadmin} variant="contained" color="error" startIcon={<Send className="w-4 h-4"/>}>
                        메일 발송
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default Layout;
