import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, FileText } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';

/**
 * PurchaseSheetModal
 * - sheetType: 'estimate_request' | 'purchase_order'
 * - order: 구매/외주 발주 데이터
 */
const PurchaseSheetModal = ({ isOpen, onClose, order, sheetType = 'purchase_order', orderType = 'purchase', onSave }) => {
    const [company, setCompany] = useState(null);
    const [template, setTemplate] = useState(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(sheetType);

    const [metadata, setMetadata] = useState({
        title: activeTab === 'purchase_order' ? "구 매 발 주 서" : "견 적 의 뢰 서",
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
            delivery_date: order.delivery_date || '',
            special_notes: order.note || buildDefaultPoRemark(order),
        }));
    };

    const buildDefaultPoRemark = (ord) => {
        const lines = [];
        ord.items?.forEach(item => {
            if (item.note) lines.push(`• ${item.product?.name}: ${item.note}`);
        });
        return lines.join('\n');
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

    const renderBlock = (block) => {
        const config = block.config || {};
        switch (block.type) {
            case 'boxedHeader':
                return (
                    <div className="flex justify-center p-4" key={block.id}>
                        <div className="border-2 border-black px-12 py-2 text-2xl font-bold tracking-[0.5em] indent-[0.5em]">
                            {config.title || metadata.title}
                        </div>
                    </div>
                );
            case 'approval':
                const steps = config.steps || ["신청", "담당", "대표"];
                return (
                    <div className="p-2 flex justify-end" key={block.id}>
                        <div className="flex border border-black text-[10px]">
                            <div className="w-8 border-r border-black bg-gray-50 flex flex-col items-center justify-center font-bold py-1">
                                <div>결</div><div>제</div>
                            </div>
                            {steps.map((step, i) => (
                                <div key={i} className={`w-14 flex flex-col ${i !== steps.length - 1 ? 'border-r border-black' : ''}`}>
                                    <div className="border-b border-black bg-gray-50 py-0.5 text-center font-bold h-5 flex items-center justify-center">{step}</div>
                                    <div className="h-10"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'infoTable':
                return (
                    <div className="flex justify-between mb-6 text-sm" key={block.id}>
                        <div className="space-y-1">
                            <p>발주번호 : {order.order_no}</p>
                            <p className="font-bold border-b border-black inline-block pr-8">{order.partner?.name} 귀하</p>
                            <div className="text-xs space-y-0.5 pt-2">
                                <p>TEL. : {order.partner?.phone || '-'}</p>
                                <p>FAX. : {order.partner?.fax || '-'}</p>
                                <p>Date {order.order_date || ''}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <h2 className="text-xl font-bold">(주){company?.name || '디자인메카'}</h2>
                            <p className="text-[10px] text-gray-600 uppercase">Designmecha Co., Ltd</p>
                            <div className="text-[10px] mt-1">
                                <p>주소 : {company?.address}</p>
                                <p>TEL : {company?.phone}, FAX : {company?.fax}</p>
                            </div>
                        </div>
                    </div>
                );
            case 'productList':
                const total = (order.items || []).reduce((s, i) => s + (i.quantity * (i.unit_price || 0)), 0);
                return (
                    <div key={block.id}>
                        <table className="w-full border-collapse border border-black mb-1 text-xs">
                            <thead>
                                <tr className="bg-gray-50 text-center uppercase tracking-tighter">
                                    <th className="border border-black py-1 w-10">순위<br />ORDER</th>
                                    <th className="border border-black py-1">품목<br />DESCRIPTION</th>
                                    <th className="border border-black py-1 w-24">규격<br />GAUGE</th>
                                    <th className="border border-black py-1 w-12">수량<br />QUANTITY</th>
                                    <th className="border border-black py-1 w-20">단가<br />UNIT PRICE</th>
                                    <th className="border border-black py-1 w-24">금액<br />TOTAL AMOUNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(order.items || []).map((item, idx) => (
                                    <tr key={idx} className="text-center h-8">
                                        <td className="border border-black">{idx + 1}</td>
                                        <td className="border border-black text-left px-2 font-bold">{item.product?.name || '-'}</td>
                                        <td className="border border-black">{item.product?.specification || item.product?.code || '-'}</td>
                                        <td className="border border-black">{fmt(item.quantity)}</td>
                                        <td className="border border-black text-right px-1">{fmt(item.unit_price)}</td>
                                        <td className="border border-black text-right px-1">{fmt(item.quantity * item.unit_price)}</td>
                                    </tr>
                                ))}
                                {[...Array(Math.max(0, 8 - (order.items?.length || 0)))].map((_, i) => (
                                    <tr key={`empty-${i}`} className="h-8">
                                        <td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 font-bold">
                                    <td colSpan="3" className="border border-black py-1.5 text-center">합계 (VAT별도)</td>
                                    <td className="border border-black"></td><td className="border border-black"></td>
                                    <td className="border border-black text-right px-1">{fmt(total)} 원</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                );
            case 'memo':
                return (
                    <div className="text-xs" key={block.id}>
                        <div className="border border-black p-2 mb-1">
                            <p className="font-bold border-b border-black w-24 mb-1">특기 사항</p>
                            <textarea value={metadata.special_notes} onChange={(e) => handleMetaChange('special_notes', e.target.value)} className="w-full h-24 outline-none bg-transparent resize-none leading-relaxed" />
                        </div>
                        <div className="flex border border-black">
                            <div className="w-16 border-r border-black bg-gray-50 flex flex-col items-center justify-center font-bold">
                                <div>납품</div><div>조건</div>
                            </div>
                            <div className="flex-1 grid grid-cols-2 text-[10px]">
                                <div className="border-b border-r border-black p-1 flex items-center gap-1">◆ 납품기일 : <input value={metadata.delivery_date} onChange={(e) => handleMetaChange('delivery_date', e.target.value)} className="flex-1 outline-none bg-transparent" /></div>
                                <div className="border-b border-black p-1 row-span-4 flex flex-col items-center justify-center gap-2">
                                    <p className="text-sm font-bold">위와 같이 발주합니다.</p>
                                    <p className="font-bold text-lg">(주){company?.name || '디자인메카'} (인)</p>
                                </div>
                                <div className="border-b border-r border-black p-1 flex items-center gap-1">◆ 납품장소 : <input value={metadata.delivery_place} onChange={(e) => handleMetaChange('delivery_place', e.target.value)} className="flex-1 outline-none bg-transparent" /></div>
                                <div className="border-b border-r border-black p-1 flex items-center gap-1">◆ 유효기간 : <input value={metadata.valid_until} onChange={(e) => handleMetaChange('valid_until', e.target.value)} className="flex-1 outline-none bg-transparent" /></div>
                                <div className="border-r border-black p-1 flex items-center gap-1">◆ 결제조건 : <input value={metadata.payment_terms} onChange={(e) => handleMetaChange('payment_terms', e.target.value)} className="flex-1 outline-none bg-transparent" /></div>
                            </div>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    const blocks = template?.layout_data?.blocks || [
        { id: 'h1', type: 'boxedHeader' },
        { id: 'i1', type: 'infoTable' },
        { id: 'p1', type: 'productList' },
        { id: 'm1', type: 'memo' }
    ];

    if (!isOpen || !order) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto font-sans">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
                        <button onClick={() => setActiveTab('estimate_request')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'estimate_request' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>견적의뢰서</button>
                        <button onClick={() => setActiveTab('purchase_order')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'purchase_order' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>구매발주서</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => generatePDF('download')} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors"><Download className="w-4 h-4" /> 다운로드</button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"><Save className="w-4 h-4" /> {saving ? '저장 중...' : 'PDF 저장 및 첨부'}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2"><X className="w-6 h-6" /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-[#e5e7eb] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] shadow-xl origin-top" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
                        <div className="flex flex-wrap content-start w-full">
                            {blocks.map(block => {
                                const widthMap = {
                                    '100%': 'w-full', '75%': 'w-3/4', '66%': 'w-2/3', '50%': 'w-1/2', '33%': 'w-1/3', '25%': 'w-1/4'
                                };
                                return (
                                    <div key={block.id} className={widthMap[block.width || '100%']}>
                                        {renderBlock(block)}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseSheetModal;
