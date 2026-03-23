import React, { useRef, useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { X, FileText, Printer, Save, Download } from 'lucide-react';
import api from '../lib/api';
import { printMultiPageAsImage, generateMultiPageA4PDF } from '../lib/printUtils';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn } from '../lib/utils';

/**
 * Production Page Component (A4 single page)
 */
const PageFrame = React.forwardRef(({ metadata, group, company, pageNum, totalPages, colWidths, onUpdateWidths, onUpdateData, groupIdx }, ref) => {
    const columns = [
        { key: 'idx', label: 'NO', align: 'center' },
        { key: 'name', label: '怨듭젙紐?, align: 'left' },
        { key: 'course_label', label: '援щ텇', align: 'center' },
        { key: 'partner_worker', label: '?몄＜.援щℓ/?묒뾽??, align: 'center' },
        { key: 'equipment', label: '諛곗젙?λ퉬', align: 'center' },
        { key: 'detail', label: '?묒뾽?댁슜', align: 'left' },
        { key: 'start_date', label: '?쒖옉??, align: 'center' },
        { key: 'end_date', label: '醫낅즺??, align: 'center' },
        { key: 'note', label: '鍮꾧퀬', align: 'left' },
    ];

    const tableData = (group.processes || []).map((proc, pIdx) => ({
        ...proc,
        idx: pIdx + 1,
        course_label: proc.course === 'INTERNAL' ? '?щ궡' : '?ъ쇅'
    }));

    // Fill empty rows
    while (tableData.length < 15) {
        tableData.push({ idx: "", name: "", course_label: "", partner_worker: "", equipment: "", detail: "", start_date: "", end_date: "", note: "" });
    }

    return (
        <div 
            ref={ref} 
            className="bg-white text-black flex flex-col shadow-none origin-top relative mb-8 last:mb-0" 
            style={{ 
                fontFamily: '"Malgun Gothic", sans-serif', 
                border: '1px solid #e5e7eb',
                width: '210mm',
                minHeight: '297mm',
                margin: '0 auto',
                background: 'white',
                boxSizing: 'border-box',
                overflow: 'visible',
                padding: '10mm'
            }}
        >
            {/* Header Area */}
            <div className="text-center py-4 border-b-2 border-black mb-6">
                <h1 className="text-4xl font-bold tracking-[1em] indent-[1em]">
                    ????愿 由?????
                </h1>
            </div>

            <div className="flex justify-between items-start border-b border-black pb-2 mb-4 text-[11px] font-bold">
                <div className="space-y-1">
                    <p>?섏＜/?앹궛踰덊샇 : <span style={{ color: '#1d4ed8' }}>{metadata.order_no}</span></p>
                    <p>諛쒖＜ 嫄곕옒泥?: <span style={{ color: '#1d4ed8' }}>{metadata.partner_name}</span></p>
                    <p className="uppercase tracking-widest font-normal" style={{ fontSize: '9px', color: '#d1d5db' }}>DESIGNMECHA PRODUCTION MANAGEMENT</p>
                </div>
                <div className="text-right space-y-1">
                    <h2 className="text-lg font-bold">{company?.name || '?붿옄?몃찓移?}</h2>
                    <p>?섏＜??: <span>{metadata.order_date}</span></p>
                    <p>?⑷린??: <span>{metadata.delivery_date}</span></p>
                </div>
            </div>

            {/* Product Summary */}
            <div className="border-2 border-black mb-4">
                <div className="p-2 border-b border-black flex justify-between font-bold text-[11px]" style={{ backgroundColor: '#f3f4f6' }}>
                    <span className="flex-1">[?덈챸] {group.product_name}</span>
                    <span className="flex-1 text-center font-mono">[洹쒓꺽] {group.product_spec}</span>
                    <span className="w-24 text-right">[?섎웾] {group.quantity} EA</span>
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
            <div className="mt-4 flex justify-between items-end shrink-0" style={{ fontSize: '9px', color: '#9ca3af' }}>
                <span>Page {pageNum} of {totalPages}</span>
                <span className="font-bold uppercase tracking-widest leading-none">{company?.name || '?붿옄?몃찓移?}</span>
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

    useEffect(() => {
        const handleBefore = () => { if (isOpen) document.body.classList.add('a4-print-mode'); };
        const handleAfter = () => { document.body.classList.remove('a4-print-mode'); };
        window.addEventListener('beforeprint', handleBefore);
        window.addEventListener('afterprint', handleAfter);
        return () => {
            window.removeEventListener('beforeprint', handleBefore);
            window.removeEventListener('afterprint', handleAfter);
            document.body.classList.remove('a4-print-mode');
        };
    }, [isOpen]);

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

        let savedColWidths;
        try {
            if (plan.sheet_metadata) {
                const sm = typeof plan.sheet_metadata === 'string' ? JSON.parse(plan.sheet_metadata) : plan.sheet_metadata;
                if (sm.colWidths) savedColWidths = sm.colWidths;
            }
        } catch (e) { }

        if (savedColWidths) {
            setColWidths(savedColWidths);
        } else {
            setColWidths([30, 80, 40, 110, 80, 150, 70, 70, 80]); // default
        }

        setMetadata(prev => ({
            ...prev,
            order_no: plan.order?.order_no || plan.stock_production?.production_no || "PLAN-" + plan.id,
            partner_name: plan.order?.partner?.name || "?щ궡 ?앹궛",
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

    // ?몄뇙 ?꾩슜 李?諛⑹떇 - 硫붾돱/?ㅽ겕 諛곌꼍 ?놁씠 A4留??몄뇙
    const handlePrintWindow = async () => {
        await printMultiPageAsImage(pageRefs.current, { title: '?앹궛愿由ъ떆??, orientation: 'portrait' });
    };

        const generatePDF = async (action = 'save') => {
        if (pageRefs.current.length === 0) return;
        setSaving(true);
        try {
            const partnerName = plan.order?.partner?.name || '?щ궡?앹궛';
            const groups = metadata.groups || [];
            const firstItemName = groups[0]?.product_name || '?덈챸';
            const extraCount = groups.length > 1 ? ` ??${groups.length - 1}嫄? : '';
            const date = plan.plan_date || '?좎쭨';
            const fileName = `?앹궛愿由ъ떆??${partnerName}-${firstItemName}${extraCount}-${date}.pdf`;
            const blob = await generateMultiPageA4PDF(pageRefs.current, {
                fileName,
                orientation: 'portrait',
                action: 'blob',
                pixelRatio: 3
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

                let currentAttachments = [];
                try { if (plan.attachment_file) currentAttachments = typeof plan.attachment_file === 'string' ? JSON.parse(plan.attachment_file) : plan.attachment_file; } catch { currentAttachments = []; }
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                await api.put(`/production/plans/${plan.id}`, { attachment_file: newAttachments, sheet_metadata: { colWidths } });
                alert('???諛?泥⑤??섏뿀?듬땲??');
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF ?앹꽦 ?ㅽ뙣: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !plan) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-white font-bold flex items-center gap-2">?앹궛愿由ъ떆???몄쭛 ({metadata.groups.length} ?섏씠吏)</h3>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mr-4 italic">
                        * ???좎쓣 ?쒕옒洹명븯??媛꾧꺽??議곗젅?????덉뒿?덈떎.
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrintWindow} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg flex items-center gap-1"><Printer className="w-4 h-4" /> ?몄뇙</button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg flex items-center gap-1"><Save className="w-4 h-4" /> {saving ? '泥섎━ 以?..' : 'PDF ???諛?泥⑤?'}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2 flex items-center justify-center"><X className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex flex-col items-center gap-8">
                    {(metadata.groups || []).map((group, idx) => (
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


