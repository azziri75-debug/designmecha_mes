import React from 'react';
import { Typography, Button, Box } from '@mui/material';
import { Printer, Send } from 'lucide-react';
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
    purchaseType = 'PURCHASE' // 'PURCHASE' or 'OUTSOURCING'
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

    const totalAmount = (data.items || []).reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const totalQty = (data.items || []).reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);

    const columns = [
        { key: 'idx', label: '순번', subLabel: 'Order', align: 'center' },
        { key: 'name', label: '품목', subLabel: 'Description', align: 'left' },
        { key: 'spec', label: '규격', subLabel: 'Gauge', align: 'center' },
        { key: 'qty', label: '수량', subLabel: 'Qty', align: 'center' },
        { key: 'price', label: '단가', subLabel: 'Unit Price', align: 'right' },
        { key: 'total', label: '금액', subLabel: 'Total Amount', align: 'right' }
    ];

    let formattedItems = (data.items || []).map((item, idx) => {
        // [NEW] Blend material and order_size into spec for clear printing
        let specDisplay = item.spec || '';
        const extraParts = [];
        if (item.material) extraParts.push(`재질: ${item.material}`);
        if (item.order_size) extraParts.push(`사이즈: ${item.order_size}`);
        
        if (extraParts.length > 0) {
            const extraStr = extraParts.join(' / ');
            specDisplay = specDisplay ? `${specDisplay} / ${extraStr}` : extraStr;
        }

        return {
            ...item,
            idx: item.idx || idx + 1,
            spec: specDisplay,
            qty: fmt(item.qty),
            price: fmt(item.price),
            total: fmt(item.total)
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

        if (key === 'qty' || key === 'price') {
            const q = parseFloat(newItems[rIdx].qty) || 0;
            const p = parseFloat(newItems[rIdx].price) || 0;
            newItems[rIdx].total = q * p;
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
            const approvalPayload = {
                title: `[${purchaseType === 'OUTSOURCING' ? '외주' : (data.purchase_type === 'CONSUMABLE' ? '소모품' : '구매')}발주서] ${data.partner_name || ''} - ${data.order_date}`,
                doc_type: 'PURCHASE_ORDER',
                content: {
                    order_no: data.order_no,
                    partner_name: data.partner_name,
                    partner_phone: data.partner_phone,
                    partner_fax: data.partner_fax,
                    order_date: data.order_date,
                    delivery_date: data.delivery_date,
                    special_notes: data.special_notes,
                    items: data.items.map((item, idx) => ({
                        idx: idx + 1,
                        name: item.name,
                        spec: item.spec,
                        qty: item.qty,
                        price: item.price,
                        total: (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0)
                    }))
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
            {/* Toolbar - Only visible in View mode and not during print */}
            {isReadOnly && (
                <Box className="idf-no-print" sx={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: 1, 
                    mb: 2, 
                    p: 1, 
                    bgcolor: '#f1f5f9', 
                    borderRadius: 1,
                    border: '1px solid #e2e8f0'
                }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Printer size={16} />}
                        onClick={() => window.print()}
                    >
                        인쇄하기
                    </Button>
                    {(!documentData || documentData.status === 'REJECTED' || !documentData.id) && orderId && (
                        <Button
                            variant="contained"
                            size="small"
                            color="primary"
                            startIcon={<Send size={16} />}
                            onClick={handleSubmitApproval}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "상신 중..." : "결재요청"}
                        </Button>
                    )}
                </Box>
            )}

            <div className={cn("bg-white text-black relative flex flex-col a4-wrapper a4-print-safe", className)} style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-8 px-2">
                <div className="w-[200px] text-[10px] space-y-0.5 pt-8">
                    <p className="flex items-center gap-1">NO : <EditableText value={data.order_no} onChange={(v) => handleMetaChange('order_no', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-100 min-h-0" /></p>
                </div>
                <div className="flex-1 flex flex-col items-center px-6">
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1, fontSize: '14px' }}>주식회사 디자인메카</Typography>
                    <div className="border-[3px] border-black px-8 py-2 text-2xl font-bold text-center leading-none" style={{ 
                        whiteSpace: 'nowrap', 
                        letterSpacing: '10px', 
                        textIndent: '10px',
                        display: 'inline-block',
                        minWidth: 'max-content'
                    }}>
                        {data.title || '구 매 발 주 서'}
                    </div>
                </div>
                <div className="w-[200px] idf-no-print">
                    {!hideApprovalGrid && <ApprovalGrid documentData={documentData} currentUser={currentUser} />}
                </div>
                {/* Print-only approval grid placeholder or simplified view if needed */}
                <div className="hidden print:block w-[200px]">
                     {!hideApprovalGrid && <ApprovalGrid documentData={documentData} currentUser={currentUser} />}
                </div>
            </div>

            {/* Info Section */}
            <div className="flex justify-between mb-6 text-xs items-start">
                <div className="space-y-4 flex-1">
                    <div className="flex items-end gap-2 text-xl font-bold border-b-2 border-black pb-1 mb-2 max-w-[260px]">
                        <EditableText value={data.partner_name || '공급처'} onChange={(v) => handleMetaChange('partner_name', v)} isReadOnly={isReadOnly} className="flex-1" />
                        <span className="text-sm pb-1 font-normal">귀하</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-gray-500">
                        <p>TEL : <span className="text-black">{data.partner_phone || '-'}</span></p>
                        <p>FAX : <span className="text-black">{data.partner_fax || '-'}</span></p>
                        <p className="pt-2">발주일 : <span className="text-black font-bold">{data.order_date || '-'}</span></p>
                    </div>
                </div>
                <div className="text-right w-[220px]">
                    <h2 className="text-xl font-bold">{company?.name || '디자인메카'}</h2>
                    <p className="tracking-widest uppercase text-[9px] text-gray-400">Designmecha Enterprise</p>
                    <div className="mt-4 space-y-0.5 text-gray-800 text-[9px]">
                        <p>{company?.address || '충남 아산시 음봉면 월암로 336-39'}</p>
                        <p>T. {company?.phone || '041-544-6220'} / F. {company?.fax || '-'}</p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1">
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
            </div>

            {/* Footer */}
            <div className="mt-8 text-[10px]">
                <div className="border border-black p-4 mb-4 min-h-[100px]">
                    <h4 className="font-bold border-b border-black w-20 mb-2 pb-1 italic">Note.</h4>
                    <EditableText
                        value={data.special_notes}
                        onChange={(v) => handleMetaChange('special_notes', v)}
                        isReadOnly={isReadOnly}
                        className="leading-relaxed items-start min-h-[60px]"
                        placeholder="상세 내용을 입력하세요..."
                        autoFit
                    />
                </div>

                <div className="flex border-2 border-black">
                    <div className="w-20 border-r-2 border-black flex flex-col items-center justify-center font-bold bg-gray-50 text-[11px]">
                        <div>발주</div><div>조건</div>
                    </div>
                    <div className="flex-1 text-[11px] flex flex-col">
                        <div className="border-b border-black p-2.5 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 납기기한 :</span>
                            <EditableText value={data.delivery_date} onChange={(v) => handleMetaChange('delivery_date', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[12px]" />
                        </div>
                        <div className="border-b border-black p-2.5 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 납품장소 :</span>
                            <EditableText value={data.delivery_place} onChange={(v) => handleMetaChange('delivery_place', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[12px]" />
                        </div>
                        <div className="border-b border-black p-2.5 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 유효기간 :</span>
                            <EditableText value={data.valid_until} onChange={(v) => handleMetaChange('valid_until', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[12px]" />
                        </div>
                        <div className="p-2.5 flex items-center gap-2">
                            <span className="font-bold w-20">◆ 결제조건 :</span>
                            <EditableText value={data.payment_terms} onChange={(v) => handleMetaChange('payment_terms', v)} isReadOnly={isReadOnly} className="flex-1 border-b border-gray-50 min-h-0 text-[12px]" />
                        </div>
                    </div>
                    {/* Stamp / Seal Area */}
                    <div className="w-[200px] border-l-2 border-black p-4 flex flex-col items-center justify-center relative">
                        <p className="text-[11px] font-bold mb-3">위와 같이 발주함.</p>
                        <div className="flex items-center gap-1 font-bold text-lg relative">
                            <span>{company?.name || '주식회사 디자인메카'}</span>
                            <span className="text-red-500 relative ml-1 text-sm font-normal">
                                (인)
                                {company?.stamp_image?.url && (
                                    <StampOverlay url={company.stamp_image.url} className="w-20 h-20 -top-6 -left-6" />
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body * { visibility: hidden !important; }
                    .a4-print-safe, .a4-print-safe * { 
                        visibility: visible !important; 
                        color: black !important;
                    }
                    .a4-print-safe {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        border: none !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .idf-no-print, .no-print, button { display: none !important; }
                    div { box-shadow: none !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>
            </div>
        </div>
    );
};

export default PurchaseOrderTemplate;
