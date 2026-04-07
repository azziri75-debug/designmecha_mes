import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    FileText, UserPlus, Clock, CheckCircle2, AlertCircle,
    Plus, Search, Filter, Pencil, Trash, X, Check,
    Calendar, User, Layers, Info, Settings, ClipboardList,
    ChevronRight, ArrowRight, Download, Upload, Printer,
    Paperclip, File, ExternalLink, FileDown
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
import BusinessTripExpenseForm from '../components/BusinessTripExpenseForm';

const DOC_TYPES = {
    INTERNAL_DRAFT: { label: '내부기안', color: 'blue' },
    EXPENSE_REPORT: { label: '지출결의서', color: 'indigo' },
    BUSINESS_TRIP: { label: '출장여비정산서', color: 'rose' },
    LEAVE_REQUEST: { label: '휴가신청서', color: 'teal' },
    EARLY_LEAVE: { label: '조퇴/외출서', color: 'purple' },
    CONSUMABLES_PURCHASE: { label: '소모품 구매신청서', color: 'cyan' },
    OVERTIME: { label: '연장/특근신청서', color: 'orange' },
    PURCHASE_ORDER: { label: '구매발주서', color: 'amber' }
};

const STATUS_MAP = {
    PENDING: { label: '기안대기', bg: 'bg-gray-700', text: 'text-gray-300' },
    IN_PROGRESS: { label: '결재진행', bg: 'bg-blue-900/40', text: 'text-blue-400' },
    COMPLETED: { label: '결재완료', bg: 'bg-emerald-900/40', text: 'text-emerald-400' },
    REJECTED: { label: '반려', bg: 'bg-red-900/40', text: 'text-red-400' }
};

