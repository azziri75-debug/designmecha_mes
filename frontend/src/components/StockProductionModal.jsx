import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Plus, Trash2, ChevronLeft, Package, Building2, CalendarDays } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

// ── 품목 기본 행 ─────────────────────────────────────
const emptyItem = () => ({
    _id: Math.random(),
    product: null,
    productSearch: '',
    showDropdown: false,
    quantity: 1,
    target_date: '',
    note: '',
});

// ── 메인 컴포넌트 ─────────────────────────────────────
const StockProductionModal = ({ isOpen, onClose, onSuccess, initialData }) => {
    const isEdit = !!initialData;

    // Step 1: 거래처 / Step 2: 품목 입력
    const [step, setStep] = useState(1);
    const [partners, setPartners]       = useState([]);
    const [partnerSearch, setPartnerSearch] = useState('');
    const [selectedPartner, setSelectedPartner] = useState(null);

    const [commonDate, setCommonDate]   = useState(new Date().toISOString().split('T')[0]); // 요청일
    const [items, setItems]             = useState([emptyItem()]);
    const [productOptions, setProductOptions] = useState([]);
    const [loading, setLoading]         = useState(false);
    const [submitting, setSubmitting]   = useState(false);

    // ── 초기화 ──────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        api.get('/basics/partners/', { params: { type: 'CUSTOMER' } })
            .then(r => setPartners(r.data || []))
            .catch(() => {})
            .finally(() => setLoading(false));

        if (isEdit) {
            setSelectedPartner(initialData.partner || null);
            setCommonDate(initialData.request_date || new Date().toISOString().split('T')[0]);
            setItems([{
                _id: Math.random(),
                product: initialData.product || null,
                productSearch: initialData.product?.name || '',
                showDropdown: false,
                quantity: initialData.quantity || 1,
                target_date: initialData.target_date || '',
                note: initialData.note || '',
            }]);
            setStep(2);
            if (initialData.partner?.id) loadProducts(initialData.partner.id);
        } else {
            reset();
        }
    }, [isOpen, initialData]);

    const reset = () => {
        setStep(1);
        setSelectedPartner(null);
        setPartnerSearch('');
        setCommonDate(new Date().toISOString().split('T')[0]);
        setItems([emptyItem()]);
        setProductOptions([]);
    };

    const loadProducts = async (partnerId) => {
        try {
            const r = await api.get('/product/products/', { params: { partner_id: partnerId } });
            setProductOptions(r.data || []);
        } catch { setProductOptions([]); }
    };

    // ── 거래처 선택 ──────────────────────────────────
    const handlePartnerSelect = async (partner) => {
        setSelectedPartner(partner);
        setLoading(true);
        await loadProducts(partner.id);
        setLoading(false);
        setStep(2);
    };

    // ── 품목 행 수정 ──────────────────────────────────
    const updateItem = (idx, patch) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
    };

    const addItem = () => setItems(prev => [...prev, emptyItem()]);
    const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

    const handleProductSearch = (idx, val) => {
        updateItem(idx, { productSearch: val, showDropdown: true });
    };

    const handleProductSelect = (idx, product) => {
        updateItem(idx, { product, productSearch: product.name, showDropdown: false });
    };

    // ── 제출 ──────────────────────────────────────────
    const handleSubmit = async () => {
        // 유효성 검사
        for (const it of items) {
            if (!it.product) return alert('모든 행에 제품을 선택해주세요.');
            if (!it.quantity || it.quantity <= 0) return alert('수량을 입력해주세요.');
            if (!it.target_date) return alert('완료 예정일을 입력해주세요.');
        }

        setSubmitting(true);
        try {
            if (isEdit) {
                // 단건 수정
                const it = items[0];
                await api.put(`/inventory/productions/${initialData.id}`, {
                    product_id: it.product.id,
                    partner_id: selectedPartner?.id || null,
                    quantity: it.quantity,
                    request_date: commonDate,
                    target_date: it.target_date,
                    note: it.note,
                });
                alert('재고 생산 요청이 수정되었습니다.');
            } else {
                // 다중 등록:
                // 첫 번째 품목을 먼저 등록 → 받은 production_no를 batch_no로 나머지에 공유
                const firstItem = items[0];
                const firstRes = await api.post('/inventory/productions', {
                    product_id: firstItem.product.id,
                    partner_id: selectedPartner?.id || null,
                    quantity: firstItem.quantity,
                    request_date: commonDate,
                    target_date: firstItem.target_date,
                    note: firstItem.note,
                });
                const batchNo = firstRes.data.production_no; // 이게 이 그룹의 대표 재고번호

                // 나머지 품목들은 batch_no 공유
                if (items.length > 1) {
                    await Promise.all(items.slice(1).map(it =>
                        api.post('/inventory/productions', {
                            product_id: it.product.id,
                            partner_id: selectedPartner?.id || null,
                            quantity: it.quantity,
                            request_date: commonDate,
                            target_date: it.target_date,
                            note: it.note,
                            batch_no: batchNo,
                        })
                    ));
                }
                alert(`재고생산 요청 ${items.length}건이 등록되었습니다. (재고번호: ${batchNo})`);
            }
            onSuccess();
        } catch (e) {
            alert('저장 실패: ' + (e.response?.data?.detail || e.message));
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const filteredPartners = partners.filter(p =>
        (p.name || '').toLowerCase().includes(partnerSearch.toLowerCase()) ||
        (p.code || '').toLowerCase().includes(partnerSearch.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-700 shadow-2xl">

                {/* ── 헤더 ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Package className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {isEdit ? '재고생산 요청 수정' : '재고생산 요청 등록'}
                            </h2>
                            <p className="text-xs text-gray-500">
                                {step === 1 ? '고객사를 먼저 선택하세요' : `${selectedPartner?.name || '고객사 선택됨'} · 품목 입력`}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ── 스텝 인디케이터 ── */}
                <div className="px-6 pt-4 flex items-center gap-2 text-xs text-gray-500">
                    <div className={cn("flex items-center gap-1.5", step >= 1 ? "text-blue-400" : "")}>
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
                            step >= 1 ? "bg-blue-500 border-blue-500 text-white" : "border-gray-600"
                        )}>1</span>
                        고객사 선택
                    </div>
                    <div className="flex-1 h-px bg-gray-700 mx-1" />
                    <div className={cn("flex items-center gap-1.5", step >= 2 ? "text-blue-400" : "")}>
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
                            step >= 2 ? "bg-blue-500 border-blue-500 text-white" : "border-gray-600"
                        )}>2</span>
                        품목 및 수량 입력
                    </div>
                </div>

                {/* ── 바디 ── */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* ── STEP 1: 거래처 ── */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="고객사명 검색..."
                                    value={partnerSearch}
                                    onChange={e => setPartnerSearch(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    autoFocus
                                />
                            </div>
                            <div className="border border-gray-700 rounded-xl overflow-hidden bg-gray-800/50 max-h-72 overflow-y-auto">
                                {loading ? (
                                    <div className="p-8 text-center text-gray-500 text-sm">불러오는 중...</div>
                                ) : filteredPartners.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500 text-sm">검색 결과가 없습니다.</div>
                                ) : filteredPartners.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => handlePartnerSelect(p)}
                                        className="w-full px-4 py-3.5 text-left text-sm border-b border-gray-700/50 last:border-0 hover:bg-blue-600/20 transition-colors flex items-center gap-3 group"
                                    >
                                        <div className="p-1.5 bg-gray-700 rounded-lg group-hover:bg-blue-600/30">
                                            <Building2 className="w-4 h-4 text-gray-400 group-hover:text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-white">{p.name}</div>
                                            <div className="text-xs text-gray-500">{p.code} {p.representative && `· ${p.representative}`}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── STEP 2: 품목 입력 ── */}
                    {step === 2 && (
                        <div className="space-y-5">
                            {/* 고객사 배지 */}
                            <div className="flex items-center justify-between p-3 bg-blue-600/10 border border-blue-600/20 rounded-xl">
                                <div className="flex items-center gap-2 text-sm">
                                    <Building2 className="w-4 h-4 text-blue-400" />
                                    <span className="text-gray-400">고객사:</span>
                                    <span className="text-blue-400 font-bold">{selectedPartner?.name || '(미선택)'}</span>
                                </div>
                                {!isEdit && (
                                    <button onClick={() => setStep(1)} className="text-xs text-blue-400 hover:underline">변경</button>
                                )}
                            </div>

                            {/* 요청일 (공통) */}
                            <div className="flex items-center gap-3">
                                <label className="text-xs text-gray-500 w-20 shrink-0">요청일</label>
                                <input
                                    type="date"
                                    value={commonDate}
                                    onChange={e => setCommonDate(e.target.value)}
                                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* 품목 테이블 */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">품목 목록</span>
                                    {!isEdit && (
                                        <button
                                            onClick={addItem}
                                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/20 rounded-lg px-3 py-1.5 transition-all"
                                        >
                                            <Plus className="w-3 h-3" /> 품목 추가
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    {items.map((it, idx) => (
                                        <ItemRow
                                            key={it._id}
                                            item={it}
                                            idx={idx}
                                            productOptions={productOptions}
                                            canDelete={items.length > 1 && !isEdit}
                                            onUpdate={(patch) => updateItem(idx, patch)}
                                            onDelete={() => removeItem(idx)}
                                            onProductSearch={(val) => handleProductSearch(idx, val)}
                                            onProductSelect={(prod) => handleProductSelect(idx, prod)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── 하단 버튼 ── */}
                <div className="px-6 py-4 border-t border-gray-800 flex justify-between items-center">
                    <div className="text-xs text-gray-600">
                        {step === 2 && !isEdit && `총 ${items.length}건 등록 예정`}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-gray-400 hover:bg-gray-800 transition-colors text-sm">
                            취소
                        </button>
                        {step === 2 && (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium text-sm transition-all"
                            >
                                {submitting ? '저장 중...' : isEdit ? '수정 완료' : `재고생산 요청 (${items.length}건)`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── 품목 입력 행 컴포넌트 ─────────────────────────────
const ItemRow = ({ item, idx, productOptions, canDelete, onUpdate, onDelete, onProductSearch, onProductSelect }) => {
    const dropdownRef = useRef(null);

    const filtered = productOptions.filter(p =>
        (p.name || '').toLowerCase().includes((item.productSearch || '').toLowerCase()) ||
        (p.code || '').toLowerCase().includes((item.productSearch || '').toLowerCase())
    );

    // 외부 클릭 시 드롭다운 닫기
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                onUpdate({ showDropdown: false });
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-gray-500 font-mono pt-1 w-6 shrink-0">#{idx + 1}</span>

                {/* 제품 검색 */}
                <div className="relative flex-1" ref={dropdownRef}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input
                        type="text"
                        placeholder="제품명 또는 코드 검색..."
                        value={item.productSearch}
                        onChange={e => onProductSearch(e.target.value)}
                        onFocus={() => onUpdate({ showDropdown: true })}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {item.product && (
                        <div className="text-[10px] text-blue-400 mt-1 ml-1">{item.product.specification}</div>
                    )}
                    {item.showDropdown && item.productSearch && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-44 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <div className="p-3 text-xs text-gray-500 text-center">검색 결과 없음</div>
                            ) : filtered.map(p => (
                                <button
                                    key={p.id}
                                    onMouseDown={() => onProductSelect(p)}
                                    className="w-full px-3 py-2.5 text-left text-sm border-b border-gray-800 last:border-0 hover:bg-blue-600/20 transition-colors"
                                >
                                    <div className="font-medium text-white">{p.name}</div>
                                    <div className="text-xs text-gray-500">{p.code} {p.specification && `· ${p.specification}`}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {canDelete && (
                    <button onClick={onDelete} className="text-red-500/60 hover:text-red-400 p-1 transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* 수량 / 완료예정일 / 비고 */}
            <div className="grid grid-cols-3 gap-3 ml-8">
                <div>
                    <label className="text-[10px] text-gray-500 block mb-1">요청 수량</label>
                    <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white text-right outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-gray-500 block mb-1">완료 예정일 <span className="text-red-400">*</span></label>
                    <input
                        type="date"
                        value={item.target_date}
                        onChange={e => onUpdate({ target_date: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-gray-500 block mb-1">비고</label>
                    <input
                        type="text"
                        placeholder="특이사항..."
                        value={item.note}
                        onChange={e => onUpdate({ note: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>
        </div>
    );
};

export default StockProductionModal;
