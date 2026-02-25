import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { EditableText, StampOverlay } from './DocumentUtils';
import { cn } from '../lib/utils';

const ProductionSheetModal = ({ isOpen, onClose, order, onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('detail'); // 'detail' or 'production'

    const [metadata, setMetadata] = useState({
        detail_title: "세 부 내 역",
        prod_title: "생 산 관 리 시 트",
        order_no: "",
        items: [], // Synchronized from order.items
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && order) {
            fetchCompany();
            initializeData();
        }
    }, [isOpen, order]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) { console.error('Failed to fetch company', err); }
    };

    const initializeData = () => {
        if (!order) return;
        setMetadata({
            detail_title: "세 부 내 역",
            prod_title: "생 산 관 리 시 트",
            order_no: order.order_no || "",
            items: (order.items || []).map(item => ({
                id: item.id,
                name: item.product?.name || "",
                spec: item.product?.specification || item.product?.code || "",
                quantity: item.quantity,
                processes: [
                    { label: "1) 원소재", value: "" },
                    { label: "2) 가 공", value: "" },
                    { label: "3) 열처리", value: "" },
                    { label: "4) 연 마", value: "" },
                    { label: "5) 다이아", value: "" },
                    { label: "6) 조 립", value: "" },
                    { label: "7) 기 타", value: "" }
                ]
            }))
        });
    };

    const handleItemProcessChange = (itemIdx, pIdx, val) => {
        const newItems = [...metadata.items];
        newItems[itemIdx].processes[pIdx].value = val;
        setMetadata(prev => ({ ...prev, items: newItems }));
    };

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
            const fileName = `prod_${activeTab}_${order.id}_${Date.now()}.pdf`;

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

                await api.put(`/purchasing/purchase/orders/${order.id}`, { attachment_file: newAttachments, sheet_metadata: metadata });
                alert("저장 및 첨부되었습니다.");
                if (onSave) onSave();
                onClose();
            }
        } catch (err) { alert('PDF 생성 실패'); } finally { setSaving(false); }
    };

    if (!isOpen || !order) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto font-sans text-xs">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
                        <button onClick={() => setActiveTab('detail')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === 'detail' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}>세부 내역서</button>
                        <button onClick={() => setActiveTab('production')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors", activeTab === 'production' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}>생산관리시트</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => generatePDF('download')} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">다운로드</button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20">{saving ? '저장 중...' : 'PDF 저장 및 첨부'}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 flex items-center justify-center"><X className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] shadow-xl origin-top" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>

                        {activeTab === 'detail' ? (
                            <div className="space-y-8">
                                <div className="flex justify-center mb-8">
                                    <div className="bg-yellow-400 border-2 border-black px-12 py-2 text-2xl font-bold tracking-[0.5em] indent-[0.5em]">
                                        <EditableText value={metadata.detail_title} onChange={(v) => setMetadata({ ...metadata, detail_title: v })} />
                                    </div>
                                </div>

                                {metadata.items.map((item, itemIdx) => (
                                    <div key={item.id} className="border-2 border-black mb-10 overflow-hidden">
                                        <div className="bg-gray-100 p-2 border-b border-black flex justify-between font-bold text-sm">
                                            <span>품명: {item.name}</span>
                                            <span>규격: {item.spec}</span>
                                            <span>수량: {item.quantity}EA</span>
                                        </div>
                                        <table className="w-full border-collapse">
                                            <tbody>
                                                {item.processes.map((proc, pIdx) => (
                                                    <tr key={pIdx} className="border-b border-black last:border-0 h-16">
                                                        <td className="w-24 bg-gray-50 border-r border-black font-bold p-2 text-center text-[11px] leading-tight">
                                                            {proc.label}
                                                        </td>
                                                        <td className="p-2 align-top text-sm">
                                                            <EditableText
                                                                value={proc.value}
                                                                onChange={(v) => handleItemProcessChange(itemIdx, pIdx, v)}
                                                                placeholder="세부 공정 내용 입력..."
                                                                className="min-h-[40px] items-start italic text-blue-800"
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-center py-4 border-b-2 border-black mb-6">
                                    <h1 className="text-3xl font-bold tracking-[1em]"><EditableText value={metadata.prod_title} onChange={(v) => setMetadata({ ...metadata, prod_title: v })} /></h1>
                                </div>

                                <div className="flex justify-between items-end border-b border-black pb-2 mb-4">
                                    <div className="space-y-1">
                                        <p className="font-bold">발주번호: {metadata.order_no}</p>
                                        <p className="text-[10px] text-gray-500">PRODUCTION WORK ORDER SHEET</p>
                                    </div>
                                    <div className="text-right">
                                        <h2 className="text-lg font-bold">(주)디자인메카</h2>
                                    </div>
                                </div>

                                <table className="w-full border-collapse border-2 border-black">
                                    <thead>
                                        <tr className="bg-gray-50 h-10">
                                            <th className="border border-black w-10">NO</th>
                                            <th className="border border-black">품명 / 상세규격</th>
                                            <th className="border border-black w-20">수량</th>
                                            <th className="border border-black w-32">공정확인</th>
                                            <th className="border border-black w-32">검사항목</th>
                                            <th className="border border-black w-16">상태</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metadata.items.map((item, idx) => (
                                            <tr key={item.id} className="h-20">
                                                <td className="border border-black text-center">{idx + 1}</td>
                                                <td className="border border-black p-2 align-top">
                                                    <div className="font-bold text-sm mb-1">{item.name}</div>
                                                    <div className="text-xs text-gray-600">{item.spec}</div>
                                                </td>
                                                <td className="border border-black text-center font-bold">{item.quantity}</td>
                                                <td className="border border-black p-1 text-[10px] leading-tight space-y-1">
                                                    <div className="flex gap-1 border-b border-gray-100 pb-1"><span>[ ]</span> 거친가공</div>
                                                    <div className="flex gap-1 border-b border-gray-100 pb-1"><span>[ ]</span> 열처리</div>
                                                    <div className="flex gap-1"><span>[ ]</span> 정밀연마</div>
                                                </td>
                                                <td className="border border-black p-1 text-[10px]">
                                                    <EditableText value="" placeholder="외관검사, 치수검사 등..." className="min-h-[50px] items-start" />
                                                </td>
                                                <td className="border border-black text-center text-gray-300">
                                                    대기
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="absolute bottom-[10mm] right-[10mm] opacity-30 select-none">
                            <StampOverlay url="/api/uploads/sample-stamp.png" className="w-20 h-20 -bottom-4 -right-4" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionSheetModal;
