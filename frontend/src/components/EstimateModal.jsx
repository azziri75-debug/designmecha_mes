import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, FileText, Upload, History } from 'lucide-react';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';
import Select from 'react-select';
import OrderHistoryModal from './OrderHistoryModal';
import QuotationHistoryModal from './QuotationHistoryModal';

const EstimateModal = ({ isOpen, onClose, onSuccess, partners, estimateToEdit = null }) => {
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
        estimate_date: new Date().toISOString().split('T')[0],
        valid_until: '',
        items: [],
        note: '',
        attachment_file: []
    });

    const [partnerProducts, setPartnerProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // Price History State
    const [showPriceHistory, setShowPriceHistory] = useState(false);
    const [priceHistory, setPriceHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyTargetIndex, setHistoryTargetIndex] = useState(null);

    // History Selection Modal States
    const [showOrderSelect, setShowOrderSelect] = useState(false);
    const [showEstimateSelect, setShowEstimateSelect] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (estimateToEdit) {
                setFormData({
                    partner_id: estimateToEdit.partner_id,
                    estimate_date: estimateToEdit.estimate_date,
                    valid_until: estimateToEdit.valid_until || '',
                    items: estimateToEdit.items.map(item => ({
                        product_id: item.product_id,
                        product_name: item.product_name || item.product?.name || 'Unknown',
                        product_spec: item.product?.specification || '',
                        unit: item.product?.unit || 'EA',
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        note: item.note || '',
                        is_discount: !item.product_id && item.product_name === '할인금액'
                    })),
                    note: estimateToEdit.note || '',
                    attachment_file: (() => {
                        if (!estimateToEdit.attachment_file) return [];
                        if (Array.isArray(estimateToEdit.attachment_file)) return estimateToEdit.attachment_file;
                        return safeParseJSON(estimateToEdit.attachment_file, []);
                    })()
                });
            } else {
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

    const addItem = () => {
        if (!formData.partner_id) return alert("먼저 거래처를 선택해주세요.");
        const newItem = {
            product_id: null,
            product_name: '',
            product_spec: '',
            unit: 'EA',
            quantity: 1,
            unit_price: 0,
            note: '',
            is_new: true
        };
        setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    };

    const addDiscount = () => {
        if (!formData.partner_id) return alert("먼저 거래처를 선택해주세요.");
        const newItem = {
            product_id: null,
            product_name: '할인금액',
            product_spec: '할인',
            unit: '-',
            quantity: 1,
            unit_price: 0,
            note: '',
            is_discount: true
        };
        setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    };

    const handleProductSelect = async (index, product) => {
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
            unit_price: recentPrice,
            is_new: false
        };
        setFormData(prev => ({ ...prev, items: newItems }));
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

    const removeFile = (index) => {
        setFormData(prev => ({
            ...prev,
            attachment_file: prev.attachment_file.filter((_, i) => i !== index)
        }));
    };

    const handleOrderSelect = (ord) => {
        setFormData(prev => ({
            ...prev,
            items: ord.items.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name || item.product?.name || 'Unknown',
                product_spec: item.product?.specification || '',
                unit: item.product?.unit || 'EA',
                quantity: item.quantity,
                unit_price: item.unit_price,
                note: item.note || '',
                is_discount: !item.product_id && item.product_name === '할인금액'
            }))
        }));
        setShowOrderSelect(false);
    };

    const handleEstimateSelect = (est) => {
        setFormData(prev => ({
            ...prev,
            items: est.items.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name || item.product?.name || 'Unknown',
                product_spec: item.product?.specification || '',
                unit: item.product?.unit || 'EA',
                quantity: item.quantity,
                unit_price: item.unit_price,
                note: item.note || '',
                is_discount: !item.product_id && item.product_name === '할인금액'
            }))
        }));
        setShowEstimateSelect(false);
    };

    const handleSubmit = async () => {
        if (!formData.partner_id) return alert("거래처를 선택해주세요.");
        if (formData.items.length === 0) return alert("품목을 최소 1개 이상 추가해주세요.");

        const total_amount = formData.items.reduce((sum, item) => {
            const price = item.is_discount ? -Math.abs(item.unit_price) : item.unit_price;
            return sum + (item.quantity * price);
        }, 0);

        const payload = {
            ...formData,
            valid_until: formData.valid_until || null,
            total_amount,
            attachment_file: formData.attachment_file,
            items: formData.items.map(item => ({
                ...item,
                unit_price: item.is_discount ? -Math.abs(item.unit_price) : item.unit_price
            }))
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
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-white">{estimateToEdit ? '견적 수정' : '신규 견적 등록'}</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowEstimateSelect(true)}
                                disabled={!formData.partner_id}
                                className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded disabled:bg-gray-600 transition-colors flex items-center gap-1"
                            >
                                <History className="w-3 h-3" /> 견적 불러오기
                            </button>
                            <button
                                onClick={() => setShowOrderSelect(true)}
                                disabled={!formData.partner_id}
                                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded disabled:bg-gray-600 transition-colors flex items-center gap-1"
                            >
                                <History className="w-3 h-3" /> 수주 불러오기
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">견적일자</label>
                            <input type="date" value={formData.estimate_date} onChange={(e) => setFormData({ ...formData, estimate_date: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">유효기간</label>
                            <input type="date" value={formData.valid_until} onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">비고</label>
                            <input type="text" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5" placeholder="특이사항 입력" />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-gray-400">파일 첨부 (도면/의뢰서)</label>
                            <label className="cursor-pointer bg-gray-700 text-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-600 flex items-center gap-2">
                                <Upload className="w-3 h-3" /> 파일 선택
                                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                        {formData.attachment_file.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.attachment_file.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-gray-900 px-3 py-1 rounded-full border border-gray-700 text-sm text-gray-300">
                                        <FileText className="w-3 h-3" />
                                        <span className="truncate max-w-[150px]">{file.name}</span>
                                        <button onClick={() => removeFile(idx)} className="text-gray-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-white">견적 품목</h3>
                            <div className="flex gap-2">
                                <button onClick={addDiscount} className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 flex items-center gap-1"><Plus className="w-3 h-3" /> 할인 추가</button>
                                <button onClick={addItem} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 flex items-center gap-1"><Plus className="w-3 h-3" /> 품목 추가</button>
                            </div>
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
                                        <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-600">등록된 품목이 없습니다.</td></tr>
                                    ) : (
                                        formData.items.map((item, index) => (
                                            <tr key={index} className={item.is_discount ? "bg-amber-900/10" : ""}>
                                                <td className="px-4 py-2 text-white">
                                                    {item.is_discount ? (
                                                        <span className="font-bold text-amber-400">할인금액</span>
                                                    ) : (
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
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">{item.product_spec}</td>
                                                <td className="px-4 py-2">
                                                    <input type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)} disabled={item.is_discount} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-white disabled:opacity-50" />
                                                </td>
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className={item.is_discount ? "text-amber-400" : ""}>{item.is_discount ? "-" : ""}</span>
                                                        <input type="number" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)} className={cn("w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-white", item.is_discount && "text-amber-400")} />
                                                        {!item.is_discount && (
                                                            <button type="button" onClick={() => openPriceHistory(index, item.product_id)} className="p-1 text-gray-400 hover:text-blue-400 transition-colors" title="과거 단가 이력"><History className="w-4 h-4" /></button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className={cn("px-4 py-2 text-right font-medium", item.is_discount ? "text-amber-400" : "text-blue-400")}>
                                                    {(item.is_discount ? -Math.abs(item.unit_price) : (item.quantity * item.unit_price)).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <input type="text" value={item.note || ''} onChange={(e) => updateItem(index, 'note', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white" />
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <button onClick={() => removeItem(index)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
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
                                                {formData.items.reduce((sum, i) => {
                                                    const price = i.is_discount ? -Math.abs(i.unit_price) : i.unit_price;
                                                    return sum + (i.quantity * price);
                                                }, 0).toLocaleString()}
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

            <OrderHistoryModal isOpen={showOrderSelect} onClose={() => setShowOrderSelect(false)} onSelect={handleOrderSelect} partnerId={formData.partner_id} />
            <QuotationHistoryModal isOpen={showEstimateSelect} onClose={() => setShowEstimateSelect(false)} onSelect={handleEstimateSelect} partnerId={formData.partner_id} />

            {showPriceHistory && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
                    <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg shadow-2xl flex flex-col max-h-[70vh]">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/40">
                            <h3 className="text-white font-bold flex items-center gap-2"><History className="w-4 h-4 text-blue-400" /> 과거 단가 이력 조회</h3>
                            <button onClick={() => setShowPriceHistory(false)} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
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
                                                    <span className={cn("text-[9px] px-1 rounded border", h.type === 'QUOTATION' ? "bg-amber-900/30 border-amber-800 text-amber-300" : "bg-emerald-900/30 border-emerald-800 text-emerald-300")}>{h.type === 'QUOTATION' ? '견적' : '수주'}</span>
                                                </td>
                                                <td className="px-3 py-2">{h.partner_name}</td>
                                                <td className="px-3 py-2 text-right text-blue-400 font-medium">₩{h.unit_price.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <button onClick={() => { updateItem(historyTargetIndex, 'unit_price', h.unit_price); setShowPriceHistory(false); }} className="text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 px-1.5 py-0.5 rounded border border-blue-600/30">적용</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="text-center py-10 text-gray-500">과거 거래 이력이 없습니다.</div>
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

export default EstimateModal;