const ApprovalPage = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('documents'); // documents, settings
    const [documents, setDocuments] = useState([]);
    
    const handlePrintApproval = async () => {
        const contentEl = document.querySelector('.a4-wrapper');
        if (contentEl) {
            await printAsImage(contentEl, { title: '전자결제 문서', orientation: 'portrait' });
        }
    };

    const handleDownloadPDFApproval = async () => {
        const contentEl = document.querySelector('.a4-wrapper');
        if (contentEl) {
            const docType = DOC_TYPES[selectedDoc.doc_type]?.label || '문서';
            const authorName = selectedDoc.author?.name || '기안자';
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
    const [approvalComment, setApprovalComment] = useState('');

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
            setStaff(Array.isArray(staffRes.data) ? staffRes.data : []);
            setDocuments(Array.isArray(docRes.data) ? docRes.data : []);

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
        if (!window.confirm('정말 삭제하시겠습니까? 관련 결재 데이터가 모두 삭제됩니다.')) return;
        try {
            await api.delete(`/approval/documents/${docId}`);
            alert('삭제되었습니다.');
            setShowDocDetail(false);
            setDocuments(prev => prev.filter(doc => doc.id !== docId));
        } catch (error) {
            alert('삭제 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleEditDoc = (doc) => {
        navigate(`/approval/draft?id=${doc.id}`);
        setShowDocDetail(false);
    };

    const handleProcess = async (docId, status, comment) => {
        try {
            await api.post(`/approval/documents/${docId}/process`, { status, comment });
            alert(status === 'APPROVED' ? '승인되었습니다.' : '반려되었습니다.');
            setShowDocDetail(false);
            fetchInitialData();
        } catch (error) {
            alert('처리 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const isEditable = (doc) => {
        if (!doc || !currentUser) return false;
        const isAuthor = Number(doc.author_id) === Number(currentUser?.id);
        if (!isAuthor) return false;
        return ['PENDING', 'DRAFT', 'REJECTED', 'IN_PROGRESS'].includes(doc.status);
    };

    const canApprove = (doc) => {
        if (!doc || !currentUser) return false;
        const steps = Array.isArray(doc.steps) ? doc.steps : [];
        const pendingSteps = steps.filter(s => s.status === 'PENDING');
        
        if (pendingSteps.length === 0) return false;

        const myId = Number(currentUser?.id);
        
        // Find the "true" current sequence (the first available sequence that is still PENDING)
        const trueCurrentSeq = Math.min(...pendingSteps.map(s => Number(s.sequence)));
        
        // Must match the exact trueCurrentSeq AND be the current user
        const myStep = pendingSteps.find(
            s => Number(s.sequence) === trueCurrentSeq &&
                 Number(s.approver_id ?? s.approverId ?? 0) === myId
        );

        if (myStep) {
            console.log('[canApprove] Success match with trueCurrentSeq:', trueCurrentSeq);
            return true;
        }

        return false;
    };

    const openDocDetail = async (doc) => {
        try {
            // Fetch fresh data to get latest current_sequence and steps
            const res = await api.get(`/approval/documents/${doc.id}`);
            setSelectedDoc(res.data);
        } catch (e) {
            console.warn('Failed to fetch doc detail, using list data', e);
            setSelectedDoc(doc);
        }
        setShowDocDetail(true);
    };

    const handleSaveLines = async (type) => {
        try {
            const sanitizedLines = (approvalLines[type] || []).map(line => ({
                doc_type: type,
                approver_id: line.approver_id,
                sequence: line.sequence
            }));
            await api.post(`/approval/lines?doc_type=${type}`, sanitizedLines);
            alert('결재선이 저장되었습니다.');
        } catch (error) {
            console.error('Save failed:', error);
            alert('저장 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const addApprover = (type) => {
        const admins = staff.filter(s => s.user_type === 'ADMIN' && ['부장', '이사', '대표이사'].includes(s.role));
        if (admins.length === 0) {
            alert('결재권자로 지정 가능한 부장급 이상의 관리자가 없습니다.');
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
            <div className={cn("space-y-6 approval-page-content", showDocDetail && "print-hide")}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <FileText className="w-6 h-6 text-blue-500" />
                            전자결제 및 문서 관리
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">휴가, 조퇴, 소모품 신청 및 결제 프로세스</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => navigate('/approval/draft')}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            문서 기안
                        </button>
                        <div className="bg-gray-800 p-1 rounded-lg border border-gray-700 flex">
                            <button
                                onClick={() => setActiveTab('documents')}
                                className={cn("px-4 py-1.5 rounded-md text-sm transition-all", activeTab === 'documents' ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white")}
                            >
                                문서 목록
                            </button>
                            <button
                                onClick={() => setActiveTab('settings')}
                                className={cn("px-4 py-1.5 rounded-md text-sm transition-all", activeTab === 'settings' ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white")}
                            >
                                결재선 설정
                            </button>
                        </div>
                    </div>
                </div>

                {activeTab === 'documents' ? (
                    <div className="space-y-4">
                        <div className="flex gap-1 bg-gray-900/50 p-1 rounded-xl border border-gray-700/50">
                            {[
                                { id: 'ALL', label: '전체' },
                                { id: 'ALL_PENDING', label: '전체 대기' },
                                { id: 'ALL_COMPLETED', label: '전체 완료' },
                                { id: 'ALL_REJECTED', label: '전체 반려' },
                                { id: 'WAITING_FOR_ME', label: '나의 결재 대기' },
                                { id: 'MY_WAITING', label: '나의 기안' }
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
                                <label className="text-xs text-gray-400">문서 종류</label>
                                <select
                                    className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                    value={filterDocType}
                                    onChange={(e) => setFilterDocType(e.target.value)}
                                >
                                    <option value="">전체</option>
                                    {Object.entries(DOC_TYPES).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">기안자</label>
                                <select
                                    className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                    value={filterAuthorId}
                                    onChange={(e) => setFilterAuthorId(e.target.value)}
                                >
                                    <option value="">전체 기안자</option>
                                    {staff.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">시작일 (기안일)</label>
                                <input
                                    type="date"
                                    className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                                    value={filterStartDate}
                                    onChange={(e) => setFilterStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">종료일 (기안일)</label>
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
                                            <th className="px-6 py-4">기안일</th>
                                            <th className="px-6 py-4">신청 적용일</th>
                                            <th className="px-6 py-4">기안자</th>
                                            <th className="px-6 py-4">종류</th>
                                            <th className="px-6 py-4">제목</th>
                                            <th className="px-6 py-4">상태</th>
                                            <th className="px-6 py-4 text-right">관리</th>
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
                                                            openDocDetail(doc);
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
                                                        <div className="flex items-center gap-2">
                                                            {doc.title}
                                                            {doc.attachments && doc.attachments.length > 0 && (
                                                                <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                                                            )}
                                                        </div>
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
                                                                            title="수정"
                                                                        >
                                                                            <Pencil className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }}
                                                                        className="p-1 hover:bg-gray-700 rounded text-red-400 transition-colors"
                                                                        title="삭제"
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
                                                    문서가 없습니다.
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
                                        {info.label} 결재선
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
                                                        .filter(s => s.user_type === 'ADMIN' && ['부장', '이사', '대표이사'].includes(s.role))
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
                                            결재선을 추가해주세요.
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border-t border-gray-700">
                                    <button
                                        onClick={() => handleSaveLines(type)}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                                    >
                                        설정 저장
                                    </button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {showDocDetail && selectedDoc && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-200/90 backdrop-blur-sm p-4 approval-modal-overlay no-print print-hide">
                    <div className="bg-white rounded-2xl border border-gray-300 w-full max-w-7xl h-full max-h-[95vh] shadow-2xl animation-fade-in my-auto flex flex-col overflow-hidden doc-detail-modal">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-white print-hide">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-500" />
                                    문서 상세 정보
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">ID: {selectedDoc.id} | 기안일: {format(new Date(selectedDoc.created_at), 'yyyy-MM-dd HH:mm')}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handlePrintApproval}
                                    className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Printer className="w-4 h-4" /> 인쇄
                                </button>
                                <button
                                    onClick={handleDownloadPDFApproval}
                                    className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                                >
                                    <FileDown className="w-4 h-4" /> PDF 저장
                                </button>
                                <button onClick={() => setShowDocDetail(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className={cn("p-6 md:p-8 space-y-8 overflow-y-auto flex-1 bg-[#eee] print:p-0 print:space-y-0", selectedDoc.doc_type === 'PURCHASE_ORDER' && "p-0 space-y-0")}>
                            {!['PURCHASE_ORDER', 'EXPENSE_REPORT'].includes(selectedDoc.doc_type) && (
                                <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-gray-300 pb-8 max-w-[210mm] mx-auto print-hide">
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
                                        <h2 className="text-2xl font-bold text-gray-800">{selectedDoc.title}</h2>
                                        <div className="flex items-center gap-4 text-sm text-gray-600">
                                            <div className="flex items-center gap-1.5 bg-white shadow-sm px-3 py-1 rounded-full border border-gray-200">
                                                <User className="w-3.5 h-3.5" />
                                                {selectedDoc.author?.name} {selectedDoc.author?.role}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        {(selectedDoc.steps || []).map((step, idx) => (
                                            <div key={idx} className="flex flex-col items-center gap-1.5 w-20">
                                                <div className="text-[10px] font-bold text-gray-400 uppercase">{step.approver?.role || (step.sequence === 1 ? '부장' : step.sequence === 2 ? '이사' : '대표이사')}</div>
                                                <div className="w-16 h-16 bg-white rounded border border-gray-200 shadow-sm flex items-center justify-center relative overflow-hidden group">
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
                                                            <div className="text-[10px] text-gray-300">대기중</div>
                                                            <div className="absolute inset-0 bg-gray-50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                <div className="text-[9px] text-gray-600 font-medium text-center px-1">{step.approver?.name}</div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="text-[9px] text-gray-400">{step.processed_at ? format(new Date(step.processed_at), 'MM-dd') : '---'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div 
                                className={cn(
                                "a4-wrapper no-shadow-on-print",
                                selectedDoc.doc_type === 'PURCHASE_ORDER' && "p-0"
                            )}>
                                <Box sx={{ 
                                    width: '100%',
                                    // Removed maxWidth/minHeight here because a4-wrapper handles it
                                    margin: '0 auto',
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    bgcolor: '#ffffff',
                                    p: { xs: '5mm', md: '5mm' },
                                    boxShadow: 'none',
                                    color: '#000000',
                                    '& *': { color: '#000000 !important', borderColor: '#000000 !important' },
                                    '& td, & th, & div, & span': { 
                                        wordBreak: 'break-all !important',
                                        wordWrap: 'break-word !important',
                                        whiteSpace: 'pre-wrap !important',
                                        overflow: 'visible !important'
                                    }
                                }}>
                                    {/* ... document form cases ... */}
                                    {selectedDoc.doc_type === 'INTERNAL_DRAFT' && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = { ...c, items: Array.isArray(c.items) ? c.items : [] };
                                        return (
                                        <InternalDraftForm 
                                            data={safeC} 
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}
                                    {selectedDoc.doc_type === 'EXPENSE_REPORT' && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = { ...c, items: Array.isArray(c.items) ? c.items : [] };
                                        return (
                                        <ExpenseReportForm 
                                            data={safeC} 
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}
                                    {selectedDoc.doc_type === 'BUSINESS_TRIP' && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = { ...c, items: Array.isArray(c.items) ? c.items : [] };
                                        return (
                                        <BusinessTripExpenseForm 
                                            data={safeC} 
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}
                                    {(selectedDoc.doc_type === 'LEAVE_REQUEST' || selectedDoc.doc_type === 'VACATION') && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = selectedDoc.doc_type === 'VACATION'
                                            ? { ...c, vacation_type: c.vacation_type, start_date: c.start_date, end_date: c.end_date, vacation_reason: c.reason, items: [] }
                                            : { ...c, items: Array.isArray(c.items) ? c.items : [] };
                                        return (
                                        <LeaveRequestForm 
                                            data={safeC}
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}
                                    {selectedDoc.doc_type === 'EARLY_LEAVE' && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = { 
                                            ...c, 
                                            leave_type: c.leave_type || c.type,
                                            leave_time: c.leave_time || c.time,
                                            return_time: c.return_time || c.end_time,
                                            leave_reason: c.leave_reason || c.reason,
                                            items: Array.isArray(c.items) ? c.items : [] 
                                        };
                                        return (
                                        <EarlyLeaveForm 
                                            data={safeC} 
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}
                                    {(selectedDoc.doc_type === 'CONSUMABLES_PURCHASE' || selectedDoc.doc_type === 'SUPPLIES') && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = { ...c, items: Array.isArray(c.items) ? c.items : [] };
                                        return (
                                        <ConsumablesPurchaseForm 
                                            data={safeC} 
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}
                                    {selectedDoc.doc_type === 'OVERTIME' && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = { ...c, items: Array.isArray(c.items) ? c.items : [] };
                                        return (
                                        <OvertimeWorkForm 
                                            data={safeC} 
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}
                                    {selectedDoc.doc_type === 'PURCHASE_ORDER' && (() => {
                                        const c = selectedDoc.content || {};
                                        const safeC = { ...c, items: Array.isArray(c.items) ? c.items : [] };
                                        return (
                                        <PurchaseOrderForm 
                                            data={safeC} 
                                            onChange={() => {}} 
                                            isReadOnly={true} 
                                            documentData={selectedDoc}
                                            currentUser={currentUser}
                                        />
                                        );
                                    })()}


                                    {/* Attachment Section */}
                                    {selectedDoc.attachments && selectedDoc.attachments.length > 0 && (
                                        <Box className="no-print" sx={{ mt: 2, pt: 4, px: 4, pb: 4, borderTop: '2px solid #eee' }}>
                                            <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold', color: '#374151' }}>
                                                <Paperclip size={16} /> 관련 첨부파일 ({selectedDoc.attachments.length})
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                                {selectedDoc.attachments.map((file, idx) => (
                                                    <Box 
                                                        key={idx} 
                                                        sx={{ 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            gap: 1.5, 
                                                            p: 1.5, 
                                                            pr: 2,
                                                            bgcolor: '#f9fafb', 
                                                            border: '1px solid #e5e7eb', 
                                                            borderRadius: 2,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s',
                                                            '&:hover': {
                                                                bgcolor: '#f3f4f6',
                                                                borderColor: '#d1d5db',
                                                                transform: 'translateY(-1px)'
                                                            }
                                                        }}
                                                        onClick={() => window.open(getImageUrl(file.url), '_blank')}
                                                    >
                                                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                                                            <FileText size={16} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 'medium', color: '#111827', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {file.filename || file.name}
                                                            </Typography>
                                                            <Typography sx={{ fontSize: '0.65rem', color: '#6b7280' }}>
                                                                파일 열기
                                                            </Typography>
                                                        </div>
                                                        <ExternalLink size={12} className="text-gray-400 ml-1" />
                                                    </Box>
                                                ))}
                                            </Box>
                                        </Box>
                                    )}

                                </Box>
                            </div>

                            {selectedDoc.rejection_reason && (
                                <div className="bg-red-50 border border-red-200 p-5 rounded-xl flex gap-3 max-w-[210mm] mx-auto mt-4 shadow-sm">
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <div>
                                        <p className="text-red-700 text-sm font-bold">반려 사유</p>
                                        <p className="text-red-600/80 text-sm mt-1">{selectedDoc.rejection_reason}</p>
                                    </div>
                                </div>
                            )}

                            {/* Admin Debug Panel */}
                            {currentUser?.id === 1 && (
                                <div className="mt-8 p-4 bg-black/40 rounded-xl border border-gray-700 text-[10px] font-mono text-gray-500">
                                    <p className="font-bold text-gray-400 mb-2">[DEBUG INFO - ADMIN ONLY]</p>
                                    <p>My ID: {currentUser.id} (Type: {typeof currentUser.id})</p>
                                    <p>Doc Current Seq: {selectedDoc.current_sequence} (Type: {typeof selectedDoc.current_sequence})</p>
                                    <p>Doc Status: {selectedDoc.status}</p>
                                    <div className="mt-2 space-y-1">
                                        {selectedDoc.steps?.map((s, idx) => (
                                            <p key={idx} className={s.sequence === selectedDoc.current_sequence ? "text-yellow-500" : ""}>
                                                Step {idx}: Seq={s.sequence}({typeof s.sequence}), ApproverID={s.approver_id}({typeof s.approver_id}), Status={s.status}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {canApprove(selectedDoc) && (
                            <div className="p-4 md:p-6 border-t border-gray-200 bg-white flex-shrink-0 z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.05)] print-hide">
                                <div className="max-w-4xl mx-auto space-y-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">결재 의견 / 반려 사유 (필요 시)</label>
                                        <textarea
                                            value={approvalComment}
                                            onChange={e => setApprovalComment(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 min-h-[80px] text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            placeholder="반려 시에는 사유를 명확히 적어주세요"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => {
                                                if (!approvalComment.trim()) {
                                                    alert('반려 사유를 입력해주세요.');
                                                    return;
                                                }
                                                handleProcess(selectedDoc.id, 'REJECTED', approvalComment);
                                                setApprovalComment('');
                                            }}
                                            className="flex-1 px-4 py-3.5 bg-white hover:bg-red-50 text-red-500 rounded-xl transition-all font-bold border border-red-200 flex items-center justify-center gap-2 text-sm shadow-sm"
                                        >
                                            <X className="w-4 h-4" />
                                            반려하기
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleProcess(selectedDoc.id, 'APPROVED', approvalComment);
                                                setApprovalComment('');
                                            }}
                                            className="flex-[2] px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg shadow-blue-500/20 font-bold flex items-center justify-center gap-2 text-sm"
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            승인 / 서명하기
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
