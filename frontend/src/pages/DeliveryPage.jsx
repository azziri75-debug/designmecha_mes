import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Search, Package, Truck, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import DeliveryModal from '../components/DeliveryModal';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);

const DeliveryPage = () => {
    const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'inventory'
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [partners, setPartners] = useState([]);

    // Filter States
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Modal States
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

    useEffect(() => {
        fetchPartners();
        if (activeTab === 'sales') {
            fetchOrders();
        }
    }, [activeTab, startDate, endDate, statusFilter]);

    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/');
            setPartners(res.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (statusFilter) params.status = statusFilter;

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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">납품 및 재고 관리</h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700">
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'sales' ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('sales')}
                >
                    수주 리스트 (납품 대기/완료)
                    {activeTab === 'sales' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                    )}
                </button>
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'inventory' ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('inventory')}
                >
                    재고 리스트
                    {activeTab === 'inventory' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                    )}
                </button>
            </div>

            {/* Content */}
            {activeTab === 'sales' && (
                <div className="space-y-4">
                    {/* Filters */}
                    <Card className="p-4 flex flex-wrap gap-4 items-end">
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
                            <label className="text-xs text-gray-400">상태</label>
                            <select
                                className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="">전체 (Status)</option>
                                <option value="PENDING">대기</option>
                                <option value="CONFIRMED">확정</option>
                                <option value="PRODUCTION_COMPLETED">생산 완료</option>
                                <option value="DELIVERY_COMPLETED">납품 완료</option>
                            </select>
                        </div>
                        <button
                            onClick={fetchOrders}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm flex items-center gap-2"
                        >
                            <Search className="w-4 h-4" />
                            조회
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
                                            <th className="px-6 py-3">납기일 (계획)</th>
                                            <th className="px-6 py-3">실제 납품일</th>
                                            <th className="px-6 py-3">상태</th>
                                            <th className="px-6 py-3">품목 요약</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {orders.map((ord) => (
                                            <tr
                                                key={ord.id}
                                                className="hover:bg-gray-700/50 transition-colors cursor-pointer"
                                                onDoubleClick={() => handleRowDoubleClick(ord)}
                                            >
                                                <td className="px-6 py-4 font-mono text-xs text-gray-300">{ord.order_no}</td>
                                                <td className="px-6 py-4 font-medium text-white">{ord.partner?.name}</td>
                                                <td className="px-6 py-4">{ord.delivery_date || '-'}</td>
                                                <td className="px-6 py-4 text-green-400">{ord.actual_delivery_date || '-'}</td>
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
                                            </tr>
                                        ))}
                                        {orders.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
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
            )}

            {activeTab === 'inventory' && (
                <Card className="p-8 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>재고 리스트 기능은 준비 중입니다.</p>
                </Card>
            )}

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
        </div>
    );
};

export default DeliveryPage;
