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
const PageFrame = React.forwardRef(({ metadata, group, company, pageNum, totalPages, colWidths, onUpdateWidths, onUpdateData, groupIdx }, ref) => {
    const columns = [
        { key: 'idx', label: 'NO', align: 'center' },
        { key: 'name', label: '공정명', align: 'left' },
        { key: 'course_label', label: '구분', align: 'center' },
        { key: 'partner_worker', label: '외주.구매/작업자', align: 'center' },
        { key: 'equipment', label: '배정장비', align: 'center' },
        { key: 'detail', label: '작업내용', align: 'left' },
        { key: 'start_date', label: '시작일', align: 'center' },
        { key: 'end_date', label: '종료일', align: 'center' },
        { key: 'note', label: '비고', align: 'left' },
    ];

    const tableData = group.processes.map((proc, pIdx) => ({
        ...proc,
        idx: pIdx + 1,
        course_label: proc.course === 'INTERNAL' ? '사내' : '사외'
    }));

    // Fill empty rows
    while (tableData.length < 15) {
        tableData.push({ idx: "", name: "", course_label: "", partner_worker: "", equipment: "", detail: "", start_date: "", end_date: "", note: "" });
    }

    return (
        <div ref={ref} className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] flex flex-col shadow-xl origin-top relative mb-8 last:mb-0 overflow-hidden" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
            {/* Header Area */}
            <div className="text-center py-4 border-b-2 border-black mb-6">
                <h1 className="text-4xl font-bold tracking-[1em] indent-[1em]">
                    생 산 관 리 시 트
                </h1>
            </div>

            <div className="flex justify-between items-start border-b border-black pb-2 mb-4 text-[11px] font-bold">
                <div className="space-y-1">
                    <p>수주/생산번호 : <span className="text-blue-700">{metadata.order_no}</span></p>
                    <p>발주 거래처 : <span className="text-blue-700">{metadata.partner_name}</span></p>
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
                    <span className="flex-1 text-center font-mono">[규격] {group.product_spec}</span>
                    <span className="w-24 text-right">[수량] {group.quantity} EA</span>
                </div>
            </div>

            {/* Table Area - Width Adjusted for 190mm inner width */}
            <div className="w-full">
                <ResizableTable
                    columns={columns}
                    data={tableData}
                    colWidths={colWidths}
                    onUpdateWidths={onUpdateWidths}
                    onUpdateData={(rIdx, key, val) => onUpdateData(groupIdx, rIdx, key, val)}
                    className="text-[9px]"
                />
            </div>

            {/* Empty space pusher */}
            <div className="flex-1"></div>

            {/* Footer */}
            <div className="mt-4 flex justify-between items-end text-[9px] text-gray-400 shrink-0">
                <span>Page {pageNum} of {totalPages}</span>
                <span className="font-bold uppercase tracking-widest leading-none">{company?.name || '디자인메카'}</span>
            </div>
        </div>
    );
});

const ProductionSheetModal = ({ isOpen, onClose, plan, onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);

    // Initial widths for the 9 columns - Fine-tuned to sum up to approx 718px (190mm)
    const [colWidths, setColWidths] = useState([30, 80, 40, 110, 80, 150, 70, 70, 80]);

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
        const sortedItems = [...(plan.items || [])].sort((a, b) => a.sequence - b.sequence);

        sortedItems.forEach(item => {
            const pid = item.product_id;
            if (!groupedMap.has(pid)) {
                groupedMap.set(pid, {
                    product_id: pid,
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
                note: ""
            });
        });

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

    const handleUpdateData = (gIdx, rIdx, key, val) => {
        const newGroups = [...metadata.groups];
        if (newGroups[gIdx].processes[rIdx]) {
            newGroups[gIdx].processes[rIdx][key] = val;
        }
        setMetadata(prev => ({ ...prev, groups: newGroups }));
    };

    const generatePDF = async (action = 'save') => {
        if (pageRefs.current.length === 0) return;
        setSaving(true);
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();

            for (let i = 0; i < metadata.groups.length; i++) {
                const page = pageRefs.current[i];
                if (!page) continue;

                // Wait for all images
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
                    <h3 className="text-white font-bold flex items-center gap-2">생산관리시트 편집 ({metadata.groups.length} 페이지)</h3>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mr-4 italic">
                        * 표 선을 드래그하여 간격을 조절할 수 있습니다.
                    </div>
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
                            colWidths={colWidths}
                            onUpdateWidths={setColWidths}
                            onUpdateData={handleUpdateData}
                            groupIdx={idx}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProductionSheetModal;
