import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Search, Package, Truck, Calendar, FileText } from 'lucide-react';
import { cn, getImageUrl } from '../lib/utils';
import DeliveryModal from '../components/DeliveryModal';
import FileViewerModal from '../components/FileViewerModal';
import TransactionStatementModal from '../components/TransactionStatementModal';

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
    const [showStatementModal, setShowStatementModal] = useState(false);
    const [statementData, setStatementData] = useState(null);

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
                                        <th className="px-6 py-3 text-orange-400">납품요청일</th>
                                        <th className="px-6 py-3 text-green-400">실제 납품일</th>
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
                                                <td className="px-6 py-4 font-bold text-white">{ord.partner?.name}</td>
                                                <td className="px-6 py-4">{ord.order_date || '-'}</td>
                                                <td className="px-6 py-4 text-orange-500/80">{ord.delivery_date || '-'}</td>
                                                <td className="px-6 py-4 text-green-400 font-medium">{ord.actual_delivery_date || '-'}</td>
                                                <td className="px-6 py-4 text-right font-semibold">₩{ord.total_amount?.toLocaleString() || 0}</td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-xs font-bold border",
                                                        ord.status === 'DELIVERED' ? "bg-green-600/20 text-green-500 border-green-500/20" :
                                                            ord.status === 'PARTIALLY_DELIVERED' ? "bg-orange-600/20 text-orange-500 border-orange-500/20" :
                                                                ord.status === 'PRODUCTION_COMPLETED' ? "bg-blue-600/20 text-blue-500 border-blue-500/20" :
                                                                    "bg-gray-800 text-gray-400"
                                                    )}>
                                                        {ord.status === 'PARTIALLY_DELIVERED' ? '부분납품' :
                                                            ord.status === 'DELIVERED' ? '납품완료' : ord.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {ord.items?.length > 0 ? (
                                                        <span className="truncate block max-w-[150px]">{ord.items[0].product?.name} {ord.items.length > 1 ? `외 ${ord.items.length - 1}건` : ''}</span>
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
                                                        return <span className="text-gray-600 text-xs">-</span>;
                                                    })()}
                                                </td>
                                            </tr>
                                            {expandedRows.has(ord.id) && (
                                                <tr className="bg-gray-800/40">
                                                    <td colSpan="9" className="px-6 py-6 border-b border-gray-700">
                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                            {/* Items Section */}
                                                            <div className="bg-gray-950/50 rounded-xl border border-gray-700 p-4 shadow-xl">
                                                                <h4 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                                                                    <Package className="w-4 h-4" /> 수주 품목 및 납품 잔량
                                                                </h4>
                                                                <table className="w-full text-xs text-gray-400">
                                                                    <thead>
                                                                        <tr className="border-b border-gray-800 text-gray-500">
                                                                            <th className="py-2 text-left">품목명</th>
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
                                                                                <div>
                                                                                    <div className="text-xs font-bold text-gray-300">{dh.delivery_date}</div>
                                                                                    <div className="text-[10px] text-gray-500">{dh.items?.length || 0}개 품목 납품</div>
                                                                                </div>
                                                                                <div className="flex gap-2">
                                                                                    {dh.statement_json && (
                                                                                        <button
                                                                                            className="text-[10px] bg-blue-900/30 text-blue-400 border border-blue-900/50 px-2 py-1 rounded hover:bg-blue-900/50 flex items-center gap-1"
                                                                                            onClick={() => {
                                                                                                setStatementData({
                                                                                                    ...dh.statement_json,
                                                                                                    deliveryHistoryId: dh.id,
                                                                                                    deliveryDate: dh.delivery_date
                                                                                                });
                                                                                                setShowStatementModal(true);
                                                                                            }}
                                                                                        >
                                                                                            <FileText className="w-3 h-3" /> 명세서
                                                                                        </button>
                                                                                    )}
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
                                    {orders.length === 0 && (
                                        <tr>
                                            <td colSpan="9" className="px-6 py-12 text-center text-gray-500">
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
            {showStatementModal && statementData && (
                <TransactionStatementModal
                    open={showStatementModal}
                    onClose={() => {
                        setShowStatementModal(false);
                        setStatementData(null);
                    }}
                    data={statementData}
                />
            )}
        </div>
    );
};

export default DeliveryPage;
