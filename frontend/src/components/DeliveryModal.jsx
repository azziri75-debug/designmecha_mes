import React, { useState, useEffect } from 'react';
import { X, Save, Truck, Calendar, CheckCircle, Upload, FileText, Trash2, FileSearch } from 'lucide-react';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';
import MultiFileUpload from './MultiFileUpload';
import TransactionStatementModal from './TransactionStatementModal';

const DeliveryModal = ({ isOpen, onClose, onSuccess, order }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        delivery_date: '',
        note: '',
        items: [],
        attachment_files: []
    });

    const [showStatement, setShowStatement] = useState(false);
    const [lastDelivery, setLastDelivery] = useState(null);

    useEffect(() => {
        if (order) {
            setFormData({
                delivery_date: new Date().toISOString().split('T')[0],
                note: '',
                items: order.items.map(item => ({
                    ...item,
                    remaining_quantity: item.quantity - (item.delivered_quantity || 0),
                    current_delivered_quantity: 0
                })),
                attachment_files: []
            });
        }
    }, [order]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const validItems = formData.items.filter(i => i.current_delivered_quantity > 0);
        if (validItems.length === 0) {
            alert("납품 수량을 하나 이상 입력해주세요.");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                order_id: order.id,
                delivery_date: formData.delivery_date,
                note: formData.note,
                attachment_files: formData.attachment_files,
                items: validItems.map(item => ({
                    order_item_id: item.id,
                    quantity: item.current_delivered_quantity
                }))
            };

            const res = await api.post(`/sales/orders/${order.id}/delivery`, payload);
            setLastDelivery(res.data);

            alert("납품 처리가 완료되었습니다.");

            // Check if full delivery
            if (res.data.status === 'DELIVERED') {
                if (window.confirm("모든 납품이 완료되었습니다. 연관된 생산계획 및 발주 건들을 모두 '완료' 처리 하시겠습니까?")) {
                    await api.post(`/sales/orders/${order.id}/batch-complete`);
                    alert("후방 공정이 일괄 완료 처리되었습니다.");
                }
            }

            // Ask for statement
            if (window.confirm("거래명세서를 지금 바로 확인/출력하시겠습니까?")) {
                setShowStatement(true);
            } else {
                onSuccess();
                onClose();
            }
        } catch (error) {
            console.error("Delivery failed", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    if (showStatement && lastDelivery) {
        return (
            <TransactionStatementModal
                open={showStatement}
                onClose={() => {
                    setShowStatement(false);
                    onSuccess();
                    onClose();
                }}
                data={{
                    ...order,
                    delivery_date: lastDelivery.delivery_date,
                    items: lastDelivery.items.map(di => ({
                        ...di.order_item,
                        quantity: di.quantity
                    }))
                }}
                onSave={async (snap) => {
                    await api.put(`/sales/orders/${order.id}/delivery/${lastDelivery.id}`, { statement_json: snap });
                    alert("명세서 스냅샷이 저장되었습니다.");
                }}
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800 z-10">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Truck className="w-5 h-5 text-blue-400" />
                        분할 납품 처리 (수주번호: {order?.order_no})
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> 납품 정보
                            </h3>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">납품 일자</label>
                                <input
                                    type="date"
                                    required
                                    className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500"
                                    value={formData.delivery_date}
                                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">비고 (메모)</label>
                                <textarea
                                    className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500"
                                    rows={2}
                                    value={formData.note}
                                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                    placeholder="특이사항 입력"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <FileSearch className="w-4 h-4" /> 증빙/스캔본 첨부
                            </h3>
                            <MultiFileUpload
                                files={formData.attachment_files}
                                onChange={(files) => setFormData({ ...formData, attachment_files: files })}
                                label="납품 확인서/사진 업로드"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">납품 수량 관리</h3>
                        <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                            <table className="w-full text-sm text-gray-300">
                                <thead className="bg-gray-800 text-gray-400">
                                    <tr>
                                        <th className="px-4 py-3 text-left">품목명</th>
                                        <th className="px-4 py-3 text-right">총 수량</th>
                                        <th className="px-4 py-3 text-right">기 납품</th>
                                        <th className="px-4 py-3 text-right">잔량</th>
                                        <th className="px-4 py-3 text-right text-blue-400 font-bold">이번 납품</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {formData.items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-800/50">
                                            <td className="px-4 py-3 font-medium">{item.product.name}</td>
                                            <td className="px-4 py-3 text-right text-gray-500">{item.quantity}</td>
                                            <td className="px-4 py-3 text-right text-green-500">{item.delivered_quantity || 0}</td>
                                            <td className="px-4 py-3 text-right font-bold">{item.remaining_quantity}</td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    max={item.remaining_quantity}
                                                    min={0}
                                                    className="w-24 bg-gray-700 border-blue-500/50 border rounded text-right px-2 py-1.5 text-white ml-auto block focus:ring-2 focus:ring-blue-500 font-bold"
                                                    value={item.current_delivered_quantity}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        const newItems = [...formData.items];
                                                        newItems[idx].current_delivered_quantity = Math.min(val, item.remaining_quantity);
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-700 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-600"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 flex items-center gap-2"
                        >
                            <Truck className="w-5 h-5" />
                            {loading ? '처리 중...' : '납품 기록 저장'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DeliveryModal;
