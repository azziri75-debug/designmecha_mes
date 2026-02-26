import React, { useEffect, useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
    ShoppingCart, Factory, Truck, Package, TrendingUp, TrendingDown,
    Clock, CheckCircle2, AlertTriangle, ArrowRight, FileText, Layers,
    Activity, Calendar, DollarSign, Users, ClipboardList
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

/* ─── Utility ───────────────────────────────────────────────── */
const fmt = (n) => (n ?? 0).toLocaleString('ko-KR');
const fmtWon = (n) => `₩${fmt(n)}`;
const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100));
const todayStr = () => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

const STATUS_LABELS = {
    PENDING: '대기', CONFIRMED: '확정', PRODUCTION_COMPLETED: '생산완료',
    DELIVERY_COMPLETED: '납품완료', PLANNED: '계획', IN_PROGRESS: '진행중',
    COMPLETED: '완료', CANCELED: '취소', ORDERED: '발주',
    PASS: '합격', FAIL: '불합격', INSP_COMPLETED: '검사완료'
};

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

/* ─── Sub-components ────────────────────────────────────────── */

const StatCard = ({ title, value, sub, icon: Icon, color = 'blue', trend, onClick }) => {
    const colorMap = {
        blue: { bg: 'from-blue-600/20 to-blue-800/10', border: 'border-blue-700/50', icon: 'text-blue-400', glow: 'shadow-blue-500/10' },
        green: { bg: 'from-emerald-600/20 to-emerald-800/10', border: 'border-emerald-700/50', icon: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
        amber: { bg: 'from-amber-600/20 to-amber-800/10', border: 'border-amber-700/50', icon: 'text-amber-400', glow: 'shadow-amber-500/10' },
        red: { bg: 'from-red-600/20 to-red-800/10', border: 'border-red-700/50', icon: 'text-red-400', glow: 'shadow-red-500/10' },
        purple: { bg: 'from-purple-600/20 to-purple-800/10', border: 'border-purple-700/50', icon: 'text-purple-400', glow: 'shadow-purple-500/10' },
        cyan: { bg: 'from-cyan-600/20 to-cyan-800/10', border: 'border-cyan-700/50', icon: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
    };
    const c = colorMap[color] || colorMap.blue;

    return (
        <div
            onClick={onClick}
            className={`relative overflow-hidden bg-gradient-to-br ${c.bg} rounded-2xl p-5 border ${c.border} shadow-lg ${c.glow}
                        transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${onClick ? 'cursor-pointer' : ''}`}
        >
            {/* Decorative circle */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/[0.03]" />
            <div className="flex items-start justify-between relative z-10">
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
                    <p className="text-3xl font-extrabold text-white tracking-tight">{value}</p>
                    {sub && <p className="text-xs text-gray-500">{sub}</p>}
                </div>
                <div className={`p-2.5 rounded-xl bg-white/[0.06] ${c.icon}`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            {trend !== undefined && (
                <div className={`mt-3 flex items-center gap-1 text-xs ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{Math.abs(trend)}% 전월 대비</span>
                </div>
            )}
        </div>
    );
};

const SectionTitle = ({ icon: Icon, title, action }) => (
    <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-400" />
            {title}
        </h3>
        {action}
    </div>
);

const ChartCard = ({ children, title, icon: Icon = Activity, className = '' }) => (
    <div className={`bg-gray-800/70 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5 shadow-lg ${className}`}>
        <SectionTitle icon={Icon} title={title} />
        {children}
    </div>
);

const StatusBadge = ({ status }) => {
    const styles = {
        PENDING: 'bg-gray-700 text-gray-300', CONFIRMED: 'bg-blue-900/60 text-blue-300',
        PRODUCTION_COMPLETED: 'bg-cyan-900/60 text-cyan-300', DELIVERY_COMPLETED: 'bg-emerald-900/60 text-emerald-300',
        PLANNED: 'bg-indigo-900/60 text-indigo-300', IN_PROGRESS: 'bg-amber-900/60 text-amber-300',
        COMPLETED: 'bg-emerald-900/60 text-emerald-300', CANCELED: 'bg-red-900/60 text-red-300',
        ORDERED: 'bg-purple-900/60 text-purple-300'
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[status] || styles.PENDING}`}>
            {STATUS_LABELS[status] || status}
        </span>
    );
};

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="text-gray-400 mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {fmt(p.value)}</p>
            ))}
        </div>
    );
};

/* ─── Dashboard ─────────────────────────────────────────────── */

const Dashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [plans, setPlans] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [outsourcingOrders, setOutsourcingOrders] = useState([]);
    const [pendingPurchase, setPendingPurchase] = useState([]);
    const [pendingOutsourcing, setPendingOutsourcing] = useState([]);
    const [partners, setPartners] = useState([]);
    const [products, setProducts] = useState([]);
    const [staff, setStaff] = useState([]);
    const [stockProductions, setStockProductions] = useState([]);
    const [defects, setDefects] = useState([]);

    // Grouping States
    const [groups, setGroups] = useState([]);
    const [selectedMajorGroup, setSelectedMajorGroup] = useState("");
    const [selectedMinorGroup, setSelectedMinorGroup] = useState("");

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [ordRes, planRes, poRes, ooRes, ppRes, opRes, partRes, prodRes, staffRes, spRes, defRes] = await Promise.allSettled([
                    api.get('/sales/orders/'),
                    api.get('/production/plans'),
                    api.get('/purchasing/purchase/orders'),
                    api.get('/purchasing/outsourcing/orders'),
                    api.get('/purchasing/purchase/pending-items'),
                    api.get('/purchasing/outsourcing/pending-items'),
                    api.get('/basics/partners/'),
                    api.get('/product/products'),
                    api.get('/basics/staff/'),
                    api.get('/inventory/productions'),
                    api.get('/quality/defects/'),
                    api.get('/products/groups/')
                ]);
                if (ordRes.status === 'fulfilled') setOrders(ordRes.value.data);
                if (planRes.status === 'fulfilled') setPlans(planRes.value.data);
                if (poRes.status === 'fulfilled') setPurchaseOrders(poRes.value.data);
                if (ooRes.status === 'fulfilled') setOutsourcingOrders(ooRes.value.data);
                if (ppRes.status === 'fulfilled') setPendingPurchase(ppRes.value.data);
                if (opRes.status === 'fulfilled') setPendingOutsourcing(opRes.value.data);
                if (partRes.status === 'fulfilled') setPartners(partRes.value.data);
                if (prodRes.status === 'fulfilled') setProducts(prodRes.value.data);
                if (staffRes.status === 'fulfilled') setStaff(staffRes.value.data);
                if (spRes.status === 'fulfilled') setStockProductions(spRes.value.data);
                if (defRes.status === 'fulfilled') setDefects(defRes.value.data);
                if (groupRes && groupRes.status === 'fulfilled') setGroups(groupRes.value.data || []);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetchAll();
    }, []);

    /* ── computed stats ── */
    const stats = useMemo(() => {
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Filter Logic based on selected groups
        let filteredProducts = products;
        if (selectedMinorGroup) {
            filteredProducts = products.filter(p => String(p.group_id) === String(selectedMinorGroup));
        } else if (selectedMajorGroup) {
            const minorIds = groups.filter(g => String(g.parent_id) === String(selectedMajorGroup)).map(g => g.id);
            filteredProducts = products.filter(p => minorIds.includes(p.group_id));
        }
        const filteredProductIds = new Set(filteredProducts.map(p => p.id));

        const matchesGroup = (productId) => (!selectedMajorGroup && !selectedMinorGroup) || filteredProductIds.has(productId);

        const fOrders = orders.filter(o => (!selectedMajorGroup && !selectedMinorGroup) || (o.items && o.items.some(i => matchesGroup(i.product_id))));
        const fPlans = plans.filter(p => (!selectedMajorGroup && !selectedMinorGroup) || (p.plan_items && p.plan_items.some(i => matchesGroup(i.product_id))));
        const fPurchaseOrders = purchaseOrders.filter(o => (!selectedMajorGroup && !selectedMinorGroup) || (o.items && o.items.some(i => matchesGroup(i.product_id))));
        const fOutsourcingOrders = outsourcingOrders.filter(o => (!selectedMajorGroup && !selectedMinorGroup) || (o.items && o.items.some(i => matchesGroup(i.product_id))));
        const fPendingPurchase = pendingPurchase.filter(i => matchesGroup(i.product_id));
        const fPendingOutsourcing = pendingOutsourcing.filter(i => matchesGroup(i.product_id));
        const fStockProductions = stockProductions.filter(sp => matchesGroup(sp.product_id));
        const fDefects = defects.filter(d =>
            (d.plan_item && matchesGroup(d.plan_item.product_id)) ||
            (d.order && d.order.items && d.order.items.some(i => matchesGroup(i.product_id))) ||
            (!d.plan_item && !d.order) // Keep unmatched safely or adjust
        );

        // Orders
        const monthOrders = fOrders.filter(o => o.order_date?.startsWith(thisMonth));
        const totalRevenue = fOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
        const monthRevenue = monthOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
        const pendingOrders = fOrders.filter(o => o.status === 'PENDING' || o.status === 'CONFIRMED');
        const deliveredOrders = fOrders.filter(o => o.status === 'DELIVERY_COMPLETED');
        const prodCompOrders = fOrders.filter(o => o.status === 'PRODUCTION_COMPLETED');

        // Production
        const activePlans = fPlans.filter(p => p.status === 'IN_PROGRESS' || p.status === 'PLANNED');
        const completedPlans = fPlans.filter(p => p.status === 'COMPLETED');

        // Order status distribution
        const orderStatusCounts = {};
        fOrders.forEach(o => {
            const label = STATUS_LABELS[o.status] || o.status;
            orderStatusCounts[label] = (orderStatusCounts[label] || 0) + 1;
        });
        const orderStatusData = Object.entries(orderStatusCounts).map(([name, value]) => ({ name, value }));

        // Monthly revenue chart (last 6 months)
        const monthlyRevenue = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = `${d.getMonth() + 1}월`;
            const rev = fOrders.filter(o => o.order_date?.startsWith(key)).reduce((s, o) => s + (o.total_amount || 0), 0);
            const cnt = fOrders.filter(o => o.order_date?.startsWith(key)).length;
            monthlyRevenue.push({ name: label, 매출: rev, 건수: cnt });
        }

        // Production status
        const planStatusCounts = {};
        fPlans.forEach(p => {
            const label = STATUS_LABELS[p.status] || p.status;
            planStatusCounts[label] = (planStatusCounts[label] || 0) + 1;
        });
        const planStatusData = Object.entries(planStatusCounts).map(([name, value]) => ({ name, value }));

        // Top customers
        const customerRevenue = {};
        fOrders.forEach(o => {
            const name = o.partner?.name || '알 수 없음';
            customerRevenue[name] = (customerRevenue[name] || 0) + (o.total_amount || 0);
        });
        const topCustomers = Object.entries(customerRevenue)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([name, revenue]) => ({ name, revenue }));

        // Recent orders (latest 5)
        const recentOrders = [...fOrders].sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '')).slice(0, 6);

        // Urgent items
        const urgentDeliveries = fOrders.filter(o => {
            if (o.status === 'DELIVERY_COMPLETED' || o.status === 'CANCELED') return false;
            if (!o.delivery_date) return false;
            const diff = (new Date(o.delivery_date) - now) / (1000 * 60 * 60 * 24);
            return diff <= 7 && diff >= -30;
        }).sort((a, b) => a.delivery_date.localeCompare(b.delivery_date)).slice(0, 5);

        return {
            totalOrders: fOrders.length,
            monthOrders: monthOrders.length,
            totalRevenue, monthRevenue,
            pendingOrders: pendingOrders.length,
            deliveredOrders: deliveredOrders.length,
            prodCompOrders: prodCompOrders.length,
            activePlans: activePlans.length,
            completedPlans: completedPlans.length,
            totalPlans: fPlans.length,
            pendingPurchaseCount: fPendingPurchase.length,
            pendingOutsourcingCount: fPendingOutsourcing.length,
            purchaseOrderCount: fPurchaseOrders.length,
            outsourcingOrderCount: fOutsourcingOrders.length,
            partnerCount: partners.length,
            productCount: products.length,
            staffCount: staff.filter(s => s.is_active).length,
            orderStatusData,
            planStatusData,
            monthlyRevenue,
            topCustomers,
            recentOrders,
            urgentDeliveries,
            // Enhanced stats
            activeStockProds: fStockProductions.filter(sp => sp.status === 'IN_PROGRESS' || sp.status === 'PENDING').length,
            unresolvedDefects: fDefects.filter(d => d.status !== 'RESOLVED').length,
            defectStatusData: (() => {
                const counts = {};
                fDefects.forEach(d => {
                    const label = STATUS_LABELS[d.status] || d.status;
                    counts[label] = (counts[label] || 0) + 1;
                });
                return Object.entries(counts).map(([name, value]) => ({ name, value }));
            })(),
            recentDefects: [...fDefects].sort((a, b) => (b.defect_date || '').localeCompare(a.defect_date || '')).slice(0, 5)
        };
    }, [orders, plans, purchaseOrders, outsourcingOrders, pendingPurchase, pendingOutsourcing, partners, products, staff, stockProductions, defects, groups, selectedMajorGroup, selectedMinorGroup]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-gray-400 text-sm">데이터를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">대시보드</h1>
                    <p className="text-sm text-gray-500 mt-0.5">{todayStr()}</p>
                </div>
                <div className="flex gap-3">
                    <select
                        className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                        value={selectedMajorGroup}
                        onChange={(e) => {
                            setSelectedMajorGroup(e.target.value);
                            setSelectedMinorGroup("");
                        }}
                    >
                        <option value="">전체 대그룹</option>
                        {groups.filter(g => g.type === 'MAJOR').map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>

                    <select
                        className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                        value={selectedMinorGroup}
                        onChange={(e) => setSelectedMinorGroup(e.target.value)}
                        disabled={!selectedMajorGroup}
                    >
                        <option value="">전체 소그룹</option>
                        {groups.filter(g => g.parent_id === parseInt(selectedMajorGroup)).map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => window.location.reload()}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg border border-gray-700 transition-colors"
                    >
                        ↻ 새로고침
                    </button>
                </div>
            </div>

            {/* ── KPI Cards Row 1: Core Metrics ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard title="총 수주" value={fmt(stats.totalOrders)} sub={`이번 달 ${stats.monthOrders}건`} icon={ShoppingCart} color="blue" onClick={() => navigate('/sales')} />
                <StatCard title="이번 달 매출" value={fmtWon(stats.monthRevenue)} sub={`누적 ${fmtWon(stats.totalRevenue)}`} icon={DollarSign} color="green" />
                <StatCard title="생산 진행" value={fmt(stats.activePlans)} sub={`총 ${stats.totalPlans}건 중`} icon={Factory} color="amber" onClick={() => navigate('/production')} />
                <StatCard title="미발주 (자재)" value={fmt(stats.pendingPurchaseCount)} sub="발주 대기" icon={Package} color={stats.pendingPurchaseCount > 0 ? 'red' : 'green'} onClick={() => navigate('/purchase')} />
                <StatCard title="미발주 (외주)" value={fmt(stats.pendingOutsourcingCount)} sub="외주 대기" icon={Truck} color={stats.pendingOutsourcingCount > 0 ? 'red' : 'green'} onClick={() => navigate('/outsourcing')} />
                <StatCard title="품질 결함" value={fmt(stats.unresolvedDefects)} sub="미해결 내역" icon={AlertTriangle} color={stats.unresolvedDefects > 0 ? 'red' : 'blue'} onClick={() => navigate('/quality')} />
                <StatCard title="납품 대기" value={fmt(stats.prodCompOrders)} sub={`납품완료 ${stats.deliveredOrders}건`} icon={Truck} color="purple" onClick={() => navigate('/inventory')} />
                <StatCard title="재고 생산" value={fmt(stats.activeStockProds)} sub="진행 중" icon={Layers} color="cyan" onClick={() => navigate('/inventory')} />
            </div>

            {/* ── KPI Cards Row 2: Master Data ── */}
            <div className="grid grid-cols-3 md:grid-cols-3 gap-3">
                <StatCard title="거래처" value={fmt(stats.partnerCount)} icon={Users} color="cyan" onClick={() => navigate('/basics')} />
                <StatCard title="제품 / BOM" value={fmt(stats.productCount)} icon={Layers} color="purple" onClick={() => navigate('/products')} />
                <StatCard title="재직 사원" value={fmt(stats.staffCount)} icon={ClipboardList} color="blue" onClick={() => navigate('/basics')} />
            </div>

            {/* ── Charts Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Monthly Revenue */}
                <ChartCard title="월별 매출 추이 (최근 6개월)" icon={TrendingUp} className="lg:col-span-2">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.monthlyRevenue}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                                <XAxis dataKey="name" stroke="#6B7280" tick={{ fontSize: 12 }} />
                                <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} tickFormatter={v => `₩${(v / 10000).toFixed(0)}만`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="매출" stroke="#3B82F6" strokeWidth={2.5} fill="url(#colorRev)" name="매출" />
                                <Bar dataKey="건수" fill="#6366F1" radius={[3, 3, 0, 0]} barSize={18} name="수주 건수" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Order Status Pie */}
                <ChartCard title="수주 상태 현황" icon={ShoppingCart}>
                    <div className="h-72 flex items-center justify-center">
                        {stats.orderStatusData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.orderStatusData} cx="50%" cy="50%"
                                        innerRadius={55} outerRadius={90} paddingAngle={3}
                                        dataKey="value" nameKey="name"
                                        stroke="none"
                                    >
                                        {stats.orderStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend formatter={(v) => <span className="text-gray-400 text-xs">{v}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-gray-500 text-sm">데이터 없음</p>
                        )}
                    </div>
                </ChartCard>
            </div>

            {/* ── Bottom Row: Tables ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Recent Orders */}
                <ChartCard title="최근 수주" icon={FileText} className="lg:col-span-2">
                    <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-xs text-gray-300">
                            <thead>
                                <tr className="border-b border-gray-700/50">
                                    <th className="text-left py-2 px-2 text-gray-500 font-medium">수주번호</th>
                                    <th className="text-left py-2 px-2 text-gray-500 font-medium">거래처</th>
                                    <th className="text-right py-2 px-2 text-gray-500 font-medium">금액</th>
                                    <th className="text-center py-2 px-2 text-gray-500 font-medium">상태</th>
                                    <th className="text-left py-2 px-2 text-gray-500 font-medium">수주일</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {stats.recentOrders.map(o => (
                                    <tr key={o.id} className="hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => navigate('/sales')}>
                                        <td className="py-2.5 px-2 font-mono text-[11px] text-blue-400">{o.order_no}</td>
                                        <td className="py-2.5 px-2 font-medium text-white">{o.partner?.name || '-'}</td>
                                        <td className="py-2.5 px-2 text-right text-emerald-400 tabular-nums">{fmtWon(o.total_amount)}</td>
                                        <td className="py-2.5 px-2 text-center"><StatusBadge status={o.status} /></td>
                                        <td className="py-2.5 px-2 text-gray-500">{o.order_date}</td>
                                    </tr>
                                ))}
                                {stats.recentOrders.length === 0 && (
                                    <tr><td colSpan="5" className="py-6 text-center text-gray-600">수주 데이터 없음</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </ChartCard>

                {/* Combined: Urgent Deliveries + Top Customers */}
                <div className="space-y-5">
                    {/* Urgent Deliveries */}
                    <ChartCard title="납기 임박 / 지연" icon={AlertTriangle}>
                        <div className="space-y-2">
                            {stats.urgentDeliveries.length > 0 ? stats.urgentDeliveries.map(o => {
                                const diff = Math.ceil((new Date(o.delivery_date) - new Date()) / (1000 * 60 * 60 * 24));
                                const isOverdue = diff < 0;
                                return (
                                    <div key={o.id}
                                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer hover:scale-[1.01] transition-transform
                                                    ${isOverdue ? 'bg-red-900/20 border-red-800/50' : 'bg-amber-900/15 border-amber-800/40'}`}
                                        onClick={() => navigate('/inventory')}
                                    >
                                        <div>
                                            <p className="font-medium text-white">{o.order_no}</p>
                                            <p className="text-gray-500">{o.partner?.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
                                                {isOverdue ? `${Math.abs(diff)}일 지연` : `D-${diff}`}
                                            </p>
                                            <p className="text-gray-500">{o.delivery_date}</p>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="py-8 text-center text-gray-600 text-sm">
                                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    납기 임박 건 없음
                                </div>
                            )}
                        </div>
                    </ChartCard>

                    {/* Top Customers */}
                    <ChartCard title="매출 TOP 5 거래처" icon={Users}>
                        <div className="space-y-2.5">
                            {stats.topCustomers.map((c, i) => {
                                const maxRev = stats.topCustomers[0]?.revenue || 1;
                                return (
                                    <div key={i} className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-300 font-medium truncate">{i + 1}. {c.name}</span>
                                            <span className="text-emerald-400 tabular-nums">{fmtWon(c.revenue)}</span>
                                        </div>
                                        <div className="w-full bg-gray-700/30 rounded-full h-1.5">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700"
                                                style={{ width: `${pct(c.revenue, maxRev)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                            {stats.topCustomers.length === 0 && (
                                <p className="py-4 text-center text-gray-600 text-sm">데이터 없음</p>
                            )}
                        </div>
                    </ChartCard>
                </div>
            </div>

            {/* ── Production + Procurement Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Production Status */}
                <ChartCard title="생산 현황 분포" icon={Factory}>
                    <div className="h-56 flex items-center justify-center">
                        {stats.planStatusData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.planStatusData} layout="vertical" margin={{ left: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                                    <XAxis type="number" stroke="#6B7280" tick={{ fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" stroke="#6B7280" tick={{ fontSize: 11 }} width={60} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="value" name="건수" radius={[0, 4, 4, 0]} barSize={14}>
                                        {stats.planStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="text-gray-500 text-sm">생산 데이터 없음</p>}
                    </div>
                </ChartCard>

                {/* Procurement Summary */}
                <ChartCard title="발주 현황 요약" icon={Package}>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <div
                            className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30 cursor-pointer hover:border-blue-600/40 transition-colors"
                            onClick={() => navigate('/purchase')}
                        >
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">자재 발주</p>
                            <p className="text-2xl font-bold text-white">{fmt(stats.purchaseOrderCount)}<span className="text-sm text-gray-500 ml-1">건</span></p>
                            <div className="mt-2 flex items-center gap-1 text-xs">
                                <span className={`w-2 h-2 rounded-full ${stats.pendingPurchaseCount > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
                                <span className="text-gray-400">미발주 {stats.pendingPurchaseCount}건</span>
                            </div>
                        </div>
                        <div
                            className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30 cursor-pointer hover:border-purple-600/40 transition-colors"
                            onClick={() => navigate('/outsourcing')}
                        >
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">외주 발주</p>
                            <p className="text-2xl font-bold text-white">{fmt(stats.outsourcingOrderCount)}<span className="text-sm text-gray-500 ml-1">건</span></p>
                            <div className="mt-2 flex items-center gap-1 text-xs">
                                <span className={`w-2 h-2 rounded-full ${stats.pendingOutsourcingCount > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
                                <span className="text-gray-400">미발주 {stats.pendingOutsourcingCount}건</span>
                            </div>
                        </div>
                        <div className="col-span-2 bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">전체 납품 진행률</p>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-gray-700/30 rounded-full h-2.5">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-700"
                                        style={{ width: `${pct(stats.deliveredOrders, stats.totalOrders)}%` }}
                                    />
                                </div>
                                <span className="text-sm font-bold text-white tabular-nums">{pct(stats.deliveredOrders, stats.totalOrders)}%</span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1">
                                납품완료 {stats.deliveredOrders}건 / 전체 {stats.totalOrders}건
                            </p>
                        </div>
                    </div>
                </ChartCard>
            </div>

            {/* ── Quality Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Quality Defect Status */}
                <ChartCard title="품질 결함 현황" icon={AlertTriangle}>
                    <div className="h-56 flex items-center justify-center">
                        {stats.defectStatusData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.defectStatusData} cx="50%" cy="50%"
                                        innerRadius={45} outerRadius={70} paddingAngle={3}
                                        dataKey="value" nameKey="name"
                                        stroke="none"
                                    >
                                        {stats.defectStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend formatter={(v) => <span className="text-gray-400 text-[10px]">{v}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <p className="text-gray-500 text-sm">결함 데이터 없음</p>}
                    </div>
                </ChartCard>

                {/* Recent Defects List */}
                <ChartCard title="최근 발생 품질 결함" icon={ClipboardList} className="lg:col-span-2">
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] text-gray-300">
                            <thead>
                                <tr className="border-b border-gray-700/50">
                                    <th className="text-left py-2 px-2 text-gray-500 font-medium">발생일</th>
                                    <th className="text-left py-2 px-2 text-gray-500 font-medium">품목 / 공정</th>
                                    <th className="text-left py-2 px-2 text-gray-500 font-medium">결함 사유</th>
                                    <th className="text-center py-2 px-2 text-gray-500 font-medium">상태</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {stats.recentDefects.map(d => (
                                    <tr key={d.id} className="hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => navigate('/quality')}>
                                        <td className="py-2 px-2 text-gray-500">{new Date(d.defect_date).toLocaleDateString()}</td>
                                        <td className="py-2 px-2">
                                            <div className="font-medium text-white">{d.plan_item?.product?.name || d.order?.items?.[0]?.product?.name || '-'}</div>
                                            <div className="text-[10px] text-gray-500">{d.plan_item?.process_name || '-'}</div>
                                        </td>
                                        <td className="py-2 px-2 text-gray-400 truncate max-w-[150px]">{d.defect_reason}</td>
                                        <td className="py-2 px-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${d.status === 'RESOLVED' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                                                {d.status === 'RESOLVED' ? '해결' : '미해결'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {stats.recentDefects.length === 0 && (
                                    <tr><td colSpan="4" className="py-8 text-center text-gray-600">결함 내역 없음</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </ChartCard>
            </div>
        </div>
    );
};

export default Dashboard;
