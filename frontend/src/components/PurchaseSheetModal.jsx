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
            // Ensure images (stamps, logos) are loaded
            const images = sheetRef.current.getElementsByTagName('img');
            await Promise.all(Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
            }));

            const canvas = await html2canvas(sheetRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true
            });

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
        } catch (err) {
            console.error(err);
            alert('PDF 생성 실패: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !order) return null;

    const totalAmount = metadata.items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    const columns = [
        { key: 'idx', label: '순번', subLabel: 'Order', align: 'center' },
        { key: 'name', label: '품목', subLabel: 'Description', align: 'left' },
        { key: 'spec', label: '규격', subLabel: 'Gauge', align: 'center' },
        { key: 'qty', label: '수량', subLabel: 'Qty', align: 'center' },
        { key: 'price', label: '단가', subLabel: 'Unit Price', align: 'right' },
        { key: 'total', label: '금액', subLabel: 'Total Amount', align: 'right' },
    ];

    // Get Actual Stamp URL
    const stampUrl = company?.stamp_image?.url || company?.stamp_file?.[0]?.url || "/api/uploads/sample-stamp.png";

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
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg">{saving ? '처리 중...' : 'PDF 저장 및 첨부'}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 flex items-center justify-center"><X className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[12mm] shadow-xl relative" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>

                        {/* Header Box - Adjusted width and alignment */}
                        <div className="flex justify-between items-center mb-8 h-16">
                            <div className="w-[180px] text-[10px] space-y-0.5 self-end pb-2">
                                <p className="flex items-center gap-1 leading-none">구매발주번호 : <EditableText value={metadata.order_no} onChange={(v) => handleMetaChange('order_no', v)} className="flex-1 border-b border-gray-100 min-h-0" /></p>
                            </div>

                            <div className="flex-1 flex justify-center px-4">
                                <div className="border-[3px] border-black px-6 py-2 text-2xl font-bold tracking-[0.5em] indent-[0.5em] max-w-[300px] w-full text-center leading-none">
                                    <EditableText value={metadata.title} onChange={(v) => handleMetaChange('title', v)} isHeader className="justify-center" />
                                </div>
                            </div>

                            <div className="flex border border-black text-[9px] h-full">
                                <div className="w-8 border-r border-black bg-gray-50 flex flex-col items-center justify-center font-bold">
                                    <div className="leading-tight">신청</div><div className="leading-tight">부서</div><div className="leading-tight">결제</div>
                                </div>
                                {["신청", "담당", "대표"].map((step, i) => (
                                    <div key={i} className={cn("w-12 flex flex-col", i !== 2 && "border-r border-black")}>
                                        <div className="border-b border-black bg-gray-50 h-5 flex items-center justify-center font-bold">{step}</div>
                                        <div className="flex-1"></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Partner & Company Info */}
                        <div className="flex justify-between mb-6 text-xs items-start">
                            <div className="space-y-2 flex-1">
                                <div className="flex items-end gap-2 text-xl font-bold border-b-2 border-black pb-1 mb-2 max-w-[280px]">
                                    <EditableText value={order.partner?.name || '공급처'} className="flex-1" />
                                    <span className="text-sm pb-1 font-normal">귀하</span>
                                </div>
                                <div className="space-y-0.5 text-[10px] text-gray-600">
                                    <p className="flex items-center gap-1">TEL. : <span className="text-black">{order.partner?.phone || '-'}</span></p>
                                    <p className="flex items-center gap-1">FAX. : <span className="text-black">{order.partner?.fax || '-'}</span></p>
                                    <p className="flex items-center gap-1 pt-1 opacity-70">Date : <span className="text-black font-bold">{order.order_date || '2026. 02. 25.'}</span></p>
                                </div>
                            </div>
                            <div className="text-right w-[240px]">
                                <h2 className="text-xl font-bold leading-tight">{company?.name || '디자인메카'}</h2>
                                <p className="text-[9px] text-gray-400 uppercase tracking-widest leading-none mt-0.5">Designmecha CO., LTD</p>
                                <div className="text-[9px] mt-3 space-y-0.5 text-gray-800">
                                    <p>주소 : {company?.address || '충남 아산시 탕정면 갈산리 100 선문대'}</p>
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
                        <div className="flex border-2 border-black border-t-0 font-bold text-[10px] bg-gray-50 h-10 items-center">
                            <div className="border-r border-black flex-1 text-center uppercase">합계 (VAT 별도)</div>
                            <div className="w-[40px] border-r border-black text-center">{fmt(metadata.items.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0))}</div>
                            <div className="w-[80px] border-r border-black"></div>
                            <div className="w-[100px] text-right px-2 text-xs">{fmt(totalAmount)} 원</div>
                        </div>

                        {/* Footer Notes */}
                        <div className="mt-8 text-[10px]">
                            <div className="border border-black p-4 mb-3 min-h-[100px]">
                                <h4 className="font-bold border-b-2 border-black w-20 mb-3 pb-1">특기 사항</h4>
                                <EditableText
                                    value={metadata.special_notes}
                                    onChange={(v) => handleMetaChange('special_notes', v)}
                                    className="leading-relaxed items-start min-h-[50px] whitespace-pre-wrap"
                                    placeholder="발주 시 주의사항을 입력하세요..."
                                />
                            </div>

                            <div className="flex border-2 border-black">
                                <div className="w-20 border-r-2 border-black bg-gray-50 flex flex-col items-center justify-center font-bold">
                                    <div className="leading-tight">납품</div><div className="leading-tight">조건</div>
                                </div>
                                <div className="flex-1 grid grid-cols-2 text-[9px]">
                                    <div className="border-b border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold whitespace-nowrap">◆ 납품기일 :</span>
                                        <EditableText value={metadata.delivery_date} onChange={(v) => handleMetaChange('delivery_date', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                                    </div>
                                    <div className="border-b border-black p-2 row-span-4 flex flex-col items-center justify-center relative bg-gray-50/30">
                                        <p className="text-[11px] font-bold mb-2 italic text-blue-900 opacity-70">위와 같이 발주합니다.</p>
                                        <div className="flex items-center gap-1 font-bold text-lg relative group">
                                            <span>{company?.name || '디자인메카'}</span>
                                            <span className="text-red-500 opacity-60 relative ml-1">
                                                (인)
                                                <StampOverlay url={stampUrl} className="w-16 h-16 -top-4 -left-4" />
                                            </span>
                                        </div>
                                    </div>
                                    <div className="border-b border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold whitespace-nowrap">◆ 납품장소 :</span>
                                        <EditableText value={metadata.delivery_place} onChange={(v) => handleMetaChange('delivery_place', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                                    </div>
                                    <div className="border-b border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold whitespace-nowrap">◆ 유효기간 :</span>
                                        <EditableText value={metadata.valid_until} onChange={(v) => handleMetaChange('valid_until', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                                    </div>
                                    <div className="border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold whitespace-nowrap">◆ 결제조건 :</span>
                                        <EditableText value={metadata.payment_terms} onChange={(v) => handleMetaChange('payment_terms', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="absolute bottom-[10mm] left-0 right-0 text-center">
                            <div className="text-[10px] text-gray-300 font-bold tracking-[1.5em] mb-1 uppercase opacity-50">
                                디자인메카
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSheetModal;
