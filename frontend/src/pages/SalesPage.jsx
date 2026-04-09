import React, { useState, useEffect } from 'react';
import { safeParseJSON } from '../lib/utils';
import api from '../lib/api';
import { Plus, Search, FileText, Calendar, DollarSign, User, Package, Save, Download, Printer, X } from 'lucide-react';
import { cn } from '../lib/utils';
import Select from 'react-select';
import FileViewerModal from '../components/FileViewerModal';
import EstimateModal from '../components/EstimateModal';
import OrderModal from '../components/OrderModal';
import EstimateSheetModal from '../components/EstimateSheetModal';
import ResizableTable from '../components/ResizableTable';
import { formatCurrency } from '../utils/currency';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);

const ESTIMATE_COLS = [
    { key: 'expand', label: '', width: 32, noResize: true },
    { key: 'date',   label: '寃ъ쟻?쇱옄',  width: 110 },
    { key: 'partner',label: '嫄곕옒泥?,   width: 160 },
    { key: 'amount', label: '珥?湲덉븸',  width: 130 },
    { key: 'items',  label: '?덈ぉ ??,  width: 80 },
    { key: 'attach', label: '泥⑤??뚯씪', width: 90 },
    { key: 'note',   label: '鍮꾧퀬',    width: 200 },
    { key: 'actions',label: '愿由?,   width: 120, noResize: true },
];
const ORDER_COLS = [
    { key: 'expand',  label: '', width: 32, noResize: true },
    { key: 'order_no',label: '?섏＜踰덊샇',   width: 130 },
    { key: 'order_date',label:'?섏＜?쇱옄', width: 110 },
    { key: 'delivery',label: '?⑺뭹?붿껌??, width: 110 },
    { key: 'actual',  label: '???⑺뭹??, width: 110 },
    { key: 'partner', label: '嫄곕옒泥?,   width: 150 },
    { key: 'status',  label: '?곹깭',    width: 100 },
    { key: 'amount',  label: '珥?湲덉븸',  width: 130 },
    { key: 'items',   label: '?덈ぉ ??,  width: 80 },
    { key: 'attach',  label: '泥⑤??뚯씪', width: 90 },
    { key: 'note',    label: '鍮꾧퀬',    width: 150 },
    { key: 'actions', label: '愿由?,   width: 100, noResize: true },
];

const SalesPage = () => {
    const [activeTab, setActiveTab] = useState('estimates'); // 'estimates' | 'orders'
    const [estimates, setEstimates] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [partners, setPartners] = useState([]); // For filters

    // Modal States
    const [showEstimateModal, setShowEstimateModal] = useState(false);
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [editingEstimate, setEditingEstimate] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);

    // Sheet Modal
    const [showSheetModal, setShowSheetModal] = useState(false);
    const [sheetEstimate, setSheetEstimate] = useState(null);

    // Expand States
    const [expandedEstimates, setExpandedEstimates] = useState(new Set());
    const [expandedOrders, setExpandedOrders] = useState(new Set());

    const toggleEstimate = (id) => {
        const newSet = new Set(expandedEstimates);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedEstimates(newSet);
    };

    const toggleOrder = (id) => {
        const newSet = new Set(expandedOrders);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedOrders(newSet);
    };

    // File Viewer
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [viewingTargetId, setViewingTargetId] = useState(null); // Track ID for deletion
    const [viewingTargetType, setViewingTargetType] = useState('estimate'); // 'estimate' or 'order'

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedPartnerId, setSelectedPartnerId] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedMajorGroupId, setSelectedMajorGroupId] = useState("");
    const [groups, setGroups] = useState([]);


    useEffect(() => {
        fetchPartners();
        fetchGroups();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (activeTab === 'estimates') {
            fetchEstimates();
        } else {
            fetchOrders();
        }
    }, [activeTab, startDate, endDate, statusFilter, selectedPartnerId, searchQuery, selectedMajorGroupId]);

    // Note: Re-fetching on filter change

    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/', { params: { type: 'CUSTOMER' } });
            setPartners(res.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };
    
    const fetchGroups = async () => {
        try {
            const res = await api.get('/product/groups/');
            setGroups(res.data || []);
        } catch (error) {
            console.error("Failed to fetch groups", error);
        }
    };

    const fetchEstimates = async () => {
        setLoading(true);
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (statusFilter) params.status = statusFilter;
            if (selectedPartnerId) params.partner_id = selectedPartnerId;
            if (searchQuery) params.product_name = searchQuery;
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;


            const res = await api.get('/sales/estimates/', { params });
            setEstimates(res.data);
        } catch (error) {
            console.error("Failed to fetch estimates", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (statusFilter) params.status = statusFilter;
            if (selectedPartnerId) params.partner_id = selectedPartnerId;
            if (searchQuery) params.product_name = searchQuery;
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;


            const res = await api.get('/sales/orders/', { params });
            setOrders(res.data);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (estimate) => {
        setEditingEstimate(estimate);
        setShowEstimateModal(true);
    };

    const handleDelete = async (estimateId) => {
        if (!window.confirm("?뺣쭚濡???젣?섏떆寃좎뒿?덇퉴?")) return;
        try {
            await api.delete(`/sales/estimates/${estimateId}`);
            alert("??젣?섏뿀?듬땲??");
            fetchEstimates();
        } catch (error) {
            console.error("Delete failed", error);
            alert("??젣 ?ㅽ뙣");
        }
    };

    const handleEditOrder = (order) => {
        setEditingOrder(order);
        setShowOrderModal(true);
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm("?뺣쭚濡???젣?섏떆寃좎뒿?덇퉴? 愿???앹궛 怨꾪쉷???④퍡 ??젣?⑸땲??")) return;
        try {
            await api.delete(`/sales/orders/${orderId}`);
            alert("??젣?섏뿀?듬땲??");
            fetchOrders();
        } catch (error) {
            console.error("Delete failed", error);
            alert("??젣 ?ㅽ뙣");
        }
    };

    const handleDeleteAttachment = async (targetId, indexToRemove) => {
        if (!targetId) return;
        if (!window.confirm("?뺣쭚濡???泥⑤??뚯씪????젣?섏떆寃좎뒿?덇퉴? (???묒뾽? ?섎룎由????놁뒿?덈떎)")) return;

        try {
            const isEstimate = viewingTargetType === 'estimate';
            const endpoint = isEstimate ? `/sales/estimates/${targetId}` : `/sales/orders/${targetId}`;
            const targetList = isEstimate ? estimates : orders;
            const setList = isEstimate ? setEstimates : setOrders;

            const item = targetList.find(i => i.id === targetId);
            if (!item) return;

            const files = safeParseJSON(item.attachment_file, []);
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== indexToRemove);

            const res = await api.put(endpoint, {
                attachment_file: newFiles
            });

            const updatedItem = res.data;
            setList(prev => prev.map(i => i.id === targetId ? updatedItem : i));

            if (viewingTargetId === targetId) {
                setViewingFiles(newFiles);
                if (newFiles.length === 0) setShowFileModal(false);
            }

            alert("泥⑤??뚯씪????젣?섏뿀?듬땲??");
        } catch (error) {
            console.error("Failed to delete attachment", error);
            alert("泥⑤??뚯씪 ??젣 ?ㅽ뙣");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">?곸뾽 愿由?/h1>
                <button
                    onClick={() => activeTab === 'estimates' ? setShowEstimateModal(true) : setShowOrderModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 text-white font-medium"
                >
                    <Plus className="w-4 h-4" />
                    {activeTab === 'estimates' ? '?좉퇋 寃ъ쟻 ?깅줉' : '?좉퇋 ?섏＜ ?깅줉'}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700">
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'estimates' ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('estimates')}
                >
                    寃ъ쟻 愿由?
                    {activeTab === 'estimates' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                    )}
                </button>
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'orders' ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('orders')}
                >
                    ?섏＜ 愿由?
                    {activeTab === 'orders' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                    )}
                </button>
            </div>

            {/* Content & Filters */}
            <Card className="p-4 flex flex-wrap gap-4 items-end mb-4">
                <div className="flex-1 min-w-[150px] space-y-1">
                    <label className="text-xs text-gray-400">?ъ뾽遺</label>
                    <Select
                        isClearable
                        placeholder="?꾩껜 ?ъ뾽遺"
                        options={groups.filter(g => g.type === 'MAJOR').map(g => ({ value: g.id, label: g.name }))}
                        value={groups.find(g => g.id === selectedMajorGroupId) ? { value: selectedMajorGroupId, label: groups.find(g => g.id === selectedMajorGroupId).name } : null}
                        onChange={(opt) => setSelectedMajorGroupId(opt ? opt.value : "")}
                        styles={{
                            control: (base) => ({
                                ...base,
                                backgroundColor: '#374151',
                                borderColor: '#4b5563',
                                color: 'white',
                                fontSize: '0.875rem'
                            }),
                            input: (base) => ({ ...base, color: 'white' }),
                            placeholder: (base) => ({ ...base, color: '#9ca3af' }),
                            menu: (base) => ({ ...base, backgroundColor: '#1f2937', color: 'white', zIndex: 99 }),
                            option: (base, state) => ({
                                ...base,
                                backgroundColor: state.isFocused ? '#374151' : 'transparent',
                                color: 'white'
                            }),
                            singleValue: (base) => ({ ...base, color: 'white' })
                        }}
                    />
                </div>
                <div className="flex-1 min-w-[200px] space-y-1">
                    <label className="text-xs text-gray-400">嫄곕옒泥?寃??/label>
                    <Select
                        isClearable
                        isSearchable
                        placeholder="嫄곕옒泥??좏깮 ?먮뒗 ??댄븨 寃??.."
                        noOptionsMessage={() => "嫄곕옒泥섍? ?놁뒿?덈떎"}
                        options={partners.map(p => ({ value: p.id, label: p.name }))}
                        value={partners.find(p => p.id === selectedPartnerId) ? { value: selectedPartnerId, label: partners.find(p => p.id === selectedPartnerId).name } : null}
                        onChange={(opt) => setSelectedPartnerId(opt ? opt.value : "")}
                        styles={{
                            control: (base) => ({
                                ...base,
                                backgroundColor: '#374151',
                                borderColor: '#4b5563',
                                color: 'white',
                                fontSize: '0.875rem'
                            }),
                            input: (base) => ({ ...base, color: 'white' }),
                            placeholder: (base) => ({ ...base, color: '#9ca3af' }),
                            menu: (base) => ({ ...base, backgroundColor: '#1f2937', color: 'white', zIndex: 99 }),
                            option: (base, state) => ({
                                ...base,
                                backgroundColor: state.isFocused ? '#374151' : 'transparent',
                                color: 'white'
                            }),
                            singleValue: (base) => ({ ...base, color: 'white' })
                        }}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">?덈챸/洹쒓꺽</label>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="寃?됱뼱 ?낅젰..."
                            className="w-full bg-gray-700 border-gray-600 rounded text-white pl-9 pr-3 py-2 text-sm h-[38px]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">?쒖옉??/label>
                    <input
                        type="date"
                        className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">醫낅즺??/label>
                    <input
                        type="date"
                        className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>

                {activeTab === 'orders' && (
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">?곹깭</label>
                        <select
                            className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">?꾩껜 (Status)</option>
                            <option value="PENDING">?湲?/option>
                            <option value="CONFIRMED">?뺤젙</option>
                            <option value="PRODUCTION_COMPLETED">?앹궛 ?꾨즺</option>
                            <option value="PARTIALLY_DELIVERED">遺遺??⑺뭹</option>
                            <option value="DELIVERED">?⑺뭹 ?꾨즺</option>
                            <option value="CANCELLED">痍⑥냼</option>
                        </select>
                    </div>
                )}
            </Card>

            <Card className="p-0 overflow-hidden min-h-[500px]">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">濡쒕뵫 以?..</div>
                ) : (
                    <div className="overflow-x-auto">
                        <ResizableTable
                            columns={activeTab === 'estimates' ? ESTIMATE_COLS : ORDER_COLS}
                            className="text-left text-sm text-gray-400"
                            theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                            thClassName="px-4 py-3"
                        >
                            {activeTab === 'estimates' ? (
                                estimates.map((est) => (
                                    <React.Fragment key={est.id}>
                                        <tr
                                            className="hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300 border-b border-gray-700/50"
                                            onClick={() => toggleEstimate(est.id)}
                                            onDoubleClick={() => handleEdit(est)}
                                        >
                                            <td className="px-2 py-4 text-center">{expandedEstimates.has(est.id) ? '?? : '??}</td>
                                            <td className="px-4 py-4 truncate">{est.estimate_date}</td>
                                            <td className="px-4 py-4 font-medium text-white truncate">{est.partner?.name}</td>
                                            <td className="px-4 py-4 truncate">{formatCurrency(est.total_amount, est.items?.[0]?.currency || 'KRW')}</td>
                                            <td className="px-4 py-4 truncate">{est.items?.length || 0} 嫄?/td>
                                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                {(() => {
                                                    const files = safeParseJSON(est.attachment_file, []);
                                                    if (Array.isArray(files) && files.length > 0) {
                                                        return (
                                                            <button onClick={(e) => { e.stopPropagation(); setViewingFiles(files); setViewingTargetId(est.id); setViewingTargetType('estimate'); setShowFileModal(true); }} className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/40 transition-colors" title="泥⑤??뚯씪 蹂닿린/?ㅼ슫濡쒕뱶">
                                                                <FileText className="w-3 h-3" />{files.length}媛?
                                                            </button>
                                                        );
                                                    }
                                                    return <span className="text-gray-600 text-xs">-</span>;
                                                })()}
                                            </td>
                                            <td className="px-4 py-4 truncate">{est.note}</td>
                                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => { setSheetEstimate(est); setShowSheetModal(true); }} className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded" title="寃ъ쟻???몄뇙"><Printer className="w-4 h-4" /></button>
                                                    <button onClick={() => handleEdit(est)} className="text-blue-400 hover:underline text-xs">?섏젙</button>
                                                    <button onClick={() => handleDelete(est.id)} className="text-red-400 hover:underline text-xs ml-1">??젣</button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedEstimates.has(est.id) && (
                                            <tr className="bg-gray-800/50">
                                                <td colSpan={ESTIMATE_COLS.length} className="px-6 py-4">
                                                    <div className="ml-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                                                        <h4 className="text-sm font-semibold mb-2 text-gray-300">寃ъ쟻 ?덈ぉ ?곸꽭</h4>
                                                        <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded">
                                                            <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                                                <tr>
                                                                    <th className="px-3 py-2 text-left">?덈ぉ紐?/th>
                                                                    <th className="px-3 py-2 text-left">洹쒓꺽</th>
                                                                    <th className="px-3 py-2 text-right">?섎웾</th>
                                                                    <th className="px-3 py-2 text-right">?④?</th>
                                                                    <th className="px-3 py-2 text-right">怨듦툒媛??/th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-800">
                                                                {est.items?.map((item, idx) => (
                                                                    <tr key={idx} className="hover:bg-gray-800/30 border-b border-gray-800">
                                                                        <td className="px-3 py-2">{item.product?.name || item.product_name || item.name}</td>
                                                                        <td className="px-3 py-2">{item.specification || item.product?.specification || '-'}</td>
                                                                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                                                                        <td className="px-3 py-2 text-right">{formatCurrency(item.unit_price, item.currency || 'KRW')}</td>
                                                                        <td className="px-3 py-2 text-right">{formatCurrency(item.quantity * item.unit_price, item.currency || 'KRW')}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            ) : (
                                orders.map((ord) => (
                                    <React.Fragment key={ord.id}>
                                        <tr
                                            className="hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300 border-b border-gray-700/50"
                                            onClick={() => toggleOrder(ord.id)}
                                            onDoubleClick={() => handleEditOrder(ord)}
                                        >
                                            <td className="px-2 py-4 text-center">{expandedOrders.has(ord.id) ? '?? : '??}</td>
                                            <td className="px-4 py-4 font-mono text-xs text-gray-300 truncate">{ord.order_no}</td>
                                            <td className="px-4 py-4 truncate">{ord.order_date}</td>
                                            <td className="px-4 py-4 text-orange-400 truncate">{ord.delivery_date || '-'}</td>
                                            <td className="px-4 py-4 text-emerald-400 truncate">{ord.actual_delivery_date || '-'}</td>
                                            <td className="px-4 py-4 font-medium text-white truncate">{ord.partner?.name}</td>
                                            <td className="px-4 py-4">
                                                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", ord.status === 'PENDING' ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700' : (ord.status === 'CONFIRMED' || ord.status === 'PRODUCTION_COMPLETED') ? 'bg-blue-900/50 text-blue-400 border border-blue-700' : ord.status === 'PARTIALLY_DELIVERED' ? 'bg-orange-900/50 text-orange-400 border border-orange-700' : (ord.status === 'DELIVERED' || ord.status === 'DELIVERY_COMPLETED') ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-gray-800 text-gray-400')}>
                                                    {ord.status === 'PARTIALLY_DELIVERED' ? '遺遺꾨궔?? : (ord.status === 'DELIVERED' || ord.status === 'DELIVERY_COMPLETED') ? '?⑺뭹?꾨즺' : ord.status === 'PRODUCTION_COMPLETED' ? '?앹궛?꾨즺' : ord.status === 'PENDING' ? '?湲? : ord.status === 'CONFIRMED' ? '?뺤젙' : ord.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 truncate">{formatCurrency(ord.total_amount, ord.items?.[0]?.currency || 'KRW')}</td>
                                            <td className="px-4 py-4 truncate">{ord.items?.length || 0} 嫄?/td>
                                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                {(() => {
                                                    const files = safeParseJSON(ord.attachment_file, []);
                                                    if (Array.isArray(files) && files.length > 0) {
                                                        return <button onClick={(e) => { e.stopPropagation(); setViewingFiles(files); setViewingTargetId(ord.id); setViewingTargetType('order'); setShowFileModal(true); }} className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/40 transition-colors" title="泥⑤??뚯씪 蹂닿린/?ㅼ슫濡쒕뱶"><FileText className="w-3 h-3" />{files.length}媛?/button>;
                                                    }
                                                    return <span className="text-gray-600 text-xs">-</span>;
                                                })()}
                                            </td>
                                            <td className="px-4 py-4 truncate">{ord.note}</td>
                                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleEditOrder(ord)} className="text-blue-400 hover:underline text-xs">?섏젙</button>
                                                    <button onClick={() => handleDeleteOrder(ord.id)} className="text-red-400 hover:underline text-xs">??젣</button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedOrders.has(ord.id) && (
                                            <tr className="bg-gray-800/50">
                                                <td colSpan={ORDER_COLS.length} className="px-6 py-4">
                                                    <div className="ml-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                                                        <h4 className="text-sm font-semibold mb-2 text-gray-300">?섏＜ ?덈ぉ ?곸꽭</h4>
                                                        <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded">
                                                            <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                                                <tr>
                                                                    <th className="px-3 py-2 text-left">?덈ぉ紐?/th>
                                                                    <th className="px-3 py-2 text-left">洹쒓꺽</th>
                                                                    <th className="px-3 py-2 text-right">?섎웾</th>
                                                                    <th className="px-3 py-2 text-right">?④?</th>
                                                                    <th className="px-3 py-2 text-right">怨듦툒媛??/th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-800">
                                                                {ord.items?.map((item, idx) => (
                                                                    <tr key={idx} className="hover:bg-gray-800/30 border-b border-gray-800">
                                                                        <td className="px-3 py-2">{item.product?.name || item.product_name || item.name}</td>
                                                                        <td className="px-3 py-2">{item.specification || item.product?.specification || '-'}</td>
                                                                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                                                                        <td className="px-3 py-2 text-right">{formatCurrency(item.unit_price, item.currency || 'KRW')}</td>
                                                                        <td className="px-3 py-2 text-right">{formatCurrency(item.quantity * item.unit_price, item.currency || 'KRW')}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                            {(!loading && ((activeTab === 'estimates' && estimates.length === 0) || (activeTab === 'orders' && orders.length === 0))) && (
                                <tr><td colSpan="12" className="px-6 py-12 text-center text-gray-500">?곗씠?곌? ?놁뒿?덈떎.</td></tr>
                            )}
                        </ResizableTable>
                    </div>
                )}
            </Card>

            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => {
                    setShowFileModal(false);
                    setViewingTargetId(null);
                }}
                files={viewingFiles}
                onDeleteFile={(index) => handleDeleteAttachment(viewingTargetId, index)}
            />

            <EstimateModal
                isOpen={showEstimateModal}
                onClose={() => {
                    setShowEstimateModal(false);
                    setEditingEstimate(null);
                }}
                onSuccess={fetchEstimates}
                partners={partners}
                estimateToEdit={editingEstimate}
            />

            <OrderModal
                isOpen={showOrderModal}
                onClose={() => {
                    setShowOrderModal(false);
                    setEditingOrder(null);
                }}
                onSuccess={fetchOrders}
                partners={partners}
                orderToEdit={editingOrder}
            />

            <EstimateSheetModal
                isOpen={showSheetModal}
                onClose={() => {
                    setShowSheetModal(false);
                    setSheetEstimate(null);
                }}
                estimate={sheetEstimate}
                onSave={fetchEstimates}
            />
        </div>
    );
};

export default SalesPage;

