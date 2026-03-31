import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, FileText, Download, Upload, History } from 'lucide-react';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';

import Select from 'react-select';
import OrderHistoryModal from './OrderHistoryModal';
import QuotationHistoryModal from './QuotationHistoryModal';

const OrderModal = ({ isOpen, onClose, onSuccess, partners, orderToEdit = null }) => {
    // Select styling
    const selectStyles = {
        control: (base) => ({
            ...base,
            backgroundColor: '#374151',
            borderColor: '#4B5563',
            color: 'white',
            '&:hover': {
                borderColor: '#6B7280'
            }
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: '#1F2937',
            border: '1px solid #374151'
        }),
        option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? '#374151' : 'transparent',
            color: 'white',
            '&:active': {
                backgroundColor: '#4B5563'
            }
        }),
        singleValue: (base) => ({
            ...base,
            color: 'white'
        }),
        input: (base) => ({
            ...base,
            color: 'white'
        }),
        placeholder: (base) => ({
            ...base,
            color: '#9CA3AF'
        })
    };

    // Form State
    const [formData, setFormData] = useState({
        partner_id: '',
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: '',
        items: [],
        note: '',
        status: 'PENDING',
        attachment_file: []
    });

    const [partnerProducts, setPartnerProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // States for Sub-modals
    const [showEstimateSelect, setShowEstimateSelect] = useState(false);
    const [showOrderSelect, setShowOrderSelect] = useState(false);
    const [partnerEstimates, setPartnerEstimates] = useState([]);
    const [partnerOrders, setPartnerOrders] = useState([]);

    // Price History State
    const [showPriceHistory, setShowPriceHistory] = useState(false);
    const [priceHistory, setPriceHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyTargetIndex, setHistoryTargetIndex] = useState(null);

    useEffect(() => {
        if (isOpen) {
            if (orderToEdit) {
                // Edit Mode
                setFormData({
                    partner_id: orderToEdit.partner_id,
                    order_date: orderToEdit.order_date,
                    delivery_date: orderToEdit.delivery_date || '',
                    items: (orderToEdit.items || []).map(item => ({
                        product_id: item.product_id,
                        product_name: item.product?.name || item.product_name,
                        product_spec: item.product?.specification || item.product_spec,
                        unit: item.product?.unit || item.unit,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        note: item.note || ''
                    })),
                    note: orderToEdit.note || '',
                    status: orderToEdit.status || 'PENDING',
                    attachment_file: safeParseJSON(orderToEdit.attachment_file, [])
                });
            } else {
                // Create Mode
                setFormData({
                    partner_id: '',
                    order_date: new Date().toISOString().split('T')[0],
                    delivery_date: '',
                    items: [],
                    note: '',
                    status: 'PENDING',
                    attachment_file: []
                });
            }
            setPartnerProducts([]);
            setPartnerEstimates([]);
            setPartnerOrders([]);
        }
    }, [isOpen, orderToEdit]);

    // Data Fetching
    useEffect(() => {
        if (formData.partner_id) {
            fetchPartnerProducts(formData.partner_id);
            fetchPartnerEstimates(formData.partner_id);
            fetchPartnerOrders(formData.partner_id);
        } else {
            setPartnerProducts([]);
            setPartnerEstimates([]);
            setPartnerOrders([]);
        }
    }, [formData.partner_id]);

    const fetchPartnerProducts = async (partnerId) => {
        setLoadingProducts(true);
        try {
            // Strict filtering by partner_id as requested by user.
            const response = await api.get('/product/products/', {
                params: { partner_id: partnerId }
            });
            setPartnerProducts(response.data);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            setLoadingProducts(false);
        }
    };

    const fetchPartnerEstimates = async (partnerId) => {
        try {
            const response = await api.get('/sales/estimates/', {
                params: { partner_id: partnerId }
            });
            setPartnerEstimates(response.data);
        } catch (error) {
            console.error("Failed to fetch estimates", error);
        }
    };

    const fetchPartnerOrders = async (partnerId) => {
        try {
            const response = await api.get('/sales/orders/', {
                params: { partner_id: partnerId }
            });
            let orders = response.data;
            if (orderToEdit) {
                orders = orders.filter(o => o.id !== orderToEdit.id);
            }
            setPartnerOrders(orders);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        }
    };

    const addItem = () => {
        if (!formData.partner_id) return alert("먼저 거래처를 선택해주세요.");
        const newItem = {
            product_id: null,
            product_name: '',
            product_spec: '',
            unit: 'EA',
            quantity: 0,
            unit_price: 0,
            note: ''
        };
        setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    };

    const handleProductSelect = async (index, product) => {
        // Fetch recent price
        let recentPrice = 0;
        try {
            const res = await api.get('/sales/history/price', {
                params: { product_id: product.id, partner_id: formData.partner_id }
            });
            recentPrice = res.data.price || 0;
        } catch (e) { console.error(e); }

        const newItems = [...formData.items];
        newItems[index] = {
            ...newItems[index],
            product_id: product.id,
            product_name: product.name,
            product_spec: product.specification,
            unit: product.unit,
            unit_price: recentPrice
        };
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    // Handler for Estimate Select
    const handleEstimateSelect = (estimate) => {
        const newItems = estimate.items.map(item => ({
            product_id: item.product_id,
            product_name: item.product?.name || item.product_id, // Fallback
            product_spec: item.product?.specification || '',
            unit: item.product?.unit || 'EA',
            quantity: item.quantity,
            unit_price: item.unit_price,
            note: item.note || ''
        }));

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, ...newItems],
            // Optional: Copy note/terms from estimate?
            note: prev.note ? prev.note + '\n' + (estimate.note || '') : (estimate.note || '')
        }));
        setShowEstimateSelect(false);
    };

    // Handler for Order Select
    const handleOrderSelect = (order) => {
        const newItems = (order.items || []).map(item => ({
            product_id: item.product_id,
            product_name: item.product?.name || item.product_name || item.product_id, // Fallback
            product_spec: item.product?.specification || item.product_spec || '',
            unit: item.product?.unit || item.unit || 'EA',
            quantity: item.quantity,
            unit_price: item.unit_price,
            note: item.note || ''
        }));

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, ...newItems],
            note: prev.note ? prev.note + '\n' + (order.note || '') : (order.note || '')
        }));
        setShowOrderSelect(false);
    };

    const updateItem = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData({ ...formData, items: newItems });
    };

    const openPriceHistory = async (index, productId) => {
        if (!productId) return;
        setHistoryTargetIndex(index);
        setShowPriceHistory(true);
        setLoadingHistory(true);
        try {
            const res = await api.get(`/product/${productId}/sales-history`);
            setPriceHistory(res.data);
        } catch (error) {
            console.error("Failed to fetch price history", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const removeItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        try {
            const uploadedFiles = [];
            for (const file of files) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', file);

                const res = await api.post('/upload', uploadFormData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                uploadedFiles.push({
                    name: res.data.filename,
                    url: res.data.url
                });
            }

            setFormData(prev => ({
                ...prev,
                attachment_file: [...(prev.attachment_file || []), ...uploadedFiles]
            }));
        } catch (error) {
            console.error("Upload failed", error);
            alert("파일 업로드 실패");
        }
    };

    const removeAttachment = (index) => {
        setFormData(prev => ({
            ...prev,
            attachment_file: prev.attachment_file.filter((_, i) => i !== index)
        }));
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
            if (orderToEdit) {
                await api.put(`/sales/orders/${orderToEdit.id}`, payload);
                alert("수주가 수정되었습니다.");
            } else {
                await api.post('/sales/orders/', payload);
                alert("수주가 등록되었습니다.");
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Save failed", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">{orderToEdit ? "수주 수정" : "신규 수주 등록"}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">거래처 (고객사)</label>
                            <Select
                                value={partners.filter(p => p.partner_type.includes('CUSTOMER')).map(p => ({ value: p.id, label: p.name })).find(opt => opt.value === formData.partner_id)}
                                onChange={(option) => setFormData({ ...formData, partner_id: option ? option.value : '' })}
                                options={partners.filter(p => p.partner_type.includes('CUSTOMER')).map(p => ({ value: p.id, label: p.name }))}
                                styles={selectStyles}
                                placeholder="거래처를 선택하세요"
                                isClearable
                            />
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
                                <label className="block text-sm font-medium text-gray-400 mb-1">납품요청일</label>
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
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setShowOrderSelect(true)}
                                            className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                                        >
                                            <FileText className="w-3 h-3" />
                                            수주 불러오기
                                        </button>
                                        <button
                                            onClick={() => setShowEstimateSelect(true)}
                                            className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                                        >
                                            <FileText className="w-3 h-3" />
                                            견적 불러오기
                                        </button>
                                    </div>
                                )}
                            </div>
                            <input
                                type="text"
                                value={formData.note}
                                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 mb-2"
                                placeholder="특이사항 입력"
                            />

                            <label className="block text-sm font-medium text-gray-400 mb-1">상태</label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 mb-4"
                            >
                                <option value="PENDING">대기 (PENDING)</option>
                                <option value="CONFIRMED">확정 (CONFIRMED)</option>
                                <option value="PRODUCTION_COMPLETED">생산 완료 (PRODUCTION_COMPLETED)</option>
                                <option value="DELIVERY_COMPLETED">납품 완료 (DELIVERY_COMPLETED)</option>
                                <option value="CANCELLED">취소 (CANCELLED)</option>
                            </select>

                            {/* Attachments Section */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-gray-400">첨부파일</label>
                                    <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-900/20 px-2 py-1 rounded border border-blue-800/50">
                                        <Upload className="w-3 h-3" />
                                        파일 추가
                                        <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                                    </label>
                                </div>
                                <div className="space-y-1.5">
                                    {formData.attachment_file && formData.attachment_file.length > 0 ? (
                                        formData.attachment_file.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-900/50 rounded border border-gray-700 text-xs">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                                    <span className="text-gray-300 truncate">{file.name}</span>
                                                </div>
                                                <button
                                                    onClick={() => removeAttachment(idx)}
                                                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-3 border border-dashed border-gray-700 rounded text-xs text-gray-600">
                                            등록된 첨부파일이 없습니다.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-white">수주 품목</h3>
                            <button
                                onClick={addItem}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> 품목 추가
                            </button>
                        </div>

                        <div className="bg-gray-900 rounded-lg overflow-x-auto border border-gray-700">
                            <table className="w-full text-sm text-left text-gray-400" style={{minWidth: '800px'}}>
                                <colgroup>
                                    <col style={{width: '260px', minWidth: '260px'}} />
                                    <col style={{width: '120px', minWidth: '120px'}} />
                                    <col style={{width: '80px', minWidth: '80px'}} />
                                    <col style={{width: '130px', minWidth: '130px'}} />
                                    <col style={{width: '110px', minWidth: '110px'}} />
                                    <col style={{minWidth: '120px'}} />
                                    <col style={{width: '40px'}} />
                                </colgroup>
                                <thead className="bg-gray-800 text-xs uppercase font-medium">
                                    <tr>
                                        <th className="px-4 py-2">품명</th>
                                        <th className="px-4 py-2">규격</th>
                                        <th className="px-4 py-2 text-center">수량</th>
                                        <th className="px-4 py-2">단가</th>
                                        <th className="px-4 py-2 text-right">금액</th>
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
                                                <td className="px-4 py-2 text-white">
                                                    <Select
                                                        options={partnerProducts.map(p => ({ value: p, label: p.specification ? `${p.name} (${p.specification})` : p.name }))}
                                                        value={item.product_id ? { value: item, label: item.product_spec ? `${item.product_name} (${item.product_spec})` : item.product_name } : null}
                                                        onChange={(opt) => handleProductSelect(index, opt.value)}
                                                        styles={{
                                                            ...selectStyles,
                                                            control: (base) => ({ ...base, minHeight: '34px', backgroundColor: '#1F2937', fontSize: '13px' }),
                                                            valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                                            menuPortal: (base) => ({ ...base, zIndex: 10050 }),
                                                        }}
                                                        menuPortalTarget={document.body}
                                                        menuPosition="fixed"
                                                        placeholder="품목 검색..."
                                                        isSearchable
                                                    />
                                                </td>
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
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            value={item.unit_price}
                                                            onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-white"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => openPriceHistory(index, item.product_id)}
                                                            className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
                                                            title="과거 단가 이력"
                                                        >
                                                            <History className="w-4 h-4" />
                                                        </button>
                                                    </div>
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

            {/* History Selection Modal (History) */}

            {/* Order Selection Modal (History) */}
            <OrderHistoryModal 
                isOpen={showOrderSelect}
                onClose={() => setShowOrderSelect(false)}
                onSelect={handleOrderSelect}
                partnerId={formData.partner_id}
            />

            {/* Estimate Selection Modal (History) */}
            <QuotationHistoryModal 
                isOpen={showEstimateSelect}
                onClose={() => setShowEstimateSelect(false)}
                onSelect={handleEstimateSelect}
                partnerId={formData.partner_id}
            />

            {/* Price History Sub-Modal */}
            {showPriceHistory && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
                    <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg shadow-2xl flex flex-col max-h-[70vh]">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/40">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <History className="w-4 h-4 text-blue-400" />
                                과거 단가 이력 조회
                            </h3>
                            <button onClick={() => setShowPriceHistory(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto">
                            {loadingHistory ? (
                                <div className="text-center py-8 text-gray-500">로딩 중...</div>
                            ) : priceHistory.length > 0 ? (
                                <table className="w-full text-xs text-left">
                                    <thead className="text-gray-500 uppercase bg-gray-900/50">
                                        <tr>
                                            <th className="px-3 py-2">일자</th>
                                            <th className="px-3 py-2">구분</th>
                                            <th className="px-3 py-2">거래처</th>
                                            <th className="px-3 py-2 text-right">단가</th>
                                            <th className="px-3 py-2 text-center">선택</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700 text-gray-300">
                                        {priceHistory.map((h, i) => (
                                            <tr key={i} className="hover:bg-gray-700/50">
                                                <td className="px-3 py-2">{h.date}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className={cn(
                                                        "text-[9px] px-1 rounded border",
                                                        h.type === 'QUOTATION' ? "bg-amber-900/30 border-amber-800 text-amber-300" : "bg-emerald-900/30 border-emerald-800 text-emerald-300"
                                                    )}>
                                                        {h.type === 'QUOTATION' ? '견적' : '수주'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">{h.partner_name}</td>
                                                <td className="px-3 py-2 text-right text-blue-400 font-medium">₩{h.unit_price.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <button
                                                        onClick={() => {
                                                            updateItem(historyTargetIndex, 'unit_price', h.unit_price);
                                                            setShowPriceHistory(false);
                                                        }}
                                                        className="text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 px-1.5 py-0.5 rounded border border-blue-600/30"
                                                    >
                                                        적용
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="text-center py-10 text-gray-500">
                                    과거 거래 이력이 없습니다.
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t border-gray-700 flex justify-end bg-gray-900/20">
                            <button onClick={() => setShowPriceHistory(false)} className="px-4 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-600 transition-colors">닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderModal;
