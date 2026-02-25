import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn } from '../lib/utils';

const ProductionSheetModal = ({ isOpen, onClose, plan, onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);

    const [metadata, setMetadata] = useState({
        title: "생 산 관 리 시 트",
        order_no: "",
        partner_name: "",
        order_date: "",
        delivery_date: "",
        colWidths: [40, 150, 60, 200, 200, 70],
        groups: [] // Grouped by product
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && plan) {
            fetchCompany();
            initializeData();
        }
    }, [isOpen, plan]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) { console.error('Failed to fetch company', err); }
    };

    const initializeData = () => {
        if (!plan) return;

        // Group items by product
        const grouped = (plan.items || []).reduce((acc, item) => {
            const pid = item.product_id;
            if (!acc[pid]) {
                acc[pid] = {
                    product_name: item.product?.name || item.process_name,
                    product_spec: item.product?.specification || item.product?.code || "",
                    quantity: item.quantity,
                    processes: []
                };
            }
            acc[pid].processes.push({
                idx: item.sequence,
                name: item.process_name,
                course: item.course_type,
                detail: item.note || "",
                inspection: "외관/치수 검사",
                status: item.status
            });
            return acc;
        }, {});

        setMetadata(prev => ({
            ...prev,
            order_no: plan.order?.order_no || plan.stock_production?.production_no || "PLAN-" + plan.id,
            partner_name: plan.order?.partner?.name || "사내 생산",
            order_date: plan.order?.order_date || plan.plan_date,
            delivery_date: plan.order?.delivery_date || "-",
            groups: Object.values(grouped)
        }));
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const updateProcess = (gIdx, pIdx, key, val) => {
        const newGroups = [...metadata.groups];
        newGroups[gIdx].processes[pIdx][key] = val;
        setMetadata(prev => ({ ...prev, groups: newGroups }));
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
            const fileName = `production_sheet_${plan.id}_${Date.now()}.pdf`;

            if (action === 'download') {
                pdf.save(fileName);
            } else {
                const blob = pdf.output('blob');
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

                let currentAttachments = [];
                try { if (plan.attachment_file) currentAttachments = typeof plan.attachment_file === 'string' ? JSON.parse(plan.attachment_file) : plan.attachment_file; } catch { currentAttachments = []; }
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                await api.put(`/production/plans/${plan.id}`, { attachment_file: newAttachments, sheet_metadata: metadata });
                alert("저장 및 첨부되었습니다.");
                if (onSave) onSave();
                onClose();
            }
        } catch (err) { alert('PDF 생성 실패'); } finally { setSaving(false); }
    };

    if (!isOpen || !plan) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-white font-bold flex items-center gap-2">생산관리시트 통합 편집</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => generatePDF('download')} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">다운로드</button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20">{saving ? '저장 중...' : 'PDF 저장 및 첨부'}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 flex items-center justify-center"><X className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] shadow-xl origin-top relative" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>

                        <div className="text-center py-4 border-b-2 border-black mb-6">
                            <h1 className="text-4xl font-bold tracking-[1em] indent-[1em]">
                                <EditableText value={metadata.title} onChange={(v) => handleMetaChange('title', v)} isHeader />
                            </h1>
                        </div>

                        <div className="flex justify-between items-start border-b border-black pb-2 mb-4 text-xs font-bold">
                            <div className="space-y-1">
                                <p>수주/생산번호 : <EditableText value={metadata.order_no} onChange={(v) => handleMetaChange('order_no', v)} className="inline-block min-w-[150px]" /></p>
                                <p>발주 거래처 : <EditableText value={metadata.partner_name} onChange={(v) => handleMetaChange('partner_name', v)} className="inline-block min-w-[150px]" /></p>
                                <p className="text-[9px] text-gray-400 uppercase tracking-widest font-normal">Production Work Order Sheet</p>
                            </div>
                            <div className="text-right space-y-1">
                                <h2 className="text-lg font-bold">디자인메카</h2>
                                <p>수주일 : <EditableText value={metadata.order_date} onChange={(v) => handleMetaChange('order_date', v)} className="inline-block" /></p>
                                <p>납기일 : <EditableText value={metadata.delivery_date} onChange={(v) => handleMetaChange('delivery_date', v)} className="inline-block" /></p>
                            </div>
                        </div>

                        {/* Integrated List View */}
                        <div className="space-y-6">
                            {metadata.groups.map((group, gIdx) => (
                                <div key={gIdx} className="border-2 border-black">
                                    <div className="bg-gray-100 p-2 border-b-2 border-black flex justify-between font-bold text-[11px]">
                                        <span>[품명] {group.product_name}</span>
                                        <span>[규격] {group.product_spec}</span>
                                        <span>[수량] {group.quantity} EA</span>
                                    </div>
                                    <table className="w-full border-collapse table-fixed">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-black text-[10px] h-8">
                                                <th className="border-r border-black w-8">NO</th>
                                                <th className="border-r border-black w-24">공정명</th>
                                                <th className="border-r border-black w-14">구분</th>
                                                <th className="border-r border-black">작업내용 / 특기사항</th>
                                                <th className="border-r border-black w-24">검사항목</th>
                                                <th className="w-16">상태</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.processes.map((proc, pIdx) => (
                                                <tr key={pIdx} className="border-b border-gray-200 last:border-0 h-10 text-[10px]">
                                                    <td className="border-r border-black text-center">{proc.idx}</td>
                                                    <td className="border-r border-black px-1 font-bold">
                                                        <EditableText value={proc.name} onChange={(v) => updateProcess(gIdx, pIdx, 'name', v)} autoFit maxWidth={90} />
                                                    </td>
                                                    <td className="border-r border-black text-center">{proc.course === 'INTERNAL' ? '사내' : '사외'}</td>
                                                    <td className="border-r border-black px-1 text-blue-800 italic">
                                                        <EditableText value={proc.detail} onChange={(v) => updateProcess(gIdx, pIdx, 'detail', v)} placeholder="작업내용 입력..." />
                                                    </td>
                                                    <td className="border-r border-black px-1">
                                                        <EditableText value={proc.inspection} onChange={(v) => updateProcess(gIdx, pIdx, 'inspection', v)} autoFit maxWidth={90} />
                                                    </td>
                                                    <td className="text-center font-bold">
                                                        <EditableText value={proc.status} onChange={(v) => updateProcess(gIdx, pIdx, 'status', v)} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>

                        {/* Footer / Branding */}
                        <div className="absolute bottom-[10mm] left-0 right-0 flex flex-col items-center">
                            <div className="text-[10px] text-gray-400 font-bold tracking-[1em] mb-4 uppercase">
                                디자인메카
                            </div>
                            <StampOverlay url="/api/uploads/sample-stamp.png" className="w-16 h-16 opacity-20" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionSheetModal;
