import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

const StockEditModal = ({ isOpen, onClose, onSuccess, initialData }) => {
    const [formData, setFormData] = useState({
        current_quantity: 0,
        location: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData({
                current_quantity: initialData.current_quantity,
                location: initialData.location || ''
            });
        }
    }, [isOpen, initialData]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            await api.put(`/inventory/stocks/${initialData.product_id}`, {
                current_quantity: formData.current_quantity,
                location: formData.location
            });
            alert("재고 수량이 수정되었습니다.");
            onSuccess();
        } catch (error) {
            console.error("Failed to update stock", error);
            alert("수정 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg w-full max-w-md flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">실재고 수량 수정</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">품목 정보</label>
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                            <div className="text-white font-bold">{initialData.product?.name}</div>
                            <div className="text-xs text-gray-500">{initialData.product?.code} | {initialData.product?.specification}</div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">현재고 수량</label>
                        <input
                            type="number"
                            className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5 focus:ring-1 focus:ring-blue-500 outline-none"
                            value={formData.current_quantity}
                            onChange={(e) => setFormData({ ...formData, current_quantity: parseInt(e.target.value) || 0 })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">보관 위치</label>
                        <input
                            type="text"
                            className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5 focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="예: A-101"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700">취소</button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 font-medium flex items-center gap-2 disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? "저장 중..." : "수정 완료"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StockEditModal;
