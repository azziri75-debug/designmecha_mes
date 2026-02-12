import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, FileText, Download } from 'lucide-react';
import api from '../lib/api';

const OrderModal = ({ isOpen, onClose, onSuccess, partners }) => {
    // Form State
    const [formData, setFormData] = useState({
        partner_id: '',
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: '',
        items: [],
        note: '',
        status: 'PENDING'
    });

    const [partnerProducts, setPartnerProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // States for Sub-modals
    const [showProductSelect, setShowProductSelect] = useState(false);
    const [showEstimateSelect, setShowEstimateSelect] = useState(false);
    const [partnerEstimates, setPartnerEstimates] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setFormData({
                partner_id: '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                items: [],
                note: '',
                status: 'PENDING'
            });
            setPartnerProducts([]);
            setPartnerEstimates([]);
        }
    }, [isOpen]);

    // Fetch products when partner changes
    useEffect(() => {
        if (formData.partner_id) {
            fetchPartnerProducts(formData.partner_id);
            fetchPartnerEstimates(formData.partner_id);
        } else {
            setPartnerProducts([]);
            setPartnerEstimates([]);
        }
    }, [formData.partner_id]);

    const fetchPartnerProducts = async (partnerId) => {
        setLoadingProducts(true);
        try {
            const res = await api.get('/product/products/', { params: { partner_id: partnerId } });
            setPartnerProducts(res.data);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            setLoadingProducts(false);
        }
    };

    const fetchPartnerEstimates = async (partnerId) => {
        try {
            const res = await api.get('/sales/estimates/', { params: { partner_id: partnerId } });
            setPartnerEstimates(res.data);
        } catch (error) {
            console.error("Failed to fetch estimates", error);
        }
    };

    const handleProductSelect = async (product) => {
        if (formData.items.some(item => item.product_id === product.id)) {
            alert("이미 추가된 품목입니다.");
            return;
        }

        let recentPrice = 0;
        try {
            const res = await api.get('/sales/history/price', {
                params: { product_id: product.id, partner_id: formData.partner_id }
            });
            recentPrice = res.data.price || 0;
        } catch (e) { console.error(e); }

        const newItem = {
            product_id: product.id,
            product_name: product.name,
            product_spec: product.specification,
            unit: product.unit,
            quantity: 1,
            unit_price: recentPrice,
            note: ''
        };

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));
        setShowProductSelect(false);
    };

    const handleEstimateSelect = (estimate) => {
        // Import items from estimate
        // Map EstimateItem -> SalesOrderItem structure
        const newItems = estimate.items.map(item => ({
            product_id: item.product_id,
            product_name: item.product.name,
            product_spec: item.product.specification,
            unit: item.product.unit,
            quantity: item.quantity,
            unit_price: item.unit_price,
            note: item.note || ''
        }));

        // Merge or Replace? Let's append but check duplicates
        // Actually for order from estimate, replacing might be better or appending unique.
        // Let's Replace for simplicity as user usually converts 1 quote to 1 order
        if (formData.items.length > 0) {
            if (!confirm("기존 입력된 품목이 삭제되고 견적 내용으로 대체됩니다. 계속하시겠습니까?")) return;
        }

        setFormData(prev => ({
            ...prev,
            items: newItems,
            note: prev.note || estimate.note // Keep existing note if present? or overwrite?
        }));
        setShowEstimateSelect(false);
    };

    const updateItem = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const removeItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const handleSubmit = async () => {
        if (!formData.partner_id) return alert("거래처를 선택해주세요.");
        if (formData.items.length === 0) return alert("품목을 최소 1개 이상 추가해주세요.");
        if (!formData.delivery_date) return alert("납기일을 입력해주세요.");

        const total_amount = formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

        const payload = {
            ...formData,
            total_amount
        };

        try {
            await api.post('/sales/orders/', payload);
            alert("수주가 등록되었습니다.");
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Registration failed", error);
            alert("등록 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">신규 수주 등록</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">거래처 (고객사)</label>
                            <select
                                value={formData.partner_id}
                                onChange={(e) => setFormData({ ...formData, partner_id: e.target.value })}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5"
                            >
                                <option value="">선택하세요</option>
                                {partners.filter(p => p.partner_type.includes('CUSTOMER')).map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-400 mb-1">수주일자</label>
                                <input
                                    type="date"
                                    value={formData.order_date}
                                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                                    className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-400 mb-1">납기일자</label>
                                <input
                                    type="date"
                                    value={formData.delivery_date}
                                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                                    className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="flex justify-between items-end mb-1">
                                <label className="block text-sm font-medium text-gray-400">비고</label>
                                {formData.partner_id && (
                                    <button
                                        onClick={() => setShowEstimateSelect(true)}
                                        className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                                    >
                                        <FileText className="w-3 h-3" />
                                        견적 불러오기
                                    </button>
                                )}
                            </div>
                            <input
                                type="text"
                                value={formData.note}
                                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5"
                                placeholder="특이사항 입력"
                            />
                        </div>
                    </div>

                    {/* Items Table */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-white">수주 품목</h3>
                            <button
                                onClick={() => {
                                    if (!formData.partner_id) return alert("먼저 거래처를 선택해주세요.");
                                    setShowProductSelect(true);
                                }}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> 품목 추가
                            </button>
                        </div>

                        <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="bg-gray-800 text-xs uppercase font-medium">
                                    <tr>
                                        <th className="px-4 py-2">품명</th>
                                        <th className="px-4 py-2">규격</th>
                                        <th className="px-4 py-2 w-24">수량</th>
                                        <th className="px-4 py-2 w-32">단가</th>
                                        <th className="px-4 py-2 w-32">금액</th>
                                        <th className="px-4 py-2">비고</th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {formData.items.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="px-4 py-8 text-center text-gray-600">
                                                등록된 품목이 없습니다.
                                            </td>
                                        </tr>
                                    ) : (
                                        formData.items.map((item, index) => (
                                            <tr key={index}>
                                                <td className="px-4 py-2 text-white">{item.product_name}</td>
                                                <td className="px-4 py-2">{item.product_spec}</td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                                                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-white"
                                                    />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="number"
                                                        value={item.unit_price}
                                                        onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-white"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-right font-medium text-blue-400">
                                                    {(item.quantity * item.unit_price).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="text"
                                                        value={item.note || ''}
                                                        onChange={(e) => updateItem(index, 'note', e.target.value)}
                                                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <button onClick={() => removeItem(index)} className="text-gray-500 hover:text-red-400">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {formData.items.length > 0 && (
                                    <tfoot className="bg-gray-800 font-bold text-white">
                                        <tr>
                                            <td colSpan="4" className="px-4 py-2 text-right">합계</td>
                                            <td className="px-4 py-2 text-right text-blue-400">
                                                {formData.items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0).toLocaleString()}
                                            </td>
                                            <td colSpan="2"></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700">취소</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 font-medium">저장</button>
                </div>
            </div>

            {/* Product Selection Sub-Modal */}
            {showProductSelect && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]">
                    <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">품목 선택 ({partnerProducts.length})</h3>
                            <button onClick={() => setShowProductSelect(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {partnerProducts.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">등록된 제품이 없습니다.</div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2">
                                    {partnerProducts.map(prod => (
                                        <button
                                            key={prod.id}
                                            onClick={() => handleProductSelect(prod)}
                                            className="flex items-center justify-between p-3 rounded bg-gray-700 hover:bg-gray-600 text-left transition-colors"
                                        >
                                            <div>
                                                <div className="font-medium text-white">{prod.name}</div>
                                                <div className="text-sm text-gray-400">{prod.specification}</div>
                                            </div>
                                            <Plus className="w-4 h-4 text-blue-400" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Estimate Selection Sub-Modal */}
            {showEstimateSelect && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]">
                    <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">견적서 불러오기</h3>
                            <button onClick={() => setShowEstimateSelect(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {partnerEstimates.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">등록된 견적이 없습니다.</div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2">
                                    {partnerEstimates.map(est => (
                                        <button
                                            key={est.id}
                                            onClick={() => handleEstimateSelect(est)}
                                            className="flex flex-col gap-1 p-3 rounded bg-gray-700 hover:bg-gray-600 text-left transition-colors border-l-4 border-blue-500"
                                        >
                                            <div className="flex justify-between w-full">
                                                <span className="font-bold text-white">{est.estimate_date}</span>
                                                <span className="text-blue-300 font-medium">{est.total_amount?.toLocaleString()}원</span>
                                            </div>
                                            <div className="text-sm text-gray-400">
                                                품목 {est.items.length}건 | {est.note || '비고 없음'}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderModal;
