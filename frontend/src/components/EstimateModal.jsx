import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, FileText, Upload } from 'lucide-react';
import api from '../lib/api';

const EstimateModal = ({ isOpen, onClose, onSuccess, partners, estimateToEdit = null }) => {
    // Form State
    const [formData, setFormData] = useState({
        partner_id: '',
        estimate_date: new Date().toISOString().split('T')[0],
        valid_until: '',
        items: [],
        note: '',
        attachment_file: [] // List of files
    });

    const [partnerProducts, setPartnerProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // Product Selection Modal State
    const [showProductSelect, setShowProductSelect] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (estimateToEdit) {
                // Populate for Edit
                setFormData({
                    partner_id: estimateToEdit.partner_id,
                    estimate_date: estimateToEdit.estimate_date,
                    valid_until: estimateToEdit.valid_until || '',
                    items: estimateToEdit.items.map(item => ({
                        product_id: item.product_id,
                        product_name: item.product?.name || 'Unknown',
                        product_spec: item.product?.specification || '',
                        unit: item.product?.unit || 'EA',
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        note: item.note || ''
                    })),
                    note: estimateToEdit.note || '',
                    attachment_file: (() => {
                        if (!estimateToEdit.attachment_file) return [];
                        if (Array.isArray(estimateToEdit.attachment_file)) return estimateToEdit.attachment_file;
                        try { return JSON.parse(estimateToEdit.attachment_file); } catch { return []; }
                    })()
                });
            } else {
                // Reset for New
                setFormData({
                    partner_id: '',
                    estimate_date: new Date().toISOString().split('T')[0],
                    valid_until: '',
                    items: [],
                    note: '',
                    attachment_file: []
                });
            }
            setPartnerProducts([]);
        }
    }, [isOpen, estimateToEdit]);

    // Fetch products when partner changes
    useEffect(() => {
        if (formData.partner_id) {
            fetchPartnerProducts(formData.partner_id);
        } else {
            setPartnerProducts([]);
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

    const handleProductSelect = async (product) => {
        // Check if already added
        if (formData.items.some(item => item.product_id === product.id)) {
            alert("이미 추가된 품목입니다.");
            return;
        }

        // Fetch recent price
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

    const updateItem = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const removeItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newAttachments = [];
        for (const file of files) {
            const uploadData = new FormData();
            uploadData.append('file', file);
            try {
                const res = await api.post('/upload', uploadData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                newAttachments.push({ name: res.data.filename, url: res.data.url });
            } catch (error) {
                console.error("File upload failed", error);
                alert(`${file.name} 업로드 실패`);
            }
        }

        setFormData(prev => ({
            ...prev,
            attachment_file: [...prev.attachment_file, ...newAttachments]
        }));
    };

    const removeFile = (index) => {
        setFormData(prev => ({
            ...prev,
            attachment_file: prev.attachment_file.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async () => {
        if (!formData.partner_id) return alert("거래처를 선택해주세요.");
        if (formData.items.length === 0) return alert("품목을 최소 1개 이상 추가해주세요.");

        // Calculate Total
        const total_amount = formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

        const payload = {
            ...formData,
            valid_until: formData.valid_until || null,
            total_amount,
            attachment_file: formData.attachment_file
        };

        try {
            if (estimateToEdit) {
                await api.put(`/sales/estimates/${estimateToEdit.id}`, payload);
                alert("견적서가 수정되었습니다.");
            } else {
                await api.post('/sales/estimates/', payload);
                alert("견적서가 등록되었습니다.");
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Registration/Update failed", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">{estimateToEdit ? '견적 수정' : '신규 견적 등록'}</h2>
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
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">견적일자</label>
                            <input
                                type="date"
                                value={formData.estimate_date}
                                onChange={(e) => setFormData({ ...formData, estimate_date: e.target.value })}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">유효기간</label>
                            <input
                                type="date"
                                value={formData.valid_until}
                                onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">비고</label>
                            <input
                                type="text"
                                value={formData.note}
                                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5"
                                placeholder="특이사항 입력"
                            />
                        </div>
                    </div>

                    {/* File Attachment */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-gray-400">파일 첨부 (도면/의뢰서)</label>
                            <label className="cursor-pointer bg-gray-700 text-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-600 flex items-center gap-2">
                                <Upload className="w-3 h-3" />
                                파일 선택
                                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                        {formData.attachment_file.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.attachment_file.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-gray-900 px-3 py-1 rounded-full border border-gray-700 text-sm text-gray-300">
                                        <FileText className="w-3 h-3" />
                                        <span className="truncate max-w-[150px]">{file.name}</span>
                                        <button onClick={() => removeFile(idx)} className="text-gray-500 hover:text-red-400">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Items Table */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-white">견적 품목</h3>
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
                            {loadingProducts ? (
                                <div className="text-center py-8 text-gray-500">로딩 중...</div>
                            ) : partnerProducts.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">해당 거래처의 등록된 제품이 없습니다.</div>
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
                                                <div className="text-sm text-gray-400">{prod.specification} | {prod.material}</div>
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
        </div>
    );
};

export default EstimateModal;
