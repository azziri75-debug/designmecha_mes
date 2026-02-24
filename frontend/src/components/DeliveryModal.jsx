import React, { useState, useEffect } from 'react';
import { X, Save, Truck, Calendar, CheckCircle, Upload, FileText, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';

const DeliveryModal = ({ isOpen, onClose, onSuccess, order }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        actual_delivery_date: '',
        delivery_method: '',
        transaction_date: '',
        production_completion_date: '',
        items: [],
        attachment_file: []
    });

    useEffect(() => {
        if (order) {
            let existingFiles = [];
            try {
                if (order.attachment_file) {
                    existingFiles = typeof order.attachment_file === 'string'
                        ? JSON.parse(order.attachment_file) : order.attachment_file;
                    if (!Array.isArray(existingFiles)) existingFiles = [existingFiles];
                }
            } catch { existingFiles = []; }

            setFormData({
                actual_delivery_date: order.actual_delivery_date || new Date().toISOString().split('T')[0],
                delivery_method: order.delivery_method || '',
                transaction_date: order.transaction_date || new Date().toISOString().split('T')[0],
                production_completion_date: '',
                items: order.items.map(item => ({
                    ...item,
                    current_delivered_quantity: item.quantity
                })),
                attachment_file: existingFiles
            });
        }
    }, [order]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await api.post('/upload', fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const newFile = { name: res.data.filename, url: res.data.url };
            setFormData(prev => ({
                ...prev,
                attachment_file: [...prev.attachment_file, newFile]
            }));
        } catch (error) {
            console.error("File upload failed", error);
            alert("파일 업로드 실패");
        }
        e.target.value = '';
    };

    const handleRemoveFile = (index) => {
        setFormData(prev => ({
            ...prev,
            attachment_file: prev.attachment_file.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                actual_delivery_date: formData.actual_delivery_date,
                delivery_method: formData.delivery_method,
                transaction_date: formData.transaction_date,
                status: 'DELIVERY_COMPLETED',
                attachment_file: formData.attachment_file,
                items: formData.items.map(item => ({
                    product_id: item.product.id,
                    unit_price: item.unit_price,
                    quantity: item.quantity,
                    delivered_quantity: item.current_delivered_quantity,
                    note: item.note
                }))
            };

            await api.put(`/sales/orders/${order.id}`, payload);

            alert("납품 완료 처리되었습니다.");
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Delivery update failed", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800 z-10">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Truck className="w-5 h-5 text-blue-400" />
                        납품 처리 (수주번호: {order?.order_no})
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Calendar className="w-4 h-4" /> 납품 정보
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">실제 납품일</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                                        value={formData.actual_delivery_date}
                                        onChange={(e) => setFormData({ ...formData, actual_delivery_date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">거래명세서 일자</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                                        value={formData.transaction_date}
                                        onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-400 mb-1">납품 방법</label>
                                    <select
                                        className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                                        value={formData.delivery_method}
                                        onChange={(e) => setFormData({ ...formData, delivery_method: e.target.value })}
                                    >
                                        <option value="">선택하세요</option>
                                        <option value="직접납품">직접 납품 (Direct)</option>
                                        <option value="택배">택배 (Courier)</option>
                                        <option value="화물">화물 (Freight)</option>
                                        <option value="퀵서비스">퀵서비스 (Quick)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" /> 생산 정보 (참고)
                            </h3>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">생산 완료일</label>
                                <input
                                    type="date"
                                    className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                                    value={formData.production_completion_date}
                                    onChange={(e) => setFormData({ ...formData, production_completion_date: e.target.value })}
                                    placeholder="기록용"
                                />
                                <p className="text-xs text-gray-500 mt-1">* 실제 생산 계획의 완료일과는 별개로 납품 시 기록하는 완료일입니다.</p>
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">납품 품목 및 수량</h3>
                        <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                            <table className="w-full text-sm text-gray-300">
                                <thead className="bg-gray-800 text-gray-400">
                                    <tr>
                                        <th className="px-4 py-2 text-left">품목명</th>
                                        <th className="px-4 py-2 text-right">수주 수량</th>
                                        <th className="px-4 py-2 text-right">단가</th>
                                        <th className="px-4 py-2 text-right">납품 수량 (이번)</th>
                                        <th className="px-4 py-2 text-right">금액</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {formData.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="px-4 py-2">{item.product.name}</td>
                                            <td className="px-4 py-2 text-right">{item.quantity}</td>
                                            <td className="px-4 py-2 text-right">{item.unit_price.toLocaleString()}</td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="number"
                                                    className="w-24 bg-gray-700 border-gray-600 rounded text-right px-2 py-1 text-white ml-auto block"
                                                    value={item.current_delivered_quantity}
                                                    onChange={(e) => {
                                                        const newItems = [...formData.items];
                                                        newItems[idx].current_delivered_quantity = parseInt(e.target.value) || 0;
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                {(item.current_delivered_quantity * item.unit_price).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-800 font-semibold text-white">
                                    <tr>
                                        <td colSpan="3" className="px-4 py-2 text-right">총 납품 금액</td>
                                        <td colSpan="2" className="px-4 py-2 text-right text-blue-400">
                                            {formData.items.reduce((sum, item) => sum + (item.current_delivered_quantity * item.unit_price), 0).toLocaleString()} 원
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Attachment Files */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <FileText className="w-4 h-4" /> 첨부파일
                        </h3>
                        <div className="bg-gray-900/50 rounded-lg border border-gray-700 p-4 space-y-3">
                            {formData.attachment_file.length > 0 && (
                                <div className="space-y-2">
                                    {formData.attachment_file.map((file, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
                                            <a
                                                href={getImageUrl(file.url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-2 truncate"
                                            >
                                                <FileText className="w-4 h-4 shrink-0" />
                                                {file.name}
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveFile(idx)}
                                                className="text-gray-500 hover:text-red-400 p-1 shrink-0 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="relative">
                                <div className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-dashed border-gray-500 rounded-lg px-4 py-3 cursor-pointer transition-colors">
                                    <Upload className="w-5 h-5 text-gray-400" />
                                    <span className="text-sm text-gray-400">파일 업로드 (클릭하여 선택)</span>
                                </div>
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-gray-700 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium shadow-lg shadow-green-900/20 flex items-center gap-2"
                        >
                            <Truck className="w-4 h-4" />
                            {loading ? '처리 중...' : '납품 완료 처리'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DeliveryModal;
