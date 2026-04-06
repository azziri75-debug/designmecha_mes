import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, TextField, Grid, Divider, CircularProgress, IconButton, Tooltip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { Search, Plus, Printer, FileText, CheckCircle2, Clock, AlertCircle, TrendingUp, Package, Truck, ChevronDown, ChevronRight, FileDown } from 'lucide-react';
import api from '../lib/api';
import ResizableTableCell from '../components/ResizableTableCell';
import DeliveryModal from '../components/DeliveryModal';
import FileViewerModal from '../components/FileViewerModal';
import TransactionStatementModal from '../components/TransactionStatementModal';

const DeliveryPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hideCompleted, setHideCompleted] = useState(false);

    // 👇 [수정할 코드] 상태값을 DELIVERY_COMPLETED 로 정확히 타겟팅 👇
    const displayedOrders = hideCompleted 
        ? orders.filter(o => o.status !== 'DELIVERY_COMPLETED' && o.status !== 'DELIVERED' && o.status !== 'COMPLETED') 
        : orders;

    const [columnWidths, setColumnWidths] = useState({
        customer: 150,
        product: 200,
        order_date: 120,
        due_date: 120,
        total_items: 100,
        order_amount: 150,
        deliv_amount: 150,
        status: 100,
        actions: 100,
        details: 80
    });

    const handleResize = (column, newWidth) => {
        setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
    };
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [expandedOrder, setExpandedOrder] = useState(null);

    // File Viewer
    const [showFileModal, setShowFileModal] = useState(false);
    const [currentFiles, setCurrentFiles] = useState([]);

    // Transaction Statement Modal
    const [showStatementModal, setShowStatementModal] = useState(false);
    const [statementData, setStatementData] = useState(null);

    // Delivery History Edit Modal
    const [editHistoryModal, setEditHistoryModal] = useState(null); // { id, delivery_date, note }

    // Filters
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [dateType, setDateType] = useState('order'); // 'order' or 'delivery'
    const [partnerFilter, setPartnerFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selectedMajorGroupId, setSelectedMajorGroupId] = useState('');
    const [groups, setGroups] = useState([]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateRange.start) params.append('start_date', dateRange.start);
            if (dateRange.end) params.append('end_date', dateRange.end);
            params.append('date_type', dateType);
            if (partnerFilter) params.append('partner_name', partnerFilter);
            if (statusFilter !== 'ALL') params.append('status', statusFilter);
            if (selectedMajorGroupId) params.append('major_group_id', selectedMajorGroupId);

            const response = await api.get(`/sales/delivery-status?${params.toString()}`);
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        } finally {
            setLoading(false);
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

    useEffect(() => {
        fetchOrders();
        fetchGroups();
    }, [selectedMajorGroupId]);

    const handleDeliveryClick = (order) => {
        setSelectedOrder(order);
        setShowDeliveryModal(true);
    };

    const handleExpandToggle = (orderId) => {
        setExpandedOrder(expandedOrder === orderId ? null : orderId);
    };

    const handleDeleteDelivery = async (dhId) => {
        if (!window.confirm('이 납품 이력을 삭제하시겠습니까?\n\n삭제하면 수주의 납품 수량이 원래대로 복원됩니다.')) return;
        try {
            await api.delete(`/sales/delivery-histories/${dhId}`);
            fetchOrders();
        } catch (err) {
            alert('삭제 실패: ' + (err?.response?.data?.detail || err.message));
        }
    };

    const handleSaveDeliveryEdit = async () => {
        if (!editHistoryModal) return;
        try {
            await api.put(`/sales/delivery-histories/${editHistoryModal.id}`, {
                note: editHistoryModal.note,
                delivery_date: editHistoryModal.delivery_date,
                items: editHistoryModal.items.map(it => ({
                    order_item_id: it.order_item_id,
                    quantity: it.quantity
                }))
            });
            setEditHistoryModal(null);
            fetchOrders();
        } catch (err) {
            alert('수정 실패: ' + (err?.response?.data?.detail || err.message));
        }
    };

    return (
        <div className="min-h-screen bg-black text-gray-100 p-8">
            <div className="w-full space-y-8">
                {/* Header Section */}
                <div className="flex justify-between items-end">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-lg">
                                <Truck className="w-8 h-8 text-blue-500" />
                            </div>
                            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">
                                납품현황 및 관리
                            </h1>
                        </div>
                        <p className="text-gray-500 font-medium">Delivery & Shipments Management System</p>
                    </div>

                    {/* Stats Cards */}
                    <div className="flex gap-4">
                        <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl min-w-[200px]">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Active Orders</p>
                            <div className="flex items-center justify-between">
                                <span className="text-2xl font-black text-white">{orders.length}</span>
                                <Package className="w-5 h-5 text-blue-500" />
                            </div>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl min-w-[200px]">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Delivered Today</p>
                            <div className="flex items-center justify-between">
                                <span className="text-2xl font-black text-green-500">0</span>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter section */}
                <Card sx={{ bgcolor: '#111', border: '1px solid #333', borderRadius: '1.5rem', p: 3 }}>
                    <Grid container spacing={4} alignItems="center">
                        <Grid item xs={12} md={2}>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Business Unit</label>
                                <select
                                    value={selectedMajorGroupId}
                                    onChange={(e) => setSelectedMajorGroupId(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-all font-bold"
                                >
                                    <option value="">전체 사업부</option>
                                    {groups.filter(g => g.type === 'MAJOR').map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <TextField
                                label="고객사명"
                                fullWidth
                                size="small"
                                value={partnerFilter}
                                onChange={(e) => setPartnerFilter(e.target.value)}
                                sx={{
                                    '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: '#333' } },
                                    '& .MuiInputLabel-root': { color: '#666' }
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <div className="flex items-center gap-3">
                                <select
                                    value={dateType}
                                    onChange={(e) => setDateType(e.target.value)}
                                    className="bg-gray-900 border border-gray-800 rounded-xl px-2 py-2 text-xs text-gray-400 focus:outline-none focus:border-blue-500 transition-all font-bold"
                                >
                                    <option value="order">수주일 기준</option>
                                    <option value="delivery">납품일 기준</option>
                                </select>
                                <TextField
                                    type="date"
                                    size="small"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                    sx={{ '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: '#333' } } }}
                                />
                                <span className="text-gray-600">to</span>
                                <TextField
                                    type="date"
                                    size="small"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                    sx={{ '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: '#333' } } }}
                                />
                            </div>
                        </Grid>
                        <Grid item xs={12} md={4} className="flex justify-end gap-4 items-center">
                            {/* 👇 체크박스 UI 추가 👇 */}
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-300 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={hideCompleted} 
                                    onChange={(e) => setHideCompleted(e.target.checked)} 
                                    className="w-4 h-4 rounded border-gray-600 text-blue-500 bg-gray-950 focus:ring-blue-500"
                                />
                                납품완료 숨기기
                            </label>
                            
                            <Button
                                variant="contained"
                                onClick={fetchOrders}
                                startIcon={<Search className="w-4 h-4" />}
                                sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, borderRadius: '0.75rem', px: 4, py: 1 }}
                            >
                                SEARCH
                            </Button>
                        </Grid>
                    </Grid>
                </Card>

                {/* Orders List */}
                <Card sx={{ bgcolor: '#0a0a0a', border: '1px solid #222', borderRadius: '2rem', overflow: 'hidden' }}>
                    {loading ? (
                        <div className="p-20 flex flex-col items-center justify-center gap-4">
                            <CircularProgress sx={{ color: '#3b82f6' }} />
                            <p className="text-gray-500 animate-pulse font-black italic tracking-widest text-xs">PROCESSING DATA...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-900/50 border-b border-gray-800">
                                        <ResizableTableCell width={columnWidths.customer} onResize={(w) => handleResize('customer', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Customer</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.product} onResize={(w) => handleResize('product', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Product Name</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.order_date} onResize={(w) => handleResize('order_date', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Order Date</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.due_date} onResize={(w) => handleResize('due_date', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Due Date</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.total_items} onResize={(w) => handleResize('total_items', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Total Items</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.order_amount} onResize={(w) => handleResize('order_amount', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Order Amount</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.deliv_amount} onResize={(w) => handleResize('deliv_amount', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-blue-400">Deliv. Amount</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.status} onResize={(w) => handleResize('status', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Status</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.actions} onResize={(w) => handleResize('actions', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-center">Actions</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.details} onResize={(w) => handleResize('details', w)} className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-right">Details</ResizableTableCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50">
                                    {displayedOrders.map((ord) => (
                                        <React.Fragment key={ord.id}>
                                            <tr className={`group transition-all duration-300 hover:bg-gray-900/40 ${expandedOrder === ord.id ? 'bg-gray-900/60' : ''}`}>
                                                <td className="px-6 py-5">
                                                    <div className="font-bold text-gray-200">{ord.partner?.name}</div>
                                                    <div className="text-[10px] text-gray-600 font-mono mt-0.5">{ord.order_no}</div>
                                                </td>
                                                <td className="px-6 py-5 text-sm font-bold text-gray-300">
                                                    {(() => {
                                                        const pNames = ord.items?.map(it => it.product?.name).filter(Boolean);
                                                        if (!pNames || pNames.length === 0) return '-';
                                                        const first = pNames[0];
                                                        const cnt = pNames.length - 1;
                                                        return cnt > 0 ? `${first} 외 ${cnt}건` : first;
                                                    })()}
                                                </td>
                                                <td className="px-6 py-5 text-sm font-mono text-gray-400">{ord.order_date}</td>
                                                <td className="px-6 py-5 text-sm font-mono text-blue-400 font-bold">{ord.delivery_date || '-'}</td>
                                                <td className="px-6 py-5 text-sm text-gray-400">{ord.items?.length || 0}</td>
                                                <td className="px-6 py-5">
                                                    <span className="text-sm font-black text-white">{(ord.total_amount || 0).toLocaleString()}</span>
                                                    <span className="text-[10px] text-gray-500 ml-1 font-bold">원</span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="text-sm font-black text-blue-400">{(ord.total_delivered_amount || 0).toLocaleString()}</span>
                                                    <span className="text-[10px] text-gray-500 ml-1 font-bold">원</span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    {/* 👇 상태 렌더링 배지 로직도 DELIVERY_COMPLETED를 인식하도록 수정 👇 */}
                                                    <div className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-black italic tracking-tighter ${
                                                        (ord.status === 'COMPLETED' || ord.status === 'DELIVERY_COMPLETED' || ord.status === 'DELIVERED') ? 'bg-green-500/10 text-green-500' :
                                                        (ord.status === 'PARTIALLY_DELIVERED' || ord.status === 'PRODUCTION_COMPLETED' || ord.status === 'CONFIRMED') ? 'bg-blue-500/10 text-blue-500' :
                                                        'bg-gray-800 text-gray-500'
                                                    }`}>
                                                        { (ord.status === 'DELIVERY_COMPLETED' || ord.status === 'DELIVERED') ? '납품완료' : 
                                                          ord.status === 'PARTIALLY_DELIVERED' ? '부분납품' :
                                                          ord.status === 'PRODUCTION_COMPLETED' ? '생산완료' :
                                                          ord.status === 'CONFIRMED' ? '확정' : ord.status}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <button
                                                        onClick={() => handleDeliveryClick(ord)}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-black italic shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
                                                    >
                                                        DELIVERY
                                                    </button>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleExpandToggle(ord.id)}
                                                        sx={{ color: expandedOrder === ord.id ? '#3b82f6' : '#555' }}
                                                    >
                                                        {expandedOrder === ord.id ? <ChevronDown /> : <ChevronRight />}
                                                    </IconButton>
                                                </td>
                                            </tr>

                                            {/* Expanded Detail Panel */}
                                            {expandedOrder === ord.id && (
                                                <tr>
                                                    <td colSpan="10" className="px-8 py-0 bg-gray-950/30">
                                                        <div className="py-6 grid grid-cols-2 gap-8 border-t border-gray-800/50">
                                                            {/* Items Detail Table */}
                                                            <div className="bg-gray-950/50 rounded-xl border border-gray-700 p-4 shadow-xl">
                                                                <h4 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                                                                    <Package className="w-4 h-4" /> 수주 품목 및 납품 잔량
                                                                </h4>
                                                                <table className="w-full text-xs text-gray-400">
                                                                    <thead>
                                                                        <tr className="border-b border-gray-800 text-gray-500">
                                                                            <th className="py-2 text-left">품목명</th>
                                                                            <th className="py-2 text-left">규격</th>
                                                                            <th className="py-2 text-right">수주량</th>
                                                                            <th className="py-2 text-right">기납품</th>
                                                                            <th className="py-2 text-right text-orange-400">잔량</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-800/50">
                                                                        {ord.items?.map(it => (
                                                                            <tr key={it.id}>
                                                                                <td className="py-2.5 font-medium text-gray-300">
                                                                                    {it.product?.name}
                                                                                </td>
                                                                                <td className="py-2.5 text-gray-400">
                                                                                    {it.specification || it.product?.specification || "-"}
                                                                                </td>
                                                                                <td className="py-2.5 text-right">{it.quantity?.toLocaleString()}</td>
                                                                                <td className="py-2.5 text-right text-green-500">{(it.delivered_quantity || 0).toLocaleString()}</td>
                                                                                <td className="py-2.5 text-right font-bold text-orange-400">{(it.quantity - (it.delivered_quantity || 0)).toLocaleString()}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                            {/* Delivery History Section */}
                                                            <div className="bg-gray-950/50 rounded-xl border border-gray-700 p-4 shadow-xl">
                                                                <h4 className="text-sm font-bold text-green-400 mb-3 flex items-center gap-2">
                                                                    <Truck className="w-4 h-4" /> 납품 이력 (Delivery History)
                                                                </h4>
                                                                {ord.delivery_histories?.length > 0 ? (
                                                                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-800">
                                                                        {ord.delivery_histories.map((dh) => (
                                                                            <div key={dh.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex justify-between items-center group">
                                                                                <div className="w-full">
                                                                                    <div className="flex justify-between items-center mb-2">
                                                                                        <div>
                                                                                            <div className="text-xs font-bold text-gray-300">{dh.delivery_date}</div>
                                                                                            <div className="text-[10px] text-gray-500 font-mono italic">{dh.delivery_no}</div>
                                                                                        </div>
                                                                                        <div className="text-right">
                                                                                            <div className="text-[10px] text-gray-400">총 납품액</div>
                                                                                            <div className="text-sm font-black text-blue-400">₩{(dh.delivery_amount || 0).toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                    {/* Minimal Items List */}
                                                                                    <div className="bg-black/20 rounded border border-gray-800/50 p-2 text-[10px] text-gray-400">
                                                                                        {dh.items?.map(it => (
                                                                                            <div key={it.id} className="flex justify-between py-0.5">
                                                                                                <span className="truncate flex-1">{it.order_item?.product?.name}</span>
                                                                                                <span className="w-12 text-right">{it.quantity?.toLocaleString()}개</span>
                                                                                                <span className="w-20 text-right font-bold text-gray-300">₩{(it.delivery_amount || 0).toLocaleString()}</span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex gap-2">
                                                                                    <button
                                                                                        className="text-[10px] bg-blue-900/30 text-blue-400 border border-blue-900/50 px-2 py-1 rounded hover:bg-blue-900/50 flex items-center gap-1"
                                                                                        onClick={() => {
                                                                                            setStatementData({
                                                                                                id: dh.id,
                                                                                                delivery_no: dh.delivery_no,
                                                                                                delivery_date: dh.delivery_date,
                                                                                                order_no: ord.order_no,
                                                                                                partner: ord.partner,
                                                                                                items: (dh.items || []).map(it => ({
                                                                                                    date: dh.delivery_date,
                                                                                                    item_name: it.order_item?.product?.name || '',
                                                                                                    product: it.order_item?.product || {},
                                                                                                    quantity: it.quantity,
                                                                                                    unit_price: it.order_item?.unit_price || 0,
                                                                                                })),
                                                                                                ...(dh.statement_json || {}),
                                                                                            });
                                                                                            setShowStatementModal(true);
                                                                                        }}
                                                                                    >
                                                                                        <FileText className="w-3 h-3" /> 명세서
                                                                                    </button>
                                                                                    <button
                                                                                        className="text-[10px] bg-yellow-900/30 text-yellow-400 border border-yellow-900/50 px-2 py-1 rounded hover:bg-yellow-900/50 flex items-center gap-1"
                                                                                        onClick={() => setEditHistoryModal({
                                                                                            id: dh.id,
                                                                                            delivery_date: dh.delivery_date || '',
                                                                                            note: dh.note || '',
                                                                                            items: dh.items.map(it => ({ ...it })) // clone items for editing
                                                                                        })}
                                                                                    >
                                                                                        ✏️ 수정
                                                                                    </button>
                                                                                    <button
                                                                                        className="text-[10px] bg-red-900/30 text-red-400 border border-red-900/50 px-2 py-1 rounded hover:bg-red-900/50 flex items-center gap-1"
                                                                                        onClick={() => handleDeleteDelivery(dh.id)}
                                                                                    >
                                                                                        🗑 삭제
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-center py-8 text-gray-600 text-xs italic">
                                                                        납품 이력이 없습니다.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    {displayedOrders.length === 0 && (
                                        <tr>
                                            <td colSpan="10" className="px-6 py-12 text-center text-gray-500">
                                                데이터가 없습니다.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            {showDeliveryModal && selectedOrder && (
                <DeliveryModal
                    isOpen={showDeliveryModal}
                    onClose={() => {
                        setShowDeliveryModal(false);
                        setSelectedOrder(null);
                    }}
                    onSuccess={fetchOrders}
                    order={selectedOrder}
                />
            )}
            {showFileModal && (
                <FileViewerModal
                    open={showFileModal}
                    onClose={() => setShowFileModal(false)}
                    files={currentFiles}
                    title="수주 관련 문서"
                />
            )}

            {showStatementModal && statementData && (
                <TransactionStatementModal
                    open={showStatementModal}
                    onClose={() => {
                        setShowStatementModal(false);
                        setStatementData(null);
                    }}
                    data={statementData}
                    onSuccess={() => {
                        fetchOrders();
                        alert('✅ 명세서가 첨부되었습니다.');
                        setShowStatementModal(false);
                        setStatementData(null);
                    }}
                />
            )}
            {/* Delivery History Edit Modal */}
            {editHistoryModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-black text-white mb-6">📝 납품 이력 수정</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 font-bold block mb-1">납품 일자</label>
                                <input
                                    type="date"
                                    value={editHistoryModal.delivery_date}
                                    onChange={e => setEditHistoryModal(p => ({ ...p, delivery_date: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 font-bold block mb-1">비고</label>
                                <textarea
                                    value={editHistoryModal.note}
                                    onChange={e => setEditHistoryModal(p => ({ ...p, note: e.target.value }))}
                                    rows={2}
                                    placeholder="비고 입력..."
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                                />
                            </div>

                            <Divider sx={{ bgcolor: '#333', my: 2 }} />

                            <div className="space-y-3">
                                <label className="text-xs text-blue-400 font-black uppercase tracking-widest block mb-2">납품 품목 수량 수정</label>
                                {editHistoryModal.items?.map((item, idx) => (
                                    <div key={item.id || idx} className="flex items-center justify-between gap-4 bg-gray-800/50 p-3 rounded-xl border border-gray-700">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-gray-200 truncate">
                                                {item.order_item?.product?.name || '품목명 없음'}
                                            </div>
                                            <div className="text-[10px] text-gray-500">
                                                단가: ₩{(item.order_item?.unit_price || 0).toLocaleString()} ·
                                                <span className="text-blue-400 font-bold ml-1">계: ₩{(item.quantity * (item.order_item?.unit_price || 0)).toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="w-24">
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={e => {
                                                    const newItems = [...editHistoryModal.items];
                                                    newItems[idx].quantity = Number(e.target.value);
                                                    setEditHistoryModal(p => ({ ...p, items: newItems }));
                                                }}
                                                className="w-full bg-gray-950 border border-gray-600 rounded-lg px-2 py-1.5 text-right text-white text-sm font-black focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6 justify-end">
                            <button
                                onClick={() => setEditHistoryModal(null)}
                                className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-600 hover:bg-gray-800"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSaveDeliveryEdit}
                                className="px-5 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white"
                            >
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeliveryPage;
