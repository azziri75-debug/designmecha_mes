import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Search, Package, Truck, Calendar, FileText } from 'lucide-react';
import { cn, getImageUrl } from '../lib/utils';
import DeliveryModal from '../components/DeliveryModal';
import FileViewerModal from '../components/FileViewerModal';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);

const DeliveryPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [partners, setPartners] = useState([]);

    // Filter States
    const [dateFilterType, setDateFilterType] = useState('order');
    const [partnerFilter, setPartnerFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');


    // Modal States
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [fileModalTitle, setFileModalTitle] = useState('');
    const [expandedRows, setExpandedRows] = useState(new Set());

    useEffect(() => {
        fetchPartners();
        fetchOrders();
    }, [startDate, endDate, statusFilter, partnerFilter, searchQuery, dateFilterType]);


    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/', { params: { type: 'CUSTOMER' } });
            setPartners(res.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const params = {};
            if (dateFilterType) params.date_type = dateFilterType;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (statusFilter) params.status = statusFilter;
            if (partnerFilter) params.partner_id = partnerFilter;
            if (searchQuery) params.product_name = searchQuery;


            const res = await api.get('/sales/orders/', { params });
            setOrders(res.data);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRowDoubleClick = (order) => {
        setSelectedOrder(order);
        setShowDeliveryModal(true);
    };

    const toggleRow = (orderId) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(orderId)) newSet.delete(orderId);
        else newSet.add(orderId);
        setExpandedRows(newSet);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">납품 관리</h1>
            </div>

            {/* Content */}
            <div className="space-y-4">
                {/* Filters */}
                <Card className="p-4 flex flex-wrap gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">거래처</label>
                        <select
                            className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm max-w-[150px]"
                            value={partnerFilter}
                            onChange={(e) => setPartnerFilter(e.target.value)}
                        >
                            <option value="">전체 거래처</option>
                            {partners.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">기준일자</label>
                        <select
                            className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                            value={dateFilterType}
                            onChange={(e) => setDateFilterType(e.target.value)}
                        >
                            <option value="order">수주일</option>
                            <option value="delivery">납품일</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">시작일</label>
                        <input
                            type="date"
                            className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">종료일</label>
                        <input
                            type="date"
                            className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">품명/품번</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="검색어 입력..."
                                className="w-full bg-gray-700 border-gray-600 rounded text-white pl-9 pr-3 py-2 text-sm h-[38px]"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setStartDate('');
                            setEndDate('');
                            setStatusFilter('');
                            setPartnerFilter('');
                            setSearchQuery('');
                        }}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm h-[38px]"
                    >
                        초기화
                    </button>
                </Card>


                <Card className="p-0 overflow-hidden min-h-[500px]">
                    {loading ? (
                        <div className="p-8 text-center text-gray-400">로딩 중...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-400">
                                <thead className="bg-gray-900/50 text-gray-200 uppercase font-medium">
                                    <tr>
                                        <th className="px-6 py-3">수주번호</th>
                                        <th className="px-6 py-3">거래처</th>
                                        <th className="px-6 py-3">수주일</th>
                                        <th className="px-6 py-3">납품요청일</th>
                                        <th className="px-6 py-3">실제 납품일</th>
                                        <th className="px-6 py-3 text-right">금액</th>
                                        <th className="px-6 py-3">상태</th>
                                        <th className="px-6 py-3">품목 요약</th>
                                        <th className="px-6 py-3 text-center">첨부</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {orders.map((ord) => (
                                        <React.Fragment key={ord.id}>
                                            <tr
                                                className="hover:bg-gray-700/50 transition-colors cursor-pointer border-b border-gray-700/50"
                                                onClick={() => toggleRow(ord.id)}
                                                onDoubleClick={() => handleRowDoubleClick(ord)}
                                            >
                                                <td className="px-6 py-4 font-mono text-xs text-gray-300">{ord.order_no}</td>
                                                <td className="px-6 py-4 font-medium text-white">{ord.partner?.name}</td>
                                                <td className="px-6 py-4">{ord.order_date || '-'}</td>
                                                <td className="px-6 py-4 text-yellow-500/80">{ord.delivery_date || '-'}</td>
                                                <td className="px-6 py-4 text-green-400">{ord.actual_delivery_date || '-'}</td>
                                                <td className="px-6 py-4 text-right font-semibold">₩{ord.total_amount?.toLocaleString() || 0}</td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-xs font-medium",
                                                        ord.status === 'DELIVERY_COMPLETED' ? "bg-green-900/50 text-green-400 border border-green-700" :
                                                            ord.status === 'PRODUCTION_COMPLETED' ? "bg-blue-900/50 text-blue-400 border border-blue-700" :
                                                                "bg-gray-800 text-gray-400"
                                                    )}>
                                                        {ord.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {ord.items?.length > 0 ? (
                                                        <span>{ord.items[0].product?.name} 외 {ord.items.length - 1}건</span>
                                                    ) : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {(() => {
                                                        let fileList = [];
                                                        try {
                                                            if (ord.attachment_file) {
                                                                const parsed = typeof ord.attachment_file === 'string' ? JSON.parse(ord.attachment_file) : ord.attachment_file;
                                                                fileList = Array.isArray(parsed) ? parsed : [parsed];
                                                            }
                                                        } catch { fileList = []; }
                                                        if (fileList.length > 0) {
                                                            return (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setViewingFiles(fileList);
                                                                        setFileModalTitle(`${ord.order_no} 첨부파일`);
                                                                        setShowFileModal(true);
                                                                    }}
                                                                    className="text-blue-400 hover:text-blue-300 transition-colors p-1"
                                                                >
                                                                    <FileText className="w-4 h-4" />
                                                                </button>
                                                            );
                                                        }
                                                        return <span className="text-gray-600">-</span>;
                                                    })()}
                                                </td>
                                            </tr>
                                            {expandedRows.has(ord.id) && (
                                                <tr className="bg-gray-800/20">
                                                    <td colSpan="9" className="px-6 py-4 border-b border-gray-700/50">
                                                        <div className="bg-gray-900 rounded border border-gray-700 p-4 shadow-inner">
                                                            <h4 className="text-sm font-semibold text-white mb-2 ml-1">납품 품목 상세</h4>
                                                            <table className="w-full text-sm text-center text-gray-400">
                                                                <thead className="text-xs bg-gray-800 text-gray-300">
                                                                    <tr>
                                                                        <th className="py-2 px-4 text-left">품목명</th>
                                                                        <th className="py-2 px-4 text-right">단가</th>
                                                                        <th className="py-2 px-4 text-right">수량</th>
                                                                        <th className="py-2 px-4 text-right">금액</th>
                                                                        <th className="py-2 px-4 text-right text-green-400">납품완료수량</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-700">
                                                                    {ord.items?.map(it => (
                                                                        <tr key={it.id} className="hover:bg-gray-800/40">
                                                                            <td className="py-2 px-4 text-left font-medium text-gray-200">
                                                                                {it.product?.name} <span className="text-gray-500 text-xs">({it.product?.code})</span>
                                                                            </td>
                                                                            <td className="py-2 px-4 text-right">₩{it.unit_price?.toLocaleString() || 0}</td>
                                                                            <td className="py-2 px-4 text-right">{it.quantity?.toLocaleString() || 0}</td>
                                                                            <td className="py-2 px-4 text-right text-gray-200 font-semibold">₩{((it.unit_price || 0) * (it.quantity || 0))?.toLocaleString()}</td>
                                                                            <td className="py-2 px-4 text-right text-green-400 font-bold">{it.delivered_quantity?.toLocaleString() || 0}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    {orders.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
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
                    files={viewingFiles}
                    title={fileModalTitle}
                />
            )}
        </div>
    );
};

export default DeliveryPage;
