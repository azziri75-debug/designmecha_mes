import React from 'react';
import { Typography, Button, Box } from '@mui/material';
import { Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn } from '../lib/utils';
import api from '../lib/api';
import ApprovalGrid from './ApprovalGrid';

const PurchaseOrderTemplate = ({ 
    data, 
    onChange, 
    isReadOnly, 
    currentUser, 
    documentData,
    company: initialCompany,
    hideApprovalGrid = false,
    className,
    onAddItem,
    onSearchProduct,
    onSubmitApproval,
    orderId,
    purchaseType = 'PURCHASE', // 'PURCHASE' or 'OUTSOURCING'
    docType = 'PURCHASE_ORDER'
}) => {
    const navigate = useNavigate();
    const [company, setCompany] = React.useState(initialCompany);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (!initialCompany) {
            fetchCompany();
        } else {
            setCompany(initialCompany);
        }
    }, [initialCompany]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) {
            console.error('Failed to fetch company', err);
        }
    };

    const fmt = (n) => {
        if (n === null || n === undefined || n === '') return '';
        const parsed = parseFloat(n);
        return isNaN(parsed) ? n : parsed.toLocaleString();
    };

    const totalAmount = (data.items || []).reduce((s, i) => {
        const itemTotal = (i.pricing_type === 'WEIGHT' 
            ? (parseFloat(i.total_weight) || 0) 
            : (parseFloat(i.qty) || 0)
        ) * (parseFloat(i.price) || 0);
        return s + itemTotal;
    }, 0);
    const totalQty = (data.items || []).reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);

    const isEstimate = docType === 'ESTIMATE_REQUEST';

    const columns = [
        { key: 'idx', label: '순번', subLabel: 'Order', align: 'center' },
        { key: 'name', label: '품목', subLabel: 'Description', align: 'left' },
        { key: 'spec', label: '규격', subLabel: 'Gauge', align: 'center' },
        { key: 'qty', label: '수량', subLabel: 'Qty', align: 'center' },
        { key: 'price', label: '단가', subLabel: 'Unit Price', align: 'right' },
        { key: 'total', label: '금액', subLabel: 'Total Amount', align: 'right' }
    ];

    let formattedItems = (data.items || []).map((item, idx) => {
        let specDisplay = item.spec || '';
        const extraParts = [];
        if (item.material) extraParts.push(`재질: ${item.material}`);
        if (item.order_size) extraParts.push(`사이즈: ${item.order_size}`);

        const isWeight = item.pricing_type === 'WEIGHT';

        if (isWeight) {
            if (item.unit_weight) extraParts.push(`개당: ${fmt(item.unit_weight)}kg`);
            if (item.total_weight) extraParts.push(`총중량: ${fmt(item.total_weight)}kg`);
            if (item.weight_price) extraParts.push(`중량단가: ${fmt(item.weight_price)}원/kg`);
        } else {
            if (item.total_weight) extraParts.push(`총 중량: ${fmt(item.total_weight)}kg`);
        }

        if (extraParts.length > 0) {
            const extraStr = extraParts.join(' / ');
            specDisplay = specDisplay ? `${specDisplay} / ${extraStr}` : extraStr;
        }

        // 수량 표시: 중량기준이면 "총중량(kg)" 우선, EA도 공시
        const qtyDisplay = isWeight
            ? (item.total_weight ? `${fmt(item.total_weight)}kg (${fmt(item.qty)}EA)` : fmt(item.qty))
            : fmt(item.qty);

        const priceDisplay = isEstimate ? "" :
            isWeight ? `${fmt(item.weight_price || item.price)} (원/kg)` : fmt(item.price);

        return {
            ...item,
            idx: item.idx || idx + 1,
            spec: specDisplay,
            qty: qtyDisplay,
            price: priceDisplay,
            total: isEstimate ? "" : fmt(
                (isWeight
                    ? (parseFloat(item.total_weight) || 0)
                    : (parseFloat(item.qty) || 0)
                ) * (parseFloat(item.weight_price || item.price) || 0)
            )
        };
    });

    // Pad to 10 rows for A4 aesthetic as requested by user
    if (formattedItems.length < 10) {
        const paddingCount = 10 - formattedItems.length;
        const paddingRows = Array(paddingCount).fill(null).map((_, i) => ({
            idx: formattedItems.length + i + 1,
            name: "",
            spec: "",
            qty: "",
            price: "",
            total: ""
        }));
        formattedItems = [...formattedItems, ...paddingRows];
    }

    const updateItem = (rIdx, key, val) => {
        if (isReadOnly) return;
        const newItems = [...(data.items || [])];
        let cleanVal = val;
        if (typeof val === 'string' && (key === 'qty' || key === 'price' || key === 'total')) {
            cleanVal = val.replace(/,/g, '');
        }
        newItems[rIdx] = { ...newItems[rIdx], [key]: cleanVal };
        const isWeight = newItems[rIdx].pricing_type === 'WEIGHT';
        if (key === 'qty' || key === 'price' || key === 'total_weight' || key === 'weight_price') {
            const q  = parseFloat(newItems[rIdx].qty) || 0;
            const p  = parseFloat(newItems[rIdx].weight_price || newItems[rIdx].price) || 0;
            const w  = parseFloat(newItems[rIdx].total_weight) || 0;
            newItems[rIdx].total = (isWeight ? w : q) * p;
        }
        onChange('items', newItems);
    };

    const handleMetaChange = (key, val) => {
        if (isReadOnly) return;
        onChange(key, val);
    };

    const handleSubmitApproval = async () => {
        if (!orderId) return;
        if (!window.confirm("이 내용으로 전자결재 [결재요청]을 진행하시겠습니까?")) return;

        setIsSubmitting(true);
        try {
            // 공통 정보
            const partnerName = data.partner_name || '공급사미지정';
            const items = data.items || [];

            // item.name 형식: "제품명 [공정명]" 또는 "제품명"
            const parseItemName = (name = '') => {
                const match = name.match(/^(.+?)\s*\[(.+?)\]\s*$/);
                if (match) return { product: match[1].trim(), process: match[2].trim() };
                return { product: name.trim(), process: '' };
            };

            const firstItem = items[0];
            const { product: firstProductName, process: firstProcessName } = parseItemName(firstItem?.name || '');

            // 다중 품목 처리: "제품명 외 N건"
            const extraCount = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
            const productPart = `${firstProductName}${extraCount}`;

            // 제목 생성 — 소모품 발주서 vs 일반 발주서 분기
            let docTitle;
            if (data.purchase_type === 'CONSUMABLE') {
                // 소모품: [소모품발주서] (거래처)-제품명-yyyy.mm.dd
                const rawDate = data.order_date || new Date().toISOString().slice(0, 10);
                const dateStr = rawDate.slice(0, 10).replace(/-/g, '.');
                docTitle = `[소모품발주서] (${partnerName})-${productPart}-${dateStr}`;
            } else {
                // 자재구매/외주발주: [문서종류] (거래처)-제품명-공정명-고객사|재고용
                const docLabel = purchaseType === 'OUTSOURCING' ? '외주발주서' : '구매발주서';
                const processPart = firstProcessName ? `-${firstProcessName}` : '';
                
                // 고객사 명칭 및 재고용 접미사 처리
                const customerBase = data.related_customer_names || '';
                const stockSuffix = data.is_stock ? '-재고용' : '';
                const customerPart = customerBase ? `-${customerBase}${stockSuffix}` : (stockSuffix || '-재고용');
                
                docTitle = `[${docLabel}] (${partnerName})-${productPart}${processPart}${customerPart}`;
            }

            const approvalPayload = {
                title: docTitle,

                doc_type: docType,
                content: {
                    order_no: data.order_no,
                    partner_name: data.partner_name,
                    partner_phone: data.partner_phone,
                    partner_fax: data.partner_fax,
                    order_date: data.order_date,
                    delivery_date: data.delivery_date,
                    special_notes: data.special_notes,
                    purchase_type: data.purchase_type || (purchaseType === 'OUTSOURCING' ? 'OUTSOURCING' : 'PURCHASE'),
                    related_customer_names: data.related_customer_names || '',
                    is_stock: data.is_stock || false,
                    items: (data.items || []).map((item, idx) => {
                        const isWeight = item.pricing_type === 'WEIGHT';
                        const multiplier = isWeight ? (parseFloat(item.total_weight) || 0) : (parseFloat(item.qty) || 0);
                        return {
                            idx: idx + 1,
                            name: item.name,
                            spec: item.spec,
                            qty: item.qty,
                            price: item.price,
                            pricing_type: item.pricing_type || 'UNIT',
                            total_weight: item.total_weight || 0,
                            total: multiplier * (parseFloat(item.price) || 0)
                        };
                    })
                },
                reference_id: orderId,
                reference_type: purchaseType === 'OUTSOURCING' ? 'OUTSOURCING' : 'PURCHASE'
            };
            
            await api.post('/approval/documents', approvalPayload);
            alert("결재 요청이 상신되었습니다.");
            if (onSubmitApproval) onSubmitApproval();
            navigate('/approval?mode=MY_WAITING');
        } catch (err) {
            console.error("Failed to submit approval", err);
            const errorMsg = err.response?.data?.detail 
                ? (typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail))
                : err.message;
            alert("결재 요청 중 오류가 발생했습니다: " + errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col w-full h-full">

            <div className={cn("bg-white text-black relative flex flex-col flex-1 h-full", className)} style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
            {/* Header */}
            {/* Header */}
            <div className="flex items-start justify-between mb-4 w-full idf-header-container">
                {/* Left: NO */}
                <div className="pt-8 idf-header-no text-gray-400" style={{ minWidth: '80px', fontSize: '6px' }}>
                    <p className="font-bold whitespace-nowrap">
                        NO : <EditableText value={data.order_no} placeholder="" onChange={(v) => handleMetaChange('order_no', v)} isReadOnly={isReadOnly} className="inline-block border-b border-gray-100" style={{ minWidth: '40px', fontSize: '6px' }} />
                    </p>
                </div>

                {/* Center: Title */}
                <div className="flex flex-col items-center idf-header-title text-center flex-1 px-4 min-w-[240px]">
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '13px', letterSpacing: '1px' }}>주식회사 디자인메카</Typography>
                    <div className="border-[3px] border-black px-6 py-2 text-2xl font-bold text-center leading-none" style={{ 
                        letterSpacing: '8.5px', 
                        textIndent: '8.5px',
                        whiteSpace: 'nowrap'
                    }}>
                        {data.title || '구 매 발 주 서'}
                    </div>
                </div>

                {/* Right: Approval Grid */}
                <div className="idf-header-approval" style={{ minWidth: '140px', display: 'flex', justifyContent: 'flex-end' }}>
                    {!hideApprovalGrid && <ApprovalGrid documentData={documentData} currentUser={currentUser} docType={docType} />}
                </div>
            </div>

            {/* Info Section */}
            <div className="flex flex-col md:flex-row idf-print-flex-row justify-between mb-2 text-xs items-start gap-4">
                <div className="space-y-4 flex-1 w-full">
                    <div className="flex items-end gap-2 text-base md:text-lg font-bold border-b-2 border-black pb-1 mb-1 w-fit max-w-full">
                        <EditableText value={data.partner_name || '공급처'} onChange={(v) => handleMetaChange('partner_name', v)} isReadOnly={isReadOnly} className="w-auto" autoFit />
                        <span className="text-sm pb-1 font-normal min-w-max">귀하</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-gray-500">
                        <p>TEL : <span className="text-black">{data.partner_phone || '-'}</span></p>
                        <p>FAX : <span className="text-black">{data.partner_fax || '-'}</span></p>
                        <p className="pt-2">{isEstimate ? '요청일' : '발주일'} : <span className="text-black font-bold">{data.order_date || '-'}</span></p>
                    </div>
                </div>
                <div className="text-left md:text-right w-full md:w-[220px]">
                    <h2 className="text-lg font-bold">{company?.name || '디자인메카'}</h2>
                    <p className="tracking-widest uppercase text-[9px] text-gray-400">Designmecha Enterprise</p>
                    <div className="mt-4 space-y-0.5 text-gray-800 text-[9px]">
                        <p>{company?.address || '충남 아산시 음봉면 월암로 336-39'}</p>
                        <p>T. {company?.phone || '041-544-6220'} / F. {company?.fax || '-'}</p>
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="w-full">
                <ResizableTable
                    columns={columns}
                    data={formattedItems}
                    colWidths={data.colWidths}
                    onUpdateWidths={(w) => handleMetaChange('colWidths', w)}
                    onUpdateData={updateItem}
                    onSearchProduct={onSearchProduct}
                    isReadOnly={isReadOnly}
                    className="text-[10px]"
                />
                
                {/* Summary */}
                {(!isEstimate) && (
                    <div className="flex border-2 border-black border-t-0 font-bold text-[10px] h-10 items-center bg-gray-50">
                        <div className="border-r border-black flex-1 text-center uppercase tracking-widest text-gray-500 flex items-center justify-center gap-2">
                            합계 (VAT 별도)
                            {!isReadOnly && onAddItem && (
                                <button 
                                    onClick={onAddItem}
                                    className="bg-blue-600 text-white w-4 h-4 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors idf-no-print"
                                    title="품목 추가"
                                >
                                    +
                                </button>
                            )}
                        </div>
                        <div className="w-[60px] border-r border-black text-center text-gray-700">
                            {fmt(totalQty)}
                        </div>
                        <div className="w-[80px] border-r border-black"></div>
                        <div className="w-[100px] text-right px-2 text-black">{fmt(totalAmount)} 원</div>
                    </div>
                )}
            </div>

            {/* Dynamic Spacer: Fills the gap to push the footer to bottom (15mm margin) */}
            <div className="flex-1" />

            {/* Footer Area */}
            <div className="text-[10px]">
                <div className="border border-black p-2 mb-2 min-h-[50px]">
                    <h4 className="font-bold border-b border-black w-16 mb-1 pb-1 italic">Note.</h4>
                    <EditableText
                        value={data.special_notes}
                        onChange={(v) => handleMetaChange('special_notes', v)}
                        isReadOnly={isReadOnly}
                        className="leading-relaxed items-start min-h-[60px]"
                        placeholder="상세 내용을 입력하세요..."
                        autoFit
                    />
                </div>

                <div className="flex flex-col md:flex-row border-2 border-black">
                    <div className="w-full md:w-20 border-b-2 md:border-b-0 md:border-r-2 border-black flex flex-row md:flex-col items-center justify-center font-bold bg-gray-50 text-[11px] p-2 md:p-0">
                        <div className="md:block mr-2 md:mr-0">발주</div><div>조건</div>
                    </div>
                    <div className="flex-1 text-[11px] flex flex-col">
                        <div className="border-b border-black p-1 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 납기기한 :</span>
                            <EditableText value={data.delivery_date} onChange={(v) => handleMetaChange('delivery_date', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[11px]" />
                        </div>
                        <div className="border-b border-black p-1 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 납품장소 :</span>
                            <EditableText value={data.delivery_place} onChange={(v) => handleMetaChange('delivery_place', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[11px]" />
                        </div>
                        <div className="border-b border-black p-1 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 유효기간 :</span>
                            <EditableText value={data.valid_until} onChange={(v) => handleMetaChange('valid_until', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[11px]" />
                        </div>
                        <div className="p-1 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 결제조건 :</span>
                            <EditableText value={data.payment_terms} onChange={(v) => handleMetaChange('payment_terms', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[11px]" />
                        </div>
                    </div>
                    {/* Stamp / Seal Area */}
                    <div className="w-full md:w-[200px] border-t-2 md:border-t-0 md:border-l-2 border-black p-4 flex flex-col items-center justify-center relative">
                        <p className="text-[11px] font-bold mb-3">
                            {isEstimate ? "위와 같이 견적을 의뢰합니다." : "위와 같이 발주합니다."}
                        </p>
                        
                        {(() => {
                            let finalApprover = null;
                            if (documentData && documentData.status === 'APPROVED') {
                                // Find the last approver who approved it (skipping drafter)
                                finalApprover = documentData.lines?.slice().reverse().find(l => l.status === 'APPROVED');
                            }
                            
                            return (
                                <div className="flex flex-col items-center gap-2">
                                    {finalApprover && (
                                        <div className="flex items-center gap-2 text-[10px] text-gray-700 font-medium">
                                            <span>승인자: {finalApprover.staff?.name || finalApprover.approver?.name || '알수없음'}</span>
                                            {finalApprover.signature_url ? (
                                                <img 
                                                    src={finalApprover.signature_url.startsWith('http') ? finalApprover.signature_url : `/${finalApprover.signature_url}`} 
                                                    alt="서명" 
                                                    className="h-8 object-contain mix-blend-multiply" 
                                                />
                                            ) : (
                                                <span className="text-[10px] text-blue-600 border border-blue-600 px-1 rounded font-bold">(승인)</span>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 font-bold text-lg relative mt-1 whitespace-nowrap">
                                        <span>{company?.name || '주식회사 디자인메카'}</span>
                                        <span className="text-red-500 relative ml-1 text-sm font-normal">
                                            (인)
                                            {company?.stamp_image?.url && (
                                                <StampOverlay url={company.stamp_image.url} className="w-16 h-16 -top-4 -left-4" />
                                            )}
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};

export default PurchaseOrderTemplate;
