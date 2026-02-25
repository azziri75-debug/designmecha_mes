import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn } from '../lib/utils';

/**
 * Production Page Component (A4 single page)
 */
const PageFrame = React.forwardRef(({ metadata, group, company, isFirst, pageNum, totalPages }, ref) => {
    return (
        <div ref={ref} className="bg-white text-black w-[210mm] h-[297mm] p-[10mm] shadow-xl origin-top relative mb-8 last:mb-0 overflow-hidden" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
            {/* Header Area */}
            <div className="text-center py-4 border-b-2 border-black mb-6">
                <h1 className="text-4xl font-bold tracking-[1em] indent-[1em]">
                    생 산 관 리 시 트
                </h1>
            </div>

            <div className="flex justify-between items-start border-b border-black pb-2 mb-4 text-[11px] font-bold">
                <div className="space-y-1">
                    <p>수주/생산번호 : <span>{metadata.order_no}</span></p>
                    <p>발주 거래처 : <span>{metadata.partner_name}</span></p>
                    <p className="text-[9px] text-gray-300 uppercase tracking-widest font-normal">DESIGNMECHA PRODUCTION MANAGEMENT</p>
                </div>
                <div className="text-right space-y-1">
                    <h2 className="text-lg font-bold">{company?.name || '디자인메카'}</h2>
                    <p>수주일 : <span>{metadata.order_date}</span></p>
                    <p>납기일 : <span>{metadata.delivery_date}</span></p>
                </div>
            </div>

            {/* Product Summary */}
            <div className="border-2 border-black mb-4">
                <div className="bg-gray-100 p-2 border-b border-black flex justify-between font-bold text-[11px]">
                    <span className="flex-1">[품명] {group.product_name}</span>
                    <span className="flex-1 text-center">[규격] {group.product_spec}</span>
                    <span className="w-24 text-right">[수량] {group.quantity} EA</span>
                </div>
            </div>

            {/* Table Area */}
            <div className="border border-black">
                <table className="w-full border-collapse table-fixed text-[9px]">
                    <thead>
                        <tr className="bg-gray-50 border-b border-black h-8 text-center font-bold">
                            <th className="border-r border-black w-7">NO</th>
                            <th className="border-r border-black w-24">공정명</th>
                            <th className="border-r border-black w-12">구분</th>
                            <th className="border-r border-black w-32">외주.구매/작업자</th>
                            <th className="border-r border-black w-24">배정장비</th>
                            <th className="border-r border-black">작업내용</th>
                            <th className="border-r border-black w-20">시작일</th>
                            <th className="border-r border-black w-20">종료일</th>
                            <th className="border-r border-black w-16">상태</th>
                            <th className="w-20">비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        {group.processes.map((proc, pIdx) => (
                            <tr key={pIdx} className="border-b border-gray-200 last:border-0 h-10">
                                <td className="border-r border-black text-center">{pIdx + 1}</td>
                                <td className="border-r border-black px-1 font-bold">
                                    <EditableText value={proc.name} onChange={(v) => { }} autoFit maxWidth={90} className="justify-center" />
                                </td>
                                <td className="border-r border-black text-center">{proc.course === 'INTERNAL' ? '사내' : '사외'}</td>
                                <td className="border-r border-black px-1 text-center">
                                    <EditableText value={proc.partner_worker} onChange={(v) => { }} className="justify-center" />
                                </td>
                                <td className="border-r border-black px-1 text-center font-mono">
                                    <EditableText value={proc.equipment} onChange={(v) => { }} className="justify-center" />
                                </td>
                                <td className="border-r border-black px-1 text-blue-800 italic">
                                    <EditableText value={proc.detail} onChange={(v) => { }} placeholder="-" />
                                </td>
                                <td className="border-r border-black px-1 text-center text-[8px]">
                                    <EditableText value={proc.start_date} onChange={(v) => { }} />
                                </td>
                                <td className="border-r border-black px-1 text-center text-[8px]">
                                    <EditableText value={proc.end_date} onChange={(v) => { }} />
                                </td>
                                <td className="border-r border-black text-center font-bold">
                                    <span className={cn(
                                        "px-1 rounded text-[7px]",
                                        proc.status === 'COMPLETED' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                                    )}>
                                        {proc.status}
                                    </span>
                                </td>
                                <td className="px-1">
                                    <EditableText value={proc.note} onChange={(v) => { }} />
                                </td>
                            </tr>
                        ))}
                        {/* Fill empty rows to maintain layout if needed */}
                        {Array.from({ length: Math.max(0, 15 - group.processes.length) }).map((_, i) => (
                            <tr key={'empty-' + i} className="border-b border-gray-200 last:border-0 h-10">
                                <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                <td className="border-r border-black"></td><td className=""></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="absolute bottom-[10mm] left-0 right-0 px-[10mm] flex justify-between items-end text-[9px] text-gray-400">
                <span>Page {pageNum} of {totalPages}</span>
                <span className="font-bold uppercase tracking-widest">{company?.name || '디자인메카'}</span>
            </div>
        </div>
    );
});

const ProductionSheetModal = ({ isOpen, onClose, plan, onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);

    const [metadata, setMetadata] = useState({
        order_no: "",
        partner_name: "",
        order_date: "",
        delivery_date: "",
        groups: []
    });

    const pageRefs = useRef([]);

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

        const groupedMap = new Map();

        // Use a stable sort by sequence for ALL items before grouping
        const sortedItems = [...(plan.items || [])].sort((a, b) => a.sequence - b.sequence);

        sortedItems.forEach(item => {
            const pid = item.product_id;
            if (!groupedMap.has(pid)) {
                groupedMap.set(pid, {
                    product_name: item.product?.name || item.process_name,
                    product_spec: item.product?.specification || item.product?.code || "",
                    quantity: item.quantity,
                    processes: []
                });
            }
            groupedMap.get(pid).processes.push({
                sequence: item.sequence,
                name: item.process_name,
                course: item.course_type,
                partner_worker: item.partner_name || item.worker?.name || "-",
                equipment: item.equipment?.code || item.work_center || "-",
                detail: item.note || "",
                start_date: item.start_date || "-",
                end_date: item.end_date || "-",
                status: item.status,
                note: "" // separate notes col
            });
        });

        // Convert Map to array and sort groups by name? Or just keep order
        const groups = Array.from(groupedMap.values());

        setMetadata(prev => ({
            ...prev,
            order_no: plan.order?.order_no || plan.stock_production?.production_no || "PLAN-" + plan.id,
            partner_name: plan.order?.partner?.name || "사내 생산",
            order_date: plan.order?.order_date || plan.plan_date || "-",
            delivery_date: plan.order?.delivery_date || plan.target_date || "-",
            groups: groups
        }));
    };

    const generatePDF = async (action = 'save') => {
        if (pageRefs.current.length === 0) return;
        setSaving(true);
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();

            for (let i = 0; i < pageRefs.current.length; i++) {
                const page = pageRefs.current[i];
                if (!page) continue;

                // Ensure all images are loaded inside the page
                const images = page.getElementsByTagName('img');
                await Promise.all(Array.from(images).map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
                }));

                const canvas = await html2canvas(page, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    allowTaint: true
                });

                const imgData = canvas.toDataURL('image/png');
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            }

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

                await api.put(`/production/plans/${plan.id}`, { attachment_file: newAttachments });
                alert("저장 및 첨부되었습니다.");
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF 생성 실패: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !plan) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-white font-bold flex items-center gap-2">생산관리시트 품목별 출력 ({metadata.groups.length} 페이지)</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => generatePDF('download')} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1"><Download className="w-4 h-4" /> 다운로드</button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg flex items-center gap-1"><Save className="w-4 h-4" /> {saving ? '처리 중...' : 'PDF 저장 및 첨부'}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 flex items-center justify-center"><X className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex flex-col items-center gap-8">
                    {metadata.groups.map((group, idx) => (
                        <PageFrame
                            key={idx}
                            ref={el => pageRefs.current[idx] = el}
                            metadata={metadata}
                            group={group}
                            company={company}
                            pageNum={idx + 1}
                            totalPages={metadata.groups.length}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProductionSheetModal;
