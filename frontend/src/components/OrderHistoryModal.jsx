import React, { useState, useEffect } from 'react';
import { X, Search, ChevronDown, ChevronUp, Check } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

const OrderHistoryModal = ({ isOpen, onClose, onSelect, partnerId }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRows, setExpandedRows] = useState(new Set());

    useEffect(() => {
        if (isOpen && partnerId) {
            fetchHistory();
        }
    }, [isOpen, partnerId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await api.get('/sales/orders/', {
                params: { partner_id: partnerId, limit: 50 }
            });
            setOrders(res.data);
        } catch (error) {
            console.error("Failed to fetch order history", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    const filteredOrders = orders.filter(ord => 
        (ord.order_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        ord.items?.some(item => (item.product?.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
            <div className="bg-gray-800 rounded-xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl border border-gray-700">
                <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-xl">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                            이전 수주 내역 불러오기
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">거래처의 과거 수주 기록을 확인하고 현재 문서로 가져옵니다.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-4 bg-gray-900/30 border-b border-gray-700">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text"
                            placeholder="수주번호 또는 품목명으로 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-800 border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
                            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                            <p>이력 데이터를 불러오는 중...</p>
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="text-center py-20 text-gray-500">
                            검색 결과가 없거나 등록된 수주 이력이 없습니다.
                        </div>
                    ) : (
                        <div className="overflow-hidden border border-gray-700 rounded-lg">
                            <table className="w-full text-sm text-left text-gray-300">
                                <thead className="bg-gray-900/80 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 w-10"></th>
                                        <th className="px-4 py-3">수주일자</th>
                                        <th className="px-4 py-3">수주번호</th>
                                        <th className="px-4 py-3">품목명 (요약)</th>
                                        <th className="px-4 py-3 text-right">대표 단가</th>
                                        <th className="px-4 py-3 text-right">총 금액</th>
                                        <th className="px-4 py-3">비고</th>
                                        <th className="px-4 py-3 text-center">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/40">
                                    {filteredOrders.map((ord) => {
                                        const representativeItem = ord.items?.[0] || {};
                                        const itemCount = ord.items?.length || 0;
                                        const itemNameDisplay = representativeItem.product?.name || '품목 정보 없음';
                                        const isExpanded = expandedRows.has(ord.id);

                                        return (
                                            <React.Fragment key={ord.id}>
                                                <tr className={cn(
                                                    "hover:bg-gray-700/30 transition-colors cursor-pointer",
                                                    isExpanded && "bg-blue-900/10"
                                                )} onClick={() => toggleExpand(ord.id)}>
                                                    <td className="px-4 py-4 text-center">
                                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-400">{ord.order_date}</td>
                                                    <td className="px-4 py-4 font-bold text-gray-200">{ord.order_no || '-'}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-white hover:text-blue-400 transition-colors">
                                                                {itemNameDisplay}
                                                                {itemCount > 1 && <span className="text-blue-400 text-xs ml-1 font-semibold">외 {itemCount - 1}건</span>}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-right text-emerald-400 font-medium">
                                                        {representativeItem.unit_price ? `₩${representativeItem.unit_price.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-4 text-right font-bold text-white">
                                                        ₩{ord.total_amount?.toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-4 max-w-[150px] truncate text-gray-500" title={ord.note}>
                                                        {ord.note || '-'}
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onSelect(ord);
                                                            }}
                                                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg hover:shadow-blue-500/20 flex items-center gap-1 mx-auto"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> 불러오기
                                                        </button>
                                                    </td>
                                                </tr>
                                                {/* Expandable row for item details */}
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan="8" className="bg-gray-900/50 px-10 py-4 border-t border-gray-700 animate-in slide-in-from-top-2">
                                                            <div className="grid grid-cols-1 gap-2">
                                                                <h4 className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-tighter">품목 상세 정보</h4>
                                                                <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-inner">
                                                                    <table className="w-full text-xs">
                                                                        <thead className="bg-gray-700 text-gray-400">
                                                                            <tr>
                                                                                <th className="px-4 py-2 text-left">품목명</th>
                                                                                <th className="px-4 py-2 text-left">규격</th>
                                                                                <th className="px-4 py-2 text-center w-16">단위</th>
                                                                                <th className="px-4 py-2 text-right w-20">수량</th>
                                                                                <th className="px-4 py-2 text-right w-32">단가</th>
                                                                                <th className="px-4 py-2 text-right w-32">금액</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-700">
                                                                            {ord.items?.map((item, idx) => (
                                                                                <tr key={idx} className="hover:bg-gray-700/50">
                                                                                    <td className="px-4 py-2 text-white font-medium">{item.product?.name || '-'}</td>
                                                                                    <td className="px-4 py-2 text-gray-400">{item.product?.specification || '-'}</td>
                                                                                    <td className="px-4 py-2 text-center text-gray-500">{item.product?.unit || 'EA'}</td>
                                                                                    <td className="px-4 py-2 text-right text-gray-300 font-bold">{item.quantity?.toLocaleString()}</td>
                                                                                    <td className="px-4 py-2 text-right text-emerald-400">₩{item.unit_price?.toLocaleString()}</td>
                                                                                    <td className="px-4 py-2 text-right text-white font-bold">₩{(item.quantity * item.unit_price).toLocaleString()}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-900/20 text-right">
                    <button onClick={onClose} className="px-5 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-all font-medium border border-gray-700">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OrderHistoryModal;
