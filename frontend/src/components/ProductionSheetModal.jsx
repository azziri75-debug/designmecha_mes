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
        colWidths: [40, 300, 60, 140, 140, 60],
        items: []
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

        // Group items if they are broken down by process, or just use as is
        // Usually plan.items contains the list of products to produce
        const items = (plan.items || []).map((item, idx) => ({
            idx: idx + 1,
            name: item.product?.name || "",
            spec: item.product?.specification || item.product?.code || "",
            qty: item.quantity,
            processes: "거친가공 / 열처리 / 정밀연마",
            inspection: "외관 및 치수 검사",
            status: "대기"
        }));

        while (items.length < 10) {
            items.push({ idx: "", name: "", spec: "", qty: "", processes: "", inspection: "", status: "" });
        }

        setMetadata(prev => ({
            ...prev,
            order_no: plan.order?.order_no || plan.stock_production?.production_no || "PLAN-" + plan.id,
            items: items
        }));
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const updateItem = (rIdx, key, val) => {
        const newItems = [...metadata.items];
        newItems[rIdx][key] = val;
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

    const columns = [
        { key: 'idx', label: 'NO', align: 'center' },
        { key: 'name', label: '품명 / 상세규격', align: 'left' },
        { key: 'qty', label: '수량', align: 'center' },
        { key: 'processes', label: '공정확인', align: 'left' },
        { key: 'inspection', label: '검사항목', align: 'left' },
        { key: 'status', label: '상태', align: 'center' },
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-white font-bold flex items-center gap-2">생산관리시트 편집</h3>
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

                        <div className="flex justify-between items-end border-b border-black pb-2 mb-4 text-sm font-bold">
                            <div className="space-y-1">
                                <p>발주번호 : <EditableText value={metadata.order_no} onChange={(v) => handleMetaChange('order_no', v)} className="inline-block min-w-[150px]" /></p>
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-normal">Production Work Order Sheet</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-lg font-bold">(주)디자인메카</h2>
                            </div>
                        </div>

                        <ResizableTable
                            columns={columns}
                            data={metadata.items}
                            colWidths={metadata.colWidths}
                            onUpdateWidths={(w) => handleMetaChange('colWidths', w)}
                            onUpdateData={updateItem}
                            className="text-xs"
                        />

                        {/* Footer / Branding */}
                        <div className="absolute bottom-[10mm] left-0 right-0 flex flex-col items-center">
                            <div className="text-[10px] text-gray-400 font-bold tracking-[1em] mb-4 uppercase">
                                (주) 디자인메카
                            </div>
                            <StampOverlay url="/api/uploads/sample-stamp.png" className="w-20 h-20 opacity-20" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionSheetModal;
