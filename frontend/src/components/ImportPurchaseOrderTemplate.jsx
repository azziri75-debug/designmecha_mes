import React from 'react';
import { useNavigate } from 'react-router-dom';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import ApprovalGrid from './ApprovalGrid';
import api from '../lib/api';
import { cn } from '../lib/utils';

const ImportPurchaseOrderTemplate = ({
    data,
    onChange,
    isReadOnly,
    currentUser,
    documentData,
    company: initialCompany,
    hideApprovalGrid = false,
    className,
    onAddItem,
    onSubmitApproval,
    orderId,
    isRFQ = false,
    docType = 'IMPORT_PURCHASE_ORDER',
}) => {
    const navigate = useNavigate();
    const [company, setCompany] = React.useState(initialCompany);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (!initialCompany) fetchCompany();
        else setCompany(initialCompany);
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
        const qty = parseFloat(i.qty) || 0;
        const price = parseFloat(i.price) || 0;
        return s + qty * price;
    }, 0);

    // Table columns — English
    const columns = [
        { key: 'idx',   label: 'No.',           align: 'center' },
        { key: 'name',  label: 'Description',   align: 'left' },
        { key: 'spec',  label: 'Specification', align: 'center' },
        { key: 'qty',   label: 'Qty',           align: 'center' },
        { key: 'price', label: 'Unit Price',    align: 'right' },
        { key: 'total', label: 'Amount',        align: 'right' },
    ];

    let formattedItems = (data.items || []).map((item, idx) => {
        const rawPrice = isRFQ ? '' : fmt(item.price);
        const rawTotal = isRFQ ? '' : fmt((parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0));
        return {
            ...item,
            idx:   item.idx || idx + 1,
            spec:  item.spec || '',
            qty:   fmt(item.qty),
            price: rawPrice ? `${rawPrice}` : '',
            total: rawTotal ? `${rawTotal}` : '',
        };
    });

    // Pad to 10 rows
    if (formattedItems.length < 10) {
        const pad = 10 - formattedItems.length;
        formattedItems = [
            ...formattedItems,
            ...Array(pad).fill(null).map((_, i) => ({
                idx: formattedItems.length + i + 1,
                name: i === 0 ? '- Blank(below) -' : '',
                spec: '', qty: '', price: '', total: '',
            })),
        ];
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

    // Format date for display: "2026. 05. 06."
    const formatDate = (d) => {
        if (!d) return '';
        const parts = String(d).split('-');
        if (parts.length === 3) return `${parts[0]}. ${parts[1]}. ${parts[2]}.`;
        return d;
    };

    const handleSubmitApproval = async () => {
        if (!orderId) return;
        const confirmMsg = isRFQ
            ? 'Submit this RFQ for approval?'
            : 'Submit this Import Purchase Order for approval?';
        if (!window.confirm(confirmMsg)) return;

        setIsSubmitting(true);
        try {
            const partnerName = data.partner_name || 'Vendor TBD';
            const firstItem = (data.items || [])[0];
            const extraCount = (data.items || []).length > 1 ? ` + ${(data.items || []).length - 1} more` : '';
            const docTitle = isRFQ
                ? `[RFQ] (${partnerName}) - ${firstItem?.name || ''}${extraCount}`
                : `[Import PO] (${partnerName}) - ${firstItem?.name || ''}${extraCount}`;

            const approvalPayload = {
                title: docTitle,
                doc_type: isRFQ ? 'IMPORT_PURCHASE_ORDER' : 'IMPORT_PURCHASE_ORDER',
                content: {
                    order_no: data.order_no,
                    partner_name: data.partner_name,
                    partner_phone: data.partner_phone,
                    partner_fax: data.partner_fax,
                    order_date: data.order_date,
                    delivery_date: data.delivery_date,
                    special_notes: data.special_notes,
                    is_import: true,
                    is_rfq: isRFQ,
                    currency: 'USD',
                    items: (data.items || []).map((item, idx) => ({
                        idx: idx + 1,
                        name: item.name,
                        spec: item.spec,
                        qty: item.qty,
                        price: isRFQ ? '' : item.price,
                        total: isRFQ ? '' : (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0),
                    })),
                },
                reference_id: orderId,
                reference_type: 'PURCHASE',
            };

            const lineRes = await api.get('/approval/lines?doc_type=PURCHASE_ORDER');
            const customApprovers = (lineRes.data || []).map(line => ({
                staff_id: line.approver_id || line.staff_id || line.user_id || line.id || line.approver?.id || line.value,
                sequence: line.sequence,
            })).filter(a => a.staff_id);

            await api.post('/approval/documents', {
                ...approvalPayload,
                ...(customApprovers.length > 0 ? { custom_approvers: customApprovers } : {}),
            });
            alert('Approval request submitted.');
            if (onSubmitApproval) onSubmitApproval();
            navigate('/approval?mode=MY_WAITING');
        } catch (err) {
            console.error('Failed to submit approval', err);
            alert('Error: ' + (err.response?.data?.detail || err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col w-full h-full">
            <div
                className={cn('bg-white text-black relative flex flex-col flex-1 h-full', className)}
                style={{ fontFamily: "'Arial', 'Helvetica', sans-serif" }}
            >
                {/* ─── Header Row ─── */}
                <div className="flex items-start justify-between mb-3 w-full">
                    {/* Left: Doc title box */}
                    <div className="border-2 border-black px-6 py-3 mr-4 flex-shrink-0">
                        <span style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: '2px', whiteSpace: 'nowrap' }}>
                            {isRFQ ? 'REQUEST FOR QUOTATION' : 'PURCHASE ORDER'}
                        </span>
                    </div>

                    {/* Right: Approval grid */}
                    <div style={{ minWidth: '140px', display: 'flex', justifyContent: 'flex-end' }}>
                        {!hideApprovalGrid && (
                            <ApprovalGrid
                                documentData={documentData}
                                currentUser={currentUser}
                                docType="PURCHASE_ORDER"
                                englishMode={true}
                            />
                        )}
                    </div>
                </div>

                {/* ─── Info Section ─── */}
                <div className="flex flex-row justify-between mb-3 text-xs">
                    {/* Left: Vendor info */}
                    <div style={{ flex: 1, fontSize: '11px', lineHeight: '1.8' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap', gap: '4px' }}>
                            <strong>PO No. :</strong>
                            <span style={{ textDecoration: 'underline', display: 'inline-block' }}>
                                <EditableText
                                    value={data.order_no || ''}
                                    onChange={(v) => handleMetaChange('order_no', v)}
                                    isReadOnly={isReadOnly}
                                    className="inline-block"
                                />
                            </span>
                        </div>
                        <div style={{ marginTop: '4px' }}>
                            <strong>VENDOR :</strong>&nbsp;
                            <EditableText
                                value={data.partner_name || 'Vendor Name'}
                                onChange={(v) => handleMetaChange('partner_name', v)}
                                isReadOnly={isReadOnly}
                                className="inline-block border-b border-black"
                                style={{ minWidth: '200px' }}
                                autoFit
                            />
                        </div>
                        <div>
                            <strong>TEL. :</strong>&nbsp;
                            <EditableText
                                value={data.partner_phone || ''}
                                onChange={(v) => handleMetaChange('partner_phone', v)}
                                isReadOnly={isReadOnly}
                                className="inline-block border-b border-black"
                                style={{ minWidth: '150px' }}
                            />
                        </div>
                        <div>
                            <strong>FAX. :</strong>&nbsp;
                            <EditableText
                                value={data.partner_fax || ''}
                                onChange={(v) => handleMetaChange('partner_fax', v)}
                                isReadOnly={isReadOnly}
                                className="inline-block border-b border-black"
                                style={{ minWidth: '150px' }}
                            />
                        </div>
                        <div style={{ marginTop: '4px' }}>
                            <strong>Date</strong>&nbsp;
                            <EditableText
                                value={formatDate(data.order_date)}
                                onChange={(v) => handleMetaChange('order_date', v)}
                                isReadOnly={isReadOnly}
                                className="inline-block"
                            />
                        </div>
                    </div>

                    {/* Right: Our company info */}
                    <div style={{ textAlign: 'right', fontSize: '11px', lineHeight: '1.6', maxWidth: '240px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '4px' }}>
                            DESIGNMECHA CO., LTD
                        </div>
                        <div style={{ fontSize: '9px', color: '#444' }}>
                            {company?.address || '336-35, WORAM-RO, FUJMBONG-MYEON,'}
                        </div>
                        <div style={{ fontSize: '9px', color: '#444' }}>
                            ASAN SI, CHUNGCHEONGNAM DO, REPUBLIC OF KOREA
                        </div>
                        <div style={{ fontSize: '9px', color: '#444' }}>
                            TEL: {company?.phone || '+82-41-544-6220'} &nbsp; FAX: {company?.fax || '+82-41-544-6207'}
                        </div>
                    </div>
                </div>

                {/* ─── Items Table ─── */}
                <div className="w-full">
                    <ResizableTable
                        columns={columns}
                        data={formattedItems}
                        colWidths={data.colWidths}
                        onUpdateWidths={(w) => handleMetaChange('colWidths', w)}
                        onUpdateData={updateItem}
                        isReadOnly={isRFQ ? true : isReadOnly}
                        className="text-[10px]"
                    />

                    {/* Total Amount */}
                    <div className="flex border-2 border-black border-t-0 font-bold text-[12px] h-10 items-center bg-gray-50">
                        <div className="border-r border-black flex-1 text-center uppercase tracking-widest text-gray-600 flex items-center justify-center gap-2" style={{ fontSize: '12px' }}>
                            TOTAL AMOUNT
                            {!isReadOnly && onAddItem && (
                                <button
                                    onClick={onAddItem}
                                    className="bg-blue-600 text-white w-4 h-4 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors idf-no-print"
                                    title="Add item"
                                >+</button>
                            )}
                        </div>
                        <div className="w-[60px] border-r border-black" />
                        <div className="w-[80px] border-r border-black" />
                        <div className="w-[100px] text-right px-2 text-black" style={{ fontSize: '12px' }}>
                            {isRFQ ? '' : `${fmt(totalAmount)} $`}
                        </div>
                    </div>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* ─── Footer Area ─── */}
                <div className="text-[10px]">
                    {/* Note */}
                    <div className="border border-black p-2 mb-2 min-h-[50px]">
                        <h4 className="font-bold border-b border-black w-12 mb-1 pb-1 italic">NOTE.</h4>
                        <EditableText
                            value={data.special_notes}
                            onChange={(v) => handleMetaChange('special_notes', v)}
                            isReadOnly={isReadOnly}
                            className="leading-relaxed items-start min-h-[60px]"
                            placeholder="Enter notes here..."
                            autoFit
                        />
                    </div>

                    {/* Delivery Term row */}
                    <div className="flex border-2 border-black">
                        {/* Left: DELIVERY TERM */}
                        <div className="w-20 border-r-2 border-black flex flex-col items-center justify-center font-bold bg-gray-50 text-[11px] p-2">
                            <div>DELIVERY</div>
                            <div>TERM</div>
                        </div>
                        <div className="flex-1 text-[11px] flex flex-col">
                            <div className="border-b border-black p-1 flex items-center gap-2">
                                <span className="font-bold">◆ Req Dte :</span>
                                <EditableText
                                    value={data.req_dte || 'At your earliest convenience'}
                                    onChange={(v) => handleMetaChange('req_dte', v)}
                                    isReadOnly={isReadOnly}
                                    className="flex-1 text-[11px]"
                                />
                            </div>
                            <div className="border-b border-black p-1">
                                <EditableText
                                    value={data.delivery_date || ''}
                                    onChange={(v) => handleMetaChange('delivery_date', v)}
                                    isReadOnly={isReadOnly}
                                    className="flex-1 text-[11px]"
                                    placeholder="Delivery date / term"
                                />
                            </div>
                            <div className="p-1">
                                <EditableText
                                    value={/[\uAC00-\uD7A3]/.test(data.payment_terms || '') ? '' : (data.payment_terms || '')}
                                    onChange={(v) => handleMetaChange('payment_terms', v)}
                                    isReadOnly={isReadOnly}
                                    className="flex-1 text-[11px]"
                                    placeholder="Payment terms (e.g. Net 30 days after receipt)"
                                />
                            </div>
                        </div>
                        {/* Right: company name + stamp */}
                        <div className="w-[180px] border-l-2 border-black p-4 flex flex-col items-center justify-center relative">
                            {(() => {
                                const finalApprover = documentData?.status === 'APPROVED'
                                    ? documentData.lines?.slice().reverse().find(l => l.status === 'APPROVED')
                                    : null;
                                return (
                                    <div className="flex flex-col items-center gap-2">
                                        {finalApprover && (
                                            <div className="flex items-center gap-2 text-[10px] text-gray-700">
                                                <span>Approved: {finalApprover.staff?.name || finalApprover.approver?.name}</span>
                                                {finalApprover.signature_url && (
                                                    <img
                                                        src={finalApprover.signature_url.startsWith('http') ? finalApprover.signature_url : `/${finalApprover.signature_url}`}
                                                        alt="signature"
                                                        className="h-8 object-contain mix-blend-multiply"
                                                    />
                                                )}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 font-bold text-sm relative whitespace-nowrap">
                                            <span>DESIGNMECHA CO., LTD.</span>
                                            {company?.stamp_image?.url && (
                                                <StampOverlay url={company.stamp_image.url} className="w-16 h-16 -top-4 -left-4" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Bottom footer */}
                <div className="text-center text-[10px] font-bold mt-2 pt-2 border-t border-gray-300">
                    DESIGNMECHA CO., LTD.
                </div>
            </div>
        </div>
    );
};

export default ImportPurchaseOrderTemplate;
