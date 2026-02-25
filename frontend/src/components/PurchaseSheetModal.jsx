import React, { useEffect, useState, useRef } from 'react';
import { X, Download, Save } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn } from '../lib/utils';

const PurchaseSheetModal = ({ isOpen, onClose, order, sheetType = 'purchase_order', orderType = 'purchase', onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(sheetType);

    const [metadata, setMetadata] = useState({
        title: activeTab === 'purchase_order' ? "구 매 발 주 서" : "견 적 의 뢰 서",
        order_no: "",
        special_notes: "",
        delivery_date: "",
        delivery_place: "(주)디자인메카",
        valid_until: "",
        payment_terms: "납품 후 정기결제",
        colWidths: [40, 200, 120, 40, 80, 100],
        items: []
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && order) {
            fetchCompany();
            initializeMetadata();
        }
    }, [isOpen, order, activeTab]);

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
            total: item.quantity * (item.unit_price || 0)
        }));

        // Fill empty rows to make it look full
        while (items.length < 12) {
            items.push({ idx: "", name: "", spec: "", qty: "", price: "", total: "" });
        }

        setMetadata(prev => ({
            ...prev,
            title: activeTab === 'purchase_order' ? "구 매 발 주 서" : "견 적 의 뢰 서",
            order_no: order.order_no || "",
            delivery_date: order.delivery_date || '',
            special_notes: order.note || "",
            items: items
        }));
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const updateItem = (rIdx, key, val) => {
        const newItems = [...metadata.items];
        newItems[rIdx][key] = val;
        // Auto recalc total if qty or price changes
        if (key === 'qty' || key === 'price') {
            const q = parseFloat(newItems[rIdx].qty) || 0;
            const p = parseFloat(newItems[rIdx].price) || 0;
            newItems[rIdx].total = q * p;
        }
        setMetadata(prev => ({ ...prev, items: newItems }));
    };

    const fmt = (n) => typeof n === 'number' ? n.toLocaleString() : n;

    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const canvas = await html2canvas(sheetRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            const fileName = `${activeTab}_${order.order_no}_${Date.now()}.pdf`;

            if (action === 'download') {
                pdf.save(fileName);
            } else {
                const blob = pdf.output('blob');
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

                let currentAttachments = [];
                try { if (order.attachment_file) currentAttachments = typeof order.attachment_file === 'string' ? JSON.parse(order.attachment_file) : order.attachment_file; } catch { currentAttachments = []; }
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                const apiBase = orderType === 'outsourcing' ? '/purchasing/outsourcing/orders' : '/purchasing/purchase/orders';
                await api.put(`${apiBase}/${order.id}`, { attachment_file: newAttachments, sheet_metadata: metadata });
                alert("저장 및 첨부되었습니다.");
                if (onSave) onSave();
                onClose();
            }
        } catch (err) { alert('PDF 생성 실패'); } finally { setSaving(false); }
    };

    if (!isOpen || !order) return null;

    const totalAmount = metadata.items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    const columns = [
        { key: 'idx', label: '순위', subLabel: 'Order', align: 'center' },
        { key: 'name', label: '품목', subLabel: 'Description', align: 'left' },
        { key: 'spec', label: '규격', subLabel: 'Gauge', align: 'center' },
        { key: 'qty', label: '수량', subLabel: 'Qty', align: 'center' },
        { key: 'price', label: '단가', subLabel: 'Unit Price', align: 'right' },
        { key: 'total', label: '금액', subLabel: 'Total Amount', align: 'right' },
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
                        <button onClick={() => setActiveTab('estimate_request')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === 'estimate_request' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}>견적의뢰서</button>
                        <button onClick={() => setActiveTab('purchase_order')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === 'purchase_order' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}>구매발주서</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => generatePDF('download')} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">다운로드</button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20">{saving ? '저장 중...' : 'PDF 저장 및 첨부'}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 flex items-center justify-center"><X className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[12mm] shadow-xl relative" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>

                        {/* Header Box */}
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex-1 pt-4">
                                <p className="text-[10px] mb-1">구매발주번호 : <EditableText value={metadata.order_no} onChange={(v) => handleMetaChange('order_no', v)} className="inline-block min-w-[100px]" /></p>
                            </div>
                            <div className="flex-1 flex justify-center">
                                <div className="border-2 border-black px-8 py-2 text-2xl font-bold tracking-[0.5em] indent-[0.5em]">
                                    <EditableText value={metadata.title} onChange={(v) => handleMetaChange('title', v)} isHeader />
                                </div>
                            </div>
                            <div className="flex border border-black text-[9px] ml-auto">
                                <div className="w-8 border-r border-black bg-gray-50 flex flex-col items-center justify-center font-bold py-1">
                                    <div>신청</div><div>부서</div><div>결제</div>
                                </div>
                                {["신청", "담당", "대표"].map((step, i) => (
                                    <div key={i} className={cn("w-12 flex flex-col", i !== 2 && "border-r border-black")}>
                                        <div className="border-b border-black bg-gray-50 py-0.5 text-center font-bold h-4 flex items-center justify-center">{step}</div>
                                        <div className="h-10"></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Partner & Company Info */}
                        <div className="flex justify-between mb-6 text-xs">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-base font-bold border-b border-black pb-1 mb-2">
                                    <EditableText value={order.partner?.name || '공급처'} className="min-w-[100px]" />
                                    <span>귀하</span>
                                </div>
                                <p>TEL. : {order.partner?.phone || '-'}</p>
                                <p>FAX. : {order.partner?.fax || '-'}</p>
                                <p className="pt-1">Date : {order.order_date || '2026. 02. 25.'}</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-lg font-bold">(주){company?.name || '디자인메카'}</h2>
                                <p className="text-[9px] text-gray-400 uppercase tracking-widest leading-none">Designmecha CO., LTD</p>
                                <div className="text-[9px] mt-2 space-y-0.5">
                                    <p>주소 : {company?.address || '충남 아산시 탕정면 갈산리 100 선문대 생산시스템기술연구소 내'}</p>
                                    <p>TEL : {company?.phone || '041-544-6220'}, FAX : {company?.fax || '041-530-2338'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Resizable Table */}
                        <ResizableTable
                            columns={columns}
                            data={metadata.items}
                            colWidths={metadata.colWidths}
                            onUpdateWidths={(w) => handleMetaChange('colWidths', w)}
                            onUpdateData={updateItem}
                            className="text-[10px]"
                        />

                        {/* Summary Row */}
                        <div className="flex border-2 border-black border-t-0 font-bold text-[10px] bg-gray-50">
                            <div className="border-r border-black py-1.5 flex-1 text-center uppercase">합계 (VAT 별도)</div>
                            <div className="w-[100px] border-r border-black text-center py-1.5">{fmt(metadata.items.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0))}</div>
                            <div className="w-[80px] border-r border-black"></div>
                            <div className="w-[100px] text-right py-1.5 px-2 text-xs">{fmt(totalAmount)} 원</div>
                        </div>

                        {/* Footer Notes */}
                        <div className="mt-4 text-[10px]">
                            <div className="border border-black p-3 mb-2 min-h-[80px]">
                                <h4 className="font-bold border-b border-black w-20 mb-2 flex items-center gap-1">특기 사항</h4>
                                <EditableText
                                    value={metadata.special_notes}
                                    onChange={(v) => handleMetaChange('special_notes', v)}
                                    className="leading-relaxed items-start min-h-[40px] whitespace-pre-wrap"
                                    placeholder="발주 시 주의사항을 입력하세요..."
                                />
                            </div>

                            <div className="flex border border-black">
                                <div className="w-16 border-r border-black bg-gray-50 flex flex-col items-center justify-center font-bold">
                                    <div>납품</div><div>조건</div>
                                </div>
                                <div className="flex-1 grid grid-cols-2 text-[9px]">
                                    <div className="border-b border-r border-black p-1.5 flex items-center gap-2">
                                        <span className="font-bold">◆ 납품기일 :</span>
                                        <EditableText value={metadata.delivery_date} onChange={(v) => handleMetaChange('delivery_date', v)} className="flex-1" />
                                    </div>
                                    <div className="border-b border-black p-2 row-span-4 flex flex-col items-center justify-center relative">
                                        <p className="text-[11px] font-bold mb-1 italic">위와 같이 발주합니다.</p>
                                        <div className="flex items-center gap-1 font-bold text-base relative">
                                            <span>(주){company?.name || '디자인메카'}</span>
                                            <span className="text-red-500 opacity-50 relative">
                                                (인)
                                                <StampOverlay url="/api/uploads/sample-stamp.png" className="w-14 h-14 -top-3 -left-3" />
                                            </span>
                                        </div>
                                    </div>
                                    <div className="border-b border-r border-black p-1.5 flex items-center gap-2">
                                        <span className="font-bold">◆ 납품장소 :</span>
                                        <EditableText value={metadata.delivery_place} onChange={(v) => handleMetaChange('delivery_place', v)} className="flex-1" />
                                    </div>
                                    <div className="border-b border-r border-black p-1.5 flex items-center gap-2">
                                        <span className="font-bold">◆ 유효기간 :</span>
                                        <EditableText value={metadata.valid_until} onChange={(v) => handleMetaChange('valid_until', v)} className="flex-1" />
                                    </div>
                                    <div className="border-r border-black p-1.5 flex items-center gap-2">
                                        <span className="font-bold">◆ 결제조건 :</span>
                                        <EditableText value={metadata.payment_terms} onChange={(v) => handleMetaChange('payment_terms', v)} className="flex-1" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 text-center text-[9px] text-gray-400 font-bold border-t border-gray-100 pt-2 tracking-[1em] uppercase">
                            (주) 디자인메카
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSheetModal;
