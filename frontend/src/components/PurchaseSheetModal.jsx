import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { EditableText, StampOverlay } from './DocumentUtils';
import { cn } from '../lib/utils';

const PurchaseSheetModal = ({ isOpen, onClose, order, sheetType = 'purchase_order', orderType = 'purchase', onSave }) => {
    const [company, setCompany] = useState(null);
    const [template, setTemplate] = useState(null);
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
        show_stamp: true,
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && order) {
            fetchCompany();
            fetchTemplate();
            initializeMetadata();
        }
    }, [isOpen, order, activeTab]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) { console.error('Failed to fetch company', err); }
    };

    const fetchTemplate = async () => {
        try {
            const res = await api.get('/basics/form-templates/');
            const type = activeTab === 'purchase_order' ? 'PURCHASE' : 'ESTIMATE_REQUEST';
            const tm = res.data.find(t => t.form_type === type);
            if (tm) setTemplate(tm);
        } catch (err) { console.error('Failed to fetch template', err); }
    };

    const initializeMetadata = () => {
        if (!order) return;
        setMetadata(prev => ({
            ...prev,
            title: activeTab === 'purchase_order' ? "구 매 발 주 서" : "견 적 의 뢰 서",
            order_no: order.order_no || "",
            delivery_date: order.delivery_date || '',
            special_notes: order.note || "",
        }));
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const fmt = (n) => n?.toLocaleString() || "0";

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

    const totalAmount = (order.items || []).reduce((s, i) => s + (i.quantity * (i.unit_price || 0)), 0);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto font-sans">
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
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[15mm] shadow-xl origin-top" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>

                        {/* Header: Title and Approval Box */}
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex-1 pt-4">
                                <p className="text-xs mb-1">구매발주번호 : <EditableText value={metadata.order_no} onChange={(v) => handleMetaChange('order_no', v)} className="inline-block min-w-[100px]" /></p>
                            </div>
                            <div className="flex-1 flex justify-center">
                                <div className="border-2 border-black px-8 py-2 text-2xl font-bold tracking-[0.5em] indent-[0.5em]">
                                    <EditableText value={metadata.title} onChange={(v) => handleMetaChange('title', v)} />
                                </div>
                            </div>
                            <div className="flex border border-black text-[10px] ml-auto">
                                <div className="w-8 border-r border-black bg-gray-50 flex flex-col items-center justify-center font-bold py-1">
                                    <div>신청</div><div>부서</div><div>결제</div>
                                </div>
                                {["신청", "담당", "대표"].map((step, i) => (
                                    <div key={i} className={cn("w-14 flex flex-col", i !== 2 && "border-r border-black")}>
                                        <div className="border-b border-black bg-gray-50 py-0.5 text-center font-bold h-5 flex items-center justify-center">{step}</div>
                                        <div className="h-10"></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Partner & Company Info */}
                        <div className="flex justify-between mb-8 text-sm">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-lg font-bold border-b border-black pb-1 mb-2">
                                    <EditableText value={order.partner?.name || '공급처'} className="min-w-[100px]" />
                                    <span>귀하</span>
                                </div>
                                <p className="text-xs">TEL. : {order.partner?.phone || '-'}</p>
                                <p className="text-xs">FAX. : {order.partner?.fax || '-'}</p>
                                <p className="text-xs pt-1">Date : {order.order_date || '2026. 02. 25.'}</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-xl font-bold">(주){company?.name || '디자인메카'}</h2>
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">Designmecha CO., LTD</p>
                                <div className="text-[10px] mt-2 space-y-0.5">
                                    <p>주소 : {company?.address || '충남 아산시 탕정면 갈산리 100 선문대 생산시스템기술연구소 내'}</p>
                                    <p>TEL : {company?.phone || '041-544-6220'}, FAX : {company?.fax || '041-530-2338'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Product Table */}
                        <table className="w-full border-collapse border-2 border-black mb-1 text-[11px]">
                            <thead>
                                <tr className="bg-gray-50 text-center font-bold">
                                    <th className="border border-black py-1.5 w-10">순위<br /><span className="text-[8px] font-normal uppercase">Order</span></th>
                                    <th className="border border-black py-1.5">품목<br /><span className="text-[8px] font-normal uppercase">Description</span></th>
                                    <th className="border border-black py-1.5 w-32">규격<br /><span className="text-[8px] font-normal uppercase">Gauge</span></th>
                                    <th className="border border-black py-1.5 w-12">수량<br /><span className="text-[8px] font-normal uppercase">Qty</span></th>
                                    <th className="border border-black py-1.5 w-24">단가<br /><span className="text-[8px] font-normal uppercase">Unit Price</span></th>
                                    <th className="border border-black py-1.5 w-28">금액<br /><span className="text-[8px] font-normal uppercase">Total Amount</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {(order.items || []).map((item, idx) => (
                                    <tr key={idx} className="text-center h-8">
                                        <td className="border border-black">{idx + 1}</td>
                                        <td className="border border-black text-left px-2 font-bold">
                                            <EditableText value={item.product?.name} autoFit maxWidth={200} />
                                        </td>
                                        <td className="border border-black">
                                            <EditableText value={item.product?.specification || item.product?.code} autoFit maxWidth={120} />
                                        </td>
                                        <td className="border border-black">{fmt(item.quantity)}</td>
                                        <td className="border border-black text-right px-1">{fmt(item.unit_price)}</td>
                                        <td className="border border-black text-right px-1 font-bold">{fmt(item.quantity * item.unit_price)}</td>
                                    </tr>
                                ))}
                                {[...Array(Math.max(0, 10 - (order.items?.length || 0)))].map((_, i) => (
                                    <tr key={`empty-${i}`} className="h-8">
                                        <td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 font-bold">
                                    <td colSpan="3" className="border border-black py-2 text-center uppercase">합계 (VAT 별도)</td>
                                    <td className="border border-black text-center">{fmt((order.items || []).reduce((s, i) => s + i.quantity, 0))}</td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black text-right px-1 text-base">{fmt(totalAmount)} 원</td>
                                </tr>
                            </tfoot>
                        </table>

                        {/* Footer Section: Notes and Terms */}
                        <div className="mt-4 text-xs">
                            <div className="border border-black p-3 mb-2 min-h-[100px]">
                                <h4 className="font-bold border-b border-black w-20 mb-2">특기 사항</h4>
                                <EditableText
                                    value={metadata.special_notes}
                                    onChange={(v) => handleMetaChange('special_notes', v)}
                                    className="leading-relaxed items-start min-h-[60px]"
                                    placeholder="발주 시 주의사항을 입력하세요..."
                                />
                            </div>

                            <div className="flex border border-black">
                                <div className="w-16 border-r border-black bg-gray-50 flex flex-col items-center justify-center font-bold">
                                    <div>납품</div><div>조건</div>
                                </div>
                                <div className="flex-1 grid grid-cols-2 text-[10px]">
                                    <div className="border-b border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold">◆ 납품기일 :</span>
                                        <EditableText value={metadata.delivery_date} onChange={(v) => handleMetaChange('delivery_date', v)} className="flex-1" />
                                    </div>
                                    <div className="border-b border-black p-2 row-span-4 flex flex-col items-center justify-center relative">
                                        <p className="text-sm font-bold mb-1 italic">위와 같이 발주합니다.</p>
                                        <div className="flex items-center gap-1 font-bold text-lg relative">
                                            <span>(주){company?.name || '디자인메카'}</span>
                                            <span className="text-red-500 opacity-50 relative">
                                                (인)
                                                <StampOverlay url="/api/uploads/sample-stamp.png" className="w-16 h-16 -top-4 -left-4" />
                                            </span>
                                        </div>
                                    </div>
                                    <div className="border-b border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold">◆ 납품장소 :</span>
                                        <EditableText value={metadata.delivery_place} onChange={(v) => handleMetaChange('delivery_place', v)} className="flex-1" />
                                    </div>
                                    <div className="border-b border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold">◆ 유효기간 :</span>
                                        <EditableText value={metadata.valid_until} onChange={(v) => handleMetaChange('valid_until', v)} className="flex-1" />
                                    </div>
                                    <div className="border-r border-black p-2 flex items-center gap-2">
                                        <span className="font-bold">◆ 결제조건 :</span>
                                        <EditableText value={metadata.payment_terms} onChange={(v) => handleMetaChange('payment_terms', v)} className="flex-1" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 text-center text-[10px] text-gray-400 font-bold border-t border-gray-100 pt-2 tracking-[1em] uppercase">
                            (주) 디자인메카
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSheetModal;
