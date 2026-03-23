import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    FileText, UserPlus, Clock, CheckCircle2, AlertCircle,
    Plus, Search, Filter, Pencil, Trash, X, Check,
    Calendar, User, Layers, Info, Settings, ClipboardList,
    ChevronRight, ArrowRight, Download, Upload, Printer
} from 'lucide-react';
import api from '../lib/api';
import { cn, getImageUrl } from '../lib/utils';
import { Box, Typography, Modal } from '@mui/material';
import Card from '../components/Card';
import { format } from 'date-fns';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
import { useAuth } from '../contexts/AuthContext';
import InternalDraftForm from '../components/InternalDraftForm';
import ExpenseReportForm from '../components/ExpenseReportForm';
import ConsumablesPurchaseForm from '../components/ConsumablesPurchaseForm';
import EarlyLeaveForm from '../components/EarlyLeaveForm';
import LeaveRequestForm from '../components/LeaveRequestForm';
import OvertimeWorkForm from '../components/OvertimeWorkForm';
import PurchaseOrderForm from '../components/PurchaseOrderForm';

const DOC_TYPES = {
    INTERNAL_DRAFT: { label: '?대?湲곗븞', color: 'blue' },
    EXPENSE_REPORT: { label: '吏異쒓껐?섏꽌', color: 'indigo' },
    LEAVE_REQUEST: { label: '?닿???, color: 'teal' },
    EARLY_LEAVE: { label: '議고눜/?몄텧??, color: 'purple' },
    CONSUMABLES_PURCHASE: { label: '?뚮え??援щℓ?좎껌??, color: 'cyan' },
    OVERTIME: { label: '?쇨렐/?밴렐?좎껌??, color: 'orange' },
    PURCHASE_ORDER: { label: '援щℓ諛쒖＜??, color: 'amber' }
};

const STATUS_MAP = {
    PENDING: { label: '湲곗븞?湲?, bg: 'bg-gray-700', text: 'text-gray-300' },
    IN_PROGRESS: { label: '寃곗옱吏꾪뻾', bg: 'bg-blue-900/40', text: 'text-blue-400' },
    COMPLETED: { label: '寃곗옱?꾨즺', bg: 'bg-emerald-900/40', text: 'text-emerald-400' },
    REJECTED: { label: '諛섎젮', bg: 'bg-red-900/40', text: 'text-red-400' }
};

const ApprovalPage = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('documents'); // documents, settings
    const [documents, setDocuments] = useState([]);
    // 臾몄꽌 ?댁슜留????앹뾽?쇰줈 ?몄뇙?섎뒗 ?⑥닔
    const handlePrintApproval = async () => {
        const contentEl = document.querySelector('.a4-paper-container');
        if (contentEl) {
            await printAsImage(contentEl, { title: '?꾩옄寃곗옱 臾몄꽌', orientation: 'portrait' });
        }
    };

    const handleDownloadPDFApproval = async () => {
        const contentEl = document.querySelector('.a4-paper-container');
        if (contentEl) {
            const docType = DOC_TYPES[selectedDoc.doc_type]?.label || '臾몄꽌';
            const authorName = selectedDoc.author?.name || '湲곗븞??;
            const date = format(new Date(selectedDoc.created_at), 'yyyyMMdd');
            const fileName = `${docType}-${authorName}-${date}.pdf`;
            await generateA4PDF(contentEl, {
                fileName,
                orientation: 'portrait',
                action: 'download',
                pixelRatio: 3,
                multiPage: true
            });
        }
    };

    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(false);
    const { user: currentUser } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    // Initialize viewMode from URL or default to ALL
    const initialMode = searchParams.get('mode') || 'ALL';
    const [viewMode, setViewMode] = useState(initialMode); // ALL, MY_WAITING, MY_COMPLETED, MY_REJECTED, WAITING_FOR_ME

    // Filter states
    const [filterDocType, setFilterDocType] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterAuthorId, setFilterAuthorId] = useState('');

    // Modal states
    const [showDocDetail, setShowDocDetail] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);

    // Settings states
    const [isPrinting, setIsPrinting] = React.useState(false);

    React.useEffect(() => {
        const handleBeforePrint = () => {
            if (showDocDetail) {
                document.body.classList.add('a4-print-mode');
            }
        };
        const handleAfterPrint = () => {
            document.body.classList.remove('a4-print-mode');
        };

        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
            document.body.classList.remove('a4-print-mode');
        };
    }, [showDocDetail]);
    const [approvalLines, setApprovalLines] = useState({}); // { [doc_type]: lines[] }


    useEffect(() => {
        const modeFromUrl = searchParams.get('mode') || 'ALL';
        if (modeFromUrl !== viewMode) {
            setViewMode(modeFromUrl);
        }
    }, [searchParams]);

    useEffect(() => {
        fetchInitialData();
    }, [activeTab, viewMode, filterDocType, filterStartDate, filterEndDate, filterAuthorId]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const params = { view_mode: viewMode };
            if (filterDocType) params.doc_type = filterDocType;
            if (filterStartDate) params.start_date = filterStartDate;
            if (filterEndDate) params.end_date = filterEndDate;
            if (filterAuthorId) params.author_id = filterAuthorId;

            const [staffRes, docRes] = await Promise.all([
                api.get('/basics/staff/'),
                api.get('/approval/documents', { params })
            ]);
            setStaff(staffRes.data);
            setDocuments(docRes.data);

            if (activeTab === 'settings') {
                const types = Object.keys(DOC_TYPES);
                const linesMap = {};
                for (const type of types) {
                    const res = await api.get(`/approval/lines?doc_type=${type}`);
                    linesMap[type] = res.data;
                }
                setApprovalLines(linesMap);
            }
        } catch (error) {
            console.error('Failed to fetch data', error);
        }
        setLoading(false);
    };


    const handleDeleteDoc = async (docId) => {
        if (!window.confirm('?뺣쭚 ??젣?섏떆寃좎뒿?덇퉴? 愿??寃곗옱 ?곗씠?곌? 紐⑤몢 ??젣?⑸땲??')) return;
        try {
            await api.delete(`/approval/documents/${docId}`);
            alert('??젣?섏뿀?듬땲??');
            setShowDocDetail(false);
            // 利됱떆 由ъ뒪?몄뿉???쒓굅 (?덈줈怨좎묠 ?놁씠 諛섏쁺)
            setDocuments(prev => prev.filter(doc => doc.id !== docId));

            // 留뚯빟 ?쒕쾭 ?곗씠?곗쓽 理쒖떊 ?곹깭媛 ?꾩슂?섎떎硫?fetchInitialData()瑜??몄텧???섎룄 ?덉?留?
            // ?ъ슜???붿껌? "?덈줈怨좎묠?섏? ?딆븘???щ씪吏?꾨줉" ?섎뒗 寃껋씠誘濡?state update媛 ?곗꽑?낅땲??
        } catch (error) {
            alert('??젣 ?ㅽ뙣: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleEditDoc = (doc) => {
        navigate(`/approval/draft?id=${doc.id}`);
        setShowDocDetail(false);
    };

    const handleProcess = async (docId, status, comment) => {
        try {
            await api.post(`/approval/documents/${docId}/process`, { status, comment });
            alert(status === 'APPROVED' ? '?뱀씤?섏뿀?듬땲??' : '諛섎젮?섏뿀?듬땲??');
            setShowDocDetail(false);
            fetchInitialData();
        } catch (error) {
            alert('泥섎━ ?ㅽ뙣: ' + (error.response?.data?.detail || error.message));
        }
    };

    const isEditable = (doc) => {
        if (!doc || !currentUser) return false;
        
        // 湲곗븞??蹂몄씤 ?뺤씤 (臾몄옄???レ옄 ?쇱슜 ?鍮?Number濡??듭씪)
        const isAuthor = Number(doc.author_id) === Number(currentUser?.id);
        if (!isAuthor) return false;

        // ?꾩떆???PENDING/DRAFT) ?먮뒗 諛섎젮(REJECTED) ?곹깭?먯꽌留??섏젙/??젣 媛??
        return ['PENDING', 'DRAFT', 'REJECTED'].includes(doc.status);
    };

    const canApprove = (doc) => {
        if (!doc || !currentUser || !doc.steps) return false;
        
        // ?꾩옱 濡쒓렇?명븳 ?щ엺??DB PK (寃곗옱 沅뚰븳 ?뺤씤??湲곗?)
        const myId = String(currentUser?.id || "");

        // 寃곗옱??以??꾩쭅 寃곗옱 ????PENDING) ?щ엺?ㅼ쓣 ?쒖꽌?濡?李얠쓬
        const pendingApprovers = doc.steps.filter(a => a.status === 'PENDING');
        
        // PENDING???щ엺 以?'泥?踰덉㎏' ?щ엺??諛붾줈 '吏湲?寃곗옱??李⑤?'???щ엺??
        const currentApproverToSign = pendingApprovers.length > 0 ? pendingApprovers[0] : null;

        if (!currentApproverToSign) return false;

        // ???遺덉씪移?諛⑹?瑜??꾪빐 紐⑤몢 String?쇰줈 蹂?섑븯??鍮꾧탳 (approver_id??Staff ?뷀떚?곗쓽 ID)
        const approverId = String(currentApproverToSign.approver_id || "");

        const result = (approverId === myId);
        
        if (result) console.log("寃곗옱 沅뚰븳 ?뺤씤 ?깃났:", { myId, approverId });
        
        return result;
    };

    const handleSaveLines = async (type) => {
        try {
            // Sanitize data: only send approver_id and sequence
            const sanitizedLines = (approvalLines[type] || []).map(line => ({
                doc_type: type,
                approver_id: line.approver_id,
                sequence: line.sequence
            }));

            await api.post(`/approval/lines?doc_type=${type}`, sanitizedLines);
            alert('寃곗옱?좎씠 ??λ릺?덉뒿?덈떎.');
        } catch (error) {
            console.error('Save failed:', error);
            alert('????ㅽ뙣: ' + (error.response?.data?.detail || error.message));
        }
    };

    const addApprover = (type) => {
        const admins = staff.filter(s => s.user_type === 'ADMIN' && ['遺??, '?댁궗', '??쒖씠??].includes(s.role));
        if (admins.length === 0) {
            alert('寃곗옱沅뚯옄濡?吏??媛?ν븳 遺?κ툒 ?댁긽??愿由ъ옄媛 ?놁뒿?덈떎.');
            return;
        }
        const currentRes = approvalLines[type] || [];
        const nextSeq = currentRes.length + 1;

        const newLine = {
            doc_type: type,
            approver_id: admins[0].id,
            sequence: nextSeq,
            approver: admins[0]
        };
        setApprovalLines({ ...approvalLines, [type]: [...currentRes, newLine] });
    };

    const removeApprover = (type, index) => {
        let lines = (approvalLines[type] || []).filter((_, i) => i !== index);
        lines = lines.map((l, i) => ({ ...l, sequence: i + 1 }));
        setApprovalLines(prev => ({ ...prev, [type]: lines }));
    };

    const updateApprover = (type, index, staffId) => {
        const lines = [...(approvalLines[type] || [])];
        lines[index].approver_id = parseInt(staffId);
        setApprovalLines(prev => ({ ...prev, [type]: lines }));
    };

    return (
        <>
            <div className={cn("space-y-6 approval-page-content", showDocDetail && "print:hidden")}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-500" />
                        ?꾩옄寃곗옱 諛?臾몄꽌 愿由?
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">?닿?, 議고눜, ?뚮え???좎껌 諛?寃곗옱 ?꾨줈?몄뒪</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigate('/approval/draft')}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        臾몄꽌 湲곗븞
                    </button>
                    <div className="bg-gray-800 p-1 rounded-lg border border-gray-700 flex">
                        <button
                            onClick={() => setActiveTab('documents')}
                            className={cn("px-4 py-1.5 rounded-md text-sm transition-all", activeTab === 'documents' ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white")}
                        >
                            臾몄꽌??
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={cn("px-4 py-1.5 rounded-md text-sm transition-all", activeTab === 'settings' ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white")}
                        >
                            寃곗옱???ㅼ젙
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'documents' ? (
                <div className="space-y-4">
                    <div className="flex gap-1 bg-gray-900/50 p-1 rounded-xl border border-gray-700/50">
                        {[
                            { id: 'ALL', label: '?꾩껜' },
                            { id: 'ALL_PENDING', label: '?꾩껜 ?湲? },
                            { id: 'ALL_COMPLETED', label: '?꾩껜 ?꾨즺' },
                            { id: 'ALL_REJECTED', label: '?꾩껜 諛섎젮' },
                            { id: 'WAITING_FOR_ME', label: '?섏쓽寃곗옱?湲? },
                            { id: 'MY_WAITING', label: '?섏쓽 湲곗븞' }
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => {
                                    setViewMode(m.id);
                                    setSearchParams({ mode: m.id });
                                }}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200",
                                    viewMode === m.id
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                                )}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    <Card className="p-4 flex flex-wrap gap-4 items-end">
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">臾몄꽌 醫낅쪟</label>
                            <select
                                className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                value={filterDocType}
                                onChange={(e) => setFilterDocType(e.target.value)}
                            >
                                <option value="">?꾩껜</option>
                                {Object.entries(DOC_TYPES).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">湲곗븞??/label>
                            <select
                                className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                value={filterAuthorId}
                                onChange={(e) => setFilterAuthorId(e.target.value)}
                            >
                                <option value="">?꾩껜 湲곗븞??/option>
                                {staff.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">?쒖옉??湲곗븞??</label>
                            <input
                                type="date"
                                className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                value={filterStartDate}
                                onChange={(e) => setFilterStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">醫낅즺??湲곗븞??</label>
                            <input
                                type="date"
                                className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                value={filterEndDate}
                                onChange={(e) => setFilterEndDate(e.target.value)}
                            />
                        </div>
                    </Card>

                    <Card>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-900/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">湲곗븞??/th>
                                        <th className="px-6 py-4">?좎껌 ?곸슜??/th>
                                        <th className="px-6 py-4">湲곗븞??/th>
                                        <th className="px-6 py-4">醫낅쪟</th>
                                        <th className="px-6 py-4">?쒕ぉ</th>
                                        <th className="px-6 py-4">?곹깭</th>
                                        <th className="px-6 py-4 text-right">愿由?/th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {documents.map((doc) => {
                                        const c = doc.content || {};
                                        const applyDate = c.start_date || c.date || '-';
                                        const applyEnd = c.end_date && c.end_date !== c.start_date ? ` ~ ${c.end_date}` : '';
                                        return (
                                            <tr
                                                key={doc.id}
                                                className="hover:bg-gray-800/50 transition-colors group cursor-pointer"
                                                onClick={() => { 
                                                    if (doc.doc_type === 'INTERNAL_DRAFT') {
                                                        navigate(`/approval/draft?id=${doc.id}`);
                                                    } else {
                                                        setSelectedDoc(doc); 
                                                        setShowDocDetail(true); 
                                                    }
                                                }}
                                            >
                                                <td className="px-6 py-4 text-sm text-gray-400">
                                                    {format(new Date(doc.created_at), 'yyyy-MM-dd')}
                                                    <span className="block text-[10px] text-gray-600">{format(new Date(doc.created_at), 'HH:mm')}</span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-white font-medium">
                                                    {applyDate}{applyEnd}
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-white">
                                                    {doc.author?.name} ({doc.author?.role})
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "px-2 py-1 rounded text-[10px] font-bold uppercase",
                                                        `bg-${DOC_TYPES[doc.doc_type]?.color}-900/40 text-${DOC_TYPES[doc.doc_type]?.color}-400`
                                                    )}>
                                                        {DOC_TYPES[doc.doc_type]?.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-100 font-semibold">
                                                    {doc.title}
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    <span className={cn(
                                                        "px-2 py-1 rounded-full text-[10px] font-bold",
                                                        STATUS_MAP[doc.status]?.bg,
                                                        STATUS_MAP[doc.status]?.text
                                                    )}>
                                                        {STATUS_MAP[doc.status]?.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right min-w-[120px] relative z-10">
                                                    <div className="flex justify-end gap-2 items-center">
                                                        {currentUser?.id === doc.author?.id && (
                                                            <>
                                                                {doc.status !== 'APPROVED' && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleEditDoc(doc); }}
                                                                        className="p-1 hover:bg-gray-700 rounded text-blue-400 transition-colors"
                                                                        title="?섏젙"
                                                                    >
                                                                        <Pencil className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }}
                                                                    className="p-1 hover:bg-gray-700 rounded text-red-400 transition-colors"
                                                                    title="??젣"
                                                                >
                                                                    <Trash className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                        <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {documents.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                                                臾몄꽌媛 ?놁뒿?덈떎.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {Object.entries(DOC_TYPES).map(([type, info]) => (
                        <Card key={type} className="flex flex-col">
                            <div className="p-4 border-b border-gray-700 bg-gray-900/30 flex items-center justify-between">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <Settings className={cn("w-4 h-4", `text-${info.color}-500`)} />
                                    {info.label} 寃곗옱??
                                </h3>
                                <button
                                    onClick={() => addApprover(type)}
                                    className="p-1 hover:bg-gray-700 rounded text-blue-400"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 flex-1 space-y-3 min-h-[300px]">
                                {(approvalLines[type] || []).length > 0 ? (
                                    (approvalLines[type] || []).map((line, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-gray-900 p-3 rounded-lg border border-gray-700 group">
                                            <span className="bg-gray-800 text-gray-500 text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full border border-gray-700">
                                                {line.sequence}
                                            </span>
                                            <select
                                                value={line.approver_id}
                                                onChange={(e) => updateApprover(type, idx, e.target.value)}
                                                className="bg-gray-900 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500"
                                            >
                                                {staff
                                                    .filter(s => s.user_type === 'ADMIN' && ['遺??, '?댁궗', '??쒖씠??].includes(s.role))
                                                    .map(s => (
                                                        <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                                                    ))}
                                            </select>
                                            <button
                                                onClick={() => removeApprover(type, idx)}
                                                className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-600 text-xs py-10">
                                        <Info className="w-8 h-8 opacity-20 mb-2" />
                                        寃곗옱?좎쓣 異붽??댁＜?몄슂.
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-gray-700">
                                <button
                                    onClick={() => handleSaveLines(type)}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                                >
                                    ?ㅼ젙 ???
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
            </div>


            {showDocDetail && selectedDoc && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 approval-modal-overlay no-print">
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-7xl h-full max-h-[90vh] shadow-2xl animation-fade-in my-auto flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-500" />
                                    臾몄꽌 ?곸꽭 ?뺣낫
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">ID: {selectedDoc.id} | 湲곗븞?? {format(new Date(selectedDoc.created_at), 'yyyy-MM-dd HH:mm')}</p>
                            </div>
                                                        <div className="flex items-center gap-3">
                                <button
                                    onClick={handlePrintApproval}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                                >
                                    <Printer className="w-4 h-4" /> ?몄뇙
                                </button>
                                <button
                                    onClick={handleDownloadPDFApproval}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" /> PDF ???                                </button>
                                <button onClick={() => setShowDocDetail(false)} className="text-gray-400 hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className={cn("p-6 md:p-8 space-y-8 overflow-y-auto flex-1", selectedDoc.doc_type === 'PURCHASE_ORDER' && "p-0 space-y-0")}>
                            {/* Header Section */}
                            {!['PURCHASE_ORDER', 'EXPENSE_REPORT'].includes(selectedDoc.doc_type) && (
                                <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-gray-700 pb-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "px-2 py-1 rounded text-[10px] font-bold uppercase",
                                                `bg-${DOC_TYPES[selectedDoc.doc_type]?.color}-900/40 text-${DOC_TYPES[selectedDoc.doc_type]?.color}-400`
                                            )}>
                                                {DOC_TYPES[selectedDoc.doc_type]?.label}
                                            </span>
                                            <span className={cn(
                                                "px-2 py-1 rounded-full text-[10px] font-bold",
                                                STATUS_MAP[selectedDoc.status]?.bg,
                                                STATUS_MAP[selectedDoc.status]?.text
                                            )}>
                                                {STATUS_MAP[selectedDoc.status]?.label}
                                            </span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white">{selectedDoc.title}</h2>
                                        <div className="flex items-center gap-4 text-sm text-gray-400">
                                            <div className="flex items-center gap-1.5 bg-gray-900 px-3 py-1 rounded-full border border-gray-700">
                                                <User className="w-3.5 h-3.5" />
                                                {selectedDoc.author?.name} {selectedDoc.author?.role}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Approval Steps */}
                                    <div className="flex gap-3">
                                        {(selectedDoc.steps || []).map((step, idx) => (
                                            <div key={idx} className="flex flex-col items-center gap-1.5 w-20">
                                                <div className="text-[10px] font-bold text-gray-500 uppercase">{step.approver?.role || (step.sequence === 1 ? '遺?? : step.sequence === 2 ? '?댁궗' : '??쒖씠??)}</div>
                                                <div className="w-16 h-16 bg-white rounded border border-gray-600 flex items-center justify-center relative overflow-hidden group">
                                                    {step.status === 'APPROVED' ? (
                                                        step.approver?.stamp_image ? (
                                                            <img 
                                                                src={getImageUrl(step.approver?.stamp_image.url || step.approver?.stamp_image)} 
                                                                alt="Sign" 
                                                                className="w-full h-full object-contain p-1" 
                                                                onError={(e) => { e.target.style.display = 'none'; }}
                                                            />
                                                        ) : (
                                                            <span className="text-[11px] text-emerald-600 font-bold border-2 border-emerald-500 px-1 rounded -rotate-12 uppercase">Approved</span>
                                                        )
                                                    ) : step.status === 'REJECTED' ? (
                                                        <span className="text-[11px] text-red-600 font-bold border-2 border-red-500 px-1 rounded -rotate-12 uppercase">Rejected</span>
                                                    ) : (
                                                        <>
                                                            <div className="text-[10px] text-gray-400">?湲곗쨷</div>
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                <div className="text-[9px] text-white font-medium text-center px-1">{step.approver?.name}</div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="text-[9px] text-gray-500">{step.processed_at ? format(new Date(step.processed_at), 'MM-dd') : '---'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Content Section - A4 Form Integration */}
                            <div className={cn(
                                "bg-white p-6 md:p-12 rounded-xl border border-gray-200 shadow-inner overflow-x-auto a4-paper-container print-safe-area",
                                selectedDoc.doc_type === 'PURCHASE_ORDER' && "p-0 rounded-none border-0 shadow-none"
                            )}>
                                <Box sx={{ 
                                    width: '100%',
                                    maxWidth: '850px',
                                    minHeight: { xs: 'auto', md: '1100px' },
                                    margin: '0 auto',
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    bgcolor: '#ffffff',
                                    p: selectedDoc.doc_type === 'PURCHASE_ORDER' ? '0' : { xs: '20px', md: '40px' },
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                    color: '#000000',
                                    '& *': { color: '#000000 !important', borderColor: '#000000 !important' },
                                    '& td, & th, & div, & span': { 
                                        wordBreak: 'break-all !important',
                                        wordWrap: 'break-word !important',
                                        whiteSpace: 'pre-wrap !important',
                                        overflow: 'visible !important'
                                    }
                                }}>
                                    {selectedDoc.doc_type === 'INTERNAL_DRAFT' && (
                                        <InternalDraftForm 
                                            data={selectedDoc.content || {}} 
                                            onChange={() => {}} // Defensive no-op
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                    )}
                                    {selectedDoc.doc_type === 'EXPENSE_REPORT' && (
                                        <ExpenseReportForm 
                                            data={selectedDoc.content || {}} 
                                            onChange={() => {}} // Defensive no-op
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                    )}
                                    {(selectedDoc.doc_type === 'LEAVE_REQUEST' || selectedDoc.doc_type === 'VACATION') && (
                                        <LeaveRequestForm 
                                            data={selectedDoc.doc_type === 'VACATION' ? {...(selectedDoc.content || {}), vacation_type: selectedDoc.content?.vacation_type, start_date: selectedDoc.content?.start_date, end_date: selectedDoc.content?.end_date, vacation_reason: selectedDoc.content?.reason} : (selectedDoc.content || {})} 
                                            onChange={() => {}} // Defensive no-op
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                    )}
                                    {selectedDoc.doc_type === 'EARLY_LEAVE' && (
                                        <EarlyLeaveForm 
                                            data={selectedDoc.content || {}} 
                                            onChange={() => {}} // Defensive no-op
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                    )}
                                    {(selectedDoc.doc_type === 'CONSUMABLES_PURCHASE' || selectedDoc.doc_type === 'SUPPLIES') && (
                                        <ConsumablesPurchaseForm 
                                            data={selectedDoc.content || {}} 
                                            onChange={() => {}} // Defensive no-op
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                    )}
                                    {selectedDoc.doc_type === 'OVERTIME' && (
                                        <OvertimeWorkForm 
                                            data={selectedDoc.content || {}} 
                                            onChange={() => {}} // Defensive no-op
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                    )}
                                    {selectedDoc.doc_type === 'PURCHASE_ORDER' && (
                                        <PurchaseOrderForm 
                                            data={selectedDoc.content || {}} 
                                            onChange={() => {}} // Defensive no-op
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                    )}
                                </Box>
                            </div>


                            {selectedDoc.rejection_reason && (
                                <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-xl flex gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <div>
                                        <p className="text-red-400 text-sm font-bold">諛섎젮 ?ъ쑀</p>
                                        <p className="text-red-300/80 text-sm mt-1">{selectedDoc.rejection_reason}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Processing Section (Only for Approvers if it's their turn) */}
                        {canApprove(selectedDoc) && (
                            <div className="p-6 border-t border-gray-600 bg-gray-900 sticky bottom-0 z-[100] shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
                                <div className="max-w-4xl mx-auto space-y-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-gray-400">寃곗옱 ?섍껄 / 諛섎젮 ?ъ쑀 (?꾩슂 ??</label>
                                        <textarea
                                            id="comment"
                                            className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-3 min-h-[60px]"
                                            placeholder="諛섎젮 ???ъ쑀瑜?紐낇솗???곸뼱二쇱꽭??"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => {
                                                const comment = document.getElementById('comment').value;
                                                if (!comment) {
                                                    alert('諛섎젮 ?ъ쑀瑜??낅젰?댁＜?몄슂.');
                                                    return;
                                                }
                                                handleProcess(selectedDoc.id, 'REJECTED', comment);
                                            }}
                                            className="flex-1 px-4 py-3 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-xl transition-all font-bold border border-red-800/50 flex items-center justify-center gap-2"
                                        >
                                            <X className="w-5 h-5" />
                                            諛섎젮?섍린
                                        </button>
                                        <button
                                            onClick={() => {
                                                const comment = document.getElementById('comment').value;
                                                handleProcess(selectedDoc.id, 'APPROVED', comment);
                                            }}
                                            className="flex-[2] px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-900/20 font-bold flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle2 className="w-5 h-5" />
                                            ?뱀씤/?쒕챸?섍린
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

        </>
    );
};

export default ApprovalPage;

