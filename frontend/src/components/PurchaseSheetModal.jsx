import React, { useEffect, useState, useRef } from 'react';
import { X, Download, Save, Printer } from 'lucide-react';
import { toPng } from 'html-to-image';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn, safeParseJSON } from '../lib/utils';
import ApprovalGrid from './ApprovalGrid';
import { useAuth } from '../contexts/AuthContext';
import PurchaseOrderTemplate from './PurchaseOrderTemplate';

const PurchaseSheetModal = ({ isOpen, onClose, order, sheetType = 'purchase_order', orderType = 'purchase', onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(sheetType);
    const [approvalDoc, setApprovalDoc] = useState(null);
    const { currentUser } = useAuth();

    const [metadata, setMetadata] = useState({
        title: activeTab === 'purchase_order' ? "구 매 발 주 서" : "견 적 의 뢰 서",
        order_no: "",
        special_notes: "",
        delivery_date: "",
        delivery_place: "(주)디자인메카",
        valid_until: "",
        payment_terms: "물품 수령 후 정기결제",
        colWidths: [40, 200, 120, 40, 80, 100],
        items: []
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && order) {
            fetchCompany();
            initializeMetadata();
            fetchApprovalDoc();
        }
    }, [isOpen, order, activeTab]);

    const fetchApprovalDoc = async () => {
        try {
            const res = await api.get('/approval/documents/by-reference', { 
                params: { 
                    reference_id: order.id, 
                    reference_type: orderType === 'outsourcing' ? 'OUTSOURCING' : 'PURCHASE' 
                } 
            });
            if (res.data) {
                setApprovalDoc(res.data);
            } else {
                setApprovalDoc(null);
            }
        } catch (err) {
            console.error('Failed to fetch approval doc', err);
        }
    };

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) { console.error('Failed to fetch company', err); }
    };

    const initializeMetadata = () => {
        if (!order) return;
        const items = (order.items || []).map((item, idx) => ({
            idx: idx + 1,
            name: item.product?.name || "",
            spec: item.product?.specification || item.product?.code || "",
            qty: item.quantity,
            price: item.unit_price || 0,
            total: item.quantity * (item.unit_price || 0),
            material: item.material || "",
            order_size: item.order_size || ""
        }));

        while (items.length < 12) {
            items.push({ idx: "", name: "", spec: "", qty: "", price: "", total: "" });
        }

        let savedColWidths;
        try {
            if (order.sheet_metadata) {
                const sm = safeParseJSON(order.sheet_metadata, {});
                if (sm.colWidths) savedColWidths = sm.colWidths;
            }
        } catch (e) { }

        const defaultWidths = activeTab === 'purchase_order'
            ? [40, 200, 120, 60, 80, 100]
            : [40, 200, 120, 60, 180];

        setMetadata(prev => ({
            ...prev,
            title: activeTab === 'purchase_order' ? "구 매 발 주 서" : "견 적 의 뢰 서",
            order_no: order.order_no || "",
            partner_name: order.partner?.name || "",
            partner_phone: order.partner?.phone || "",
            partner_fax: order.partner?.fax || "",
            delivery_date: order.delivery_date || '',
            special_notes: order.note || "",
            colWidths: savedColWidths || defaultWidths,
            items: items
        }));
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const updateItem = (rIdx, key, val) => {
        const newItems = [...metadata.items];

        // Remove commas if numeric fields
        let cleanVal = val;
        if (typeof val === 'string' && (key === 'qty' || key === 'price' || key === 'total')) {
            cleanVal = val.replace(/,/g, '');
        }

        newItems[rIdx][key] = cleanVal;

        if (key === 'qty' || key === 'price') {
            const q = parseFloat(newItems[rIdx].qty) || 0;
            const p = parseFloat(newItems[rIdx].price) || 0;
            newItems[rIdx].total = q * p;
        }
        setMetadata(prev => ({ ...prev, items: newItems }));
    };

    const fmt = (n) => {
        if (n === null || n === undefined || n === '') return '';
        const parsed = parseFloat(n);
        return isNaN(parsed) ? n : parsed.toLocaleString();
    };

    const handlePrintWindow = async () => {
        await printAsImage(sheetRef.current, { title: '발주서/견적의뢰서', orientation: 'portrait' });
    };

    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const type = activeTab === 'purchase_order' ? '구매발주서' : '견적의뢰서';
            const vendorName = order.partner?.name || '공급사';
            const items = order.items || [];
            const firstItemName = items[0]?.product?.name || '품명';
            const extraCount = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
            const date = order.order_date || '날짜';
            const fileName = `${type}-${vendorName}-${firstItemName}${extraCount}-${date}.pdf`;
            const blob = await generateA4PDF(sheetRef.current, {
                fileName,
                orientation: 'portrait',
                action: 'blob',
                pixelRatio: 3,
                multiPage: true
            });

            if (action === 'download') {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName; a.click();
            } else {
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

                const currentAttachments = safeParseJSON(order.attachment_file, []);
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                const apiBase = orderType === 'outsourcing' ? `/purchasing/outsourcing/orders/${order.id}` : `/purchasing/purchase/orders/${order.id}`;
                await api.put(apiBase, { attachment_file: newAttachments, sheet_metadata: metadata });
                alert('저장 및 첨부되었습니다.');
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF 생성 실패: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !order) return null;

    const totalAmount = (metadata.items || []).reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    const baseColumns = [
        { key: 'idx', label: '순번', subLabel: 'Order', align: 'center' },
        { key: 'name', label: '품목', subLabel: 'Description', align: 'left' },
        { key: 'spec', label: '규격', subLabel: 'Gauge', align: 'center' },
        { key: 'qty', label: '수량', subLabel: 'Qty', align: 'center' }
    ];

    const columns = activeTab === 'purchase_order'
        ? [...baseColumns, { key: 'price', label: '단가', subLabel: 'Unit Price', align: 'right' }, { key: 'total', label: '금액', subLabel: 'Total Amount', align: 'right' }]
        : [...baseColumns, { key: 'note', label: '비고', subLabel: 'Remarks', align: 'left' }];

    const formattedItems = (metadata.items || []).map(item => ({
        ...item,
        qty: fmt(item.qty),
        price: fmt(item.price),
        total: fmt(item.total)
    }));

    // Normalized Stamp URL Binding
    let stampUrl = null;
    if (company?.stamp_image?.url) {
        stampUrl = company.stamp_image.url;
    } else if (Array.isArray(company?.stamp_image)) {
        stampUrl = company.stamp_image[0]?.url;
    } else if (company?.stamp_file?.[0]?.url) {
        stampUrl = company.stamp_file[0].url;
    }
    if (stampUrl && !stampUrl.startsWith('http') && !stampUrl.startsWith('/')) {
        stampUrl = '/' + stampUrl;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
                        <button onClick={() => setActiveTab('estimate_request')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === 'estimate_request' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}>견적의뢰서</button>
                        <button onClick={() => setActiveTab('purchase_order')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === 'purchase_order' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}>구매발주서</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrintWindow}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg flex items-center gap-1"
                        >
                            <Printer className="w-4 h-4" /> 인쇄
                        </button>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg"
                        >
                            {saving ? '처리 중...' : 'PDF 저장 및 첨부'}
                        </button>

                        {/* [MOD] 결재요청 button moved from template to header to avoid print inclusion */}
                        {(!approvalDoc || approvalDoc.status !== 'APPROVED') && (
                            <button
                                onClick={async () => {
                                    if (!order?.id) return;
                                    if (!window.confirm("이 내용으로 전자결재 [결재요청]을 진행하시겠습니까?")) return;
                                    setSaving(true);
                                    try {
                                        const firstItemProcess = metadata.items?.[0]?.name || (orderType === 'outsourcing' ? '외주공정' : (metadata.purchase_type === 'CONSUMABLE' ? '소모품' : '구매자재'));
                                        const customerName = metadata.related_customer_names || '재고용';
                                        const partnerName = metadata.partner_name || '공급사미지정';

                                        const approvalPayload = {
                                            title: `(${partnerName}) - ${firstItemProcess} - ${customerName}`,
                                            doc_type: 'PURCHASE_ORDER',
                                            content: {
                                                order_no: metadata.order_no,
                                                partner_name: metadata.partner_name,
                                                partner_phone: metadata.partner_phone,
                                                partner_fax: metadata.partner_fax,
                                                order_date: metadata.order_date || order.order_date,
                                                delivery_date: metadata.delivery_date,
                                                special_notes: metadata.special_notes,
                                                items: (metadata.items || []).filter(i => i.name).map((item, idx) => ({
                                                    idx: idx + 1,
                                                    name: item.name,
                                                    spec: item.spec,
                                                    qty: item.qty,
                                                    price: item.price,
                                                    total: (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0)
                                                }))
                                            },
                                            reference_id: order.id,
                                            reference_type: orderType === 'outsourcing' ? 'OUTSOURCING' : 'PURCHASE'
                                        };
                                        
                                        await api.post('/approval/documents', approvalPayload);
                                        alert("결재 요청이 상신되었습니다.");
                                        fetchApprovalDoc();
                                    } catch (err) {
                                        console.error("Failed to submit approval", err);
                                        alert("결재 요청 중 오류가 발생했습니다.");
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                                disabled={saving}
                                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg flex items-center gap-1"
                            >
                                <Save className="w-4 h-4" /> 결재요청
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white p-2 flex items-center justify-center"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white shadow-2xl">
                        <PurchaseOrderTemplate
                            data={metadata}
                            onChange={handleMetaChange}
                            isReadOnly={true}
                            documentData={approvalDoc}
                            currentUser={currentUser}
                            company={company}
                            orderId={order.id}
                            purchaseType={orderType === 'outsourcing' ? 'OUTSOURCING' : 'PURCHASE'}
                            docType={activeTab === 'purchase_order' ? 'PURCHASE_ORDER' : 'ESTIMATE_REQUEST'}
                            onSubmitApproval={fetchApprovalDoc}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSheetModal;
