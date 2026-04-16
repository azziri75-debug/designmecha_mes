import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    FileText, UserPlus, Clock, CheckCircle2, AlertCircle,
    Plus, Search, Filter, Pencil, Trash, X, Check,
    Calendar, User, Layers, Info, Settings, ClipboardList,
    ChevronRight, ArrowRight, Download, Upload, Printer,
    Paperclip, File, ExternalLink, FileDown, MessageSquare
} from 'lucide-react';
import api from '../lib/api';
import { cn, getImageUrl } from '../lib/utils';
import { Box, Typography } from '@mui/material';
import Card from '../components/Card';
import { format } from 'date-fns';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
import { useAuth } from '../contexts/AuthContext';
import { useApprovalBadge } from '../contexts/ApprovalBadgeContext';
import { useSSE } from '../hooks/useSSE';
import InternalDraftForm from '../components/InternalDraftForm';
import ExpenseReportForm from '../components/ExpenseReportForm';
import ConsumablesPurchaseForm from '../components/ConsumablesPurchaseForm';
import EarlyLeaveForm from '../components/EarlyLeaveForm';
import LeaveRequestForm from '../components/LeaveRequestForm';
import OvertimeWorkForm from '../components/OvertimeWorkForm';
import PurchaseOrderForm from '../components/PurchaseOrderForm';
import BusinessTripExpenseForm from '../components/BusinessTripExpenseForm';
import ResizableTable from '../components/ResizableTable';

const APPROVAL_COLS = [
    { key: 'date',    label: '기안일',   width: 110 },
    { key: 'author',  label: '기안자',   width: 130 },
    { key: 'type',    label: '종류',    width: 130 },
    { key: 'title',   label: '제목',    width: 300 },
    { key: 'status',  label: '상태',    width: 110 },
    { key: 'actions', label: '관리',   width: 100, noResize: true },
];

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
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(false);
    const { user: currentUser } = useAuth();
    const { waitingCount, refresh: refreshBadge } = useApprovalBadge();
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

    // 인라인 제목 편집 (관리자 전용)
    const [editingTitleId, setEditingTitleId] = useState(null);
    const [editingTitleValue, setEditingTitleValue] = useState('');

    const handlePrintApproval = async () => {
        const contentEl = document.querySelector('.doc-detail-modal .a4-wrapper');
        if (contentEl) {
            await printAsImage(contentEl, { title: '전자결제 문서', orientation: 'portrait' });
        }
    };

    const handleDownloadPDFApproval = async () => {
        const contentEl = document.querySelector('.doc-detail-modal .a4-wrapper');
        if (contentEl && selectedDoc) {
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

    useEffect(() => {
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

    // SSE: 결재 이벤트 수신 시 문서 목록 즉시 갱신
    useSSE((eventName) => {
        if (eventName === 'approval_updated') {
            fetchInitialData();
        }
    });

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
            closeDocDetail();
            setDocuments(prev => prev.filter(doc => doc.id !== docId));
        } catch (error) {
            alert('삭제 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleEditDoc = (doc) => {
        navigate(`/approval/draft?id=${doc.id}`);
        closeDocDetail();
    };

    const handleSaveTitle = async (docId) => {
        const newTitle = editingTitleValue.trim();
        if (!newTitle) {
            setEditingTitleId(null);
            return;
        }
        try {
            await api.patch(`/approval/documents/${docId}/title`, { title: newTitle });
            setDocuments(prev => prev.map(d => d.id === docId ? { ...d, title: newTitle } : d));
        } catch (err) {
            alert('제목 수정 실패: ' + (err.response?.data?.detail || err.message));
        } finally {
            setEditingTitleId(null);
        }
    };

    const handleRetitleAll = async () => {
        if (!window.confirm('기존 문서 제목을 새 형식으로 일괄 변환합니다. 계속하시겠습니까?')) return;
        try {
            const res = await api.post('/approval/admin/retitle-documents');
            alert(`완료: ${res.data.updated}건 업데이트, ${res.data.skipped}건 변경없음`);
            fetchInitialData();
        } catch (err) {
            alert('오류: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleProcess = async (docId, status, comment) => {
        try {
            await api.post(`/approval/documents/${docId}/process`, { status, comment });
            alert(status === 'APPROVED' ? '승인되었습니다.' : '반려되었습니다.');
            closeDocDetail();
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
        const trueCurrentSeq = Math.min(...pendingSteps.map(s => Number(s.sequence)));
        
        const myStep = pendingSteps.find(
            s => Number(s.sequence) === trueCurrentSeq &&
                 Number(s.approver_id ?? s.approverId ?? 0) === myId
        );

        return !!myStep;
    };

    const openDocDetail = async (doc) => {
        try {
            // Update URL to include docId instead of using local state only
            setSearchParams(prev => {
                prev.set('docId', doc.id);
                return prev;
            });
            
            const res = await api.get(`/approval/documents/${doc.id}`);
            setSelectedDoc(res.data);
            setShowDocDetail(true);
        } catch (e) {
            console.warn('Failed to fetch doc detail, using list data', e);
            setSelectedDoc(doc);
            setShowDocDetail(true);
        }
    };

    // [ADD] Synchronize showDocDetail state with URL docId parameter
    useEffect(() => {
        const docId = searchParams.get('docId');
        if (docId) {
            const docIdNum = Number(docId);
            if (!selectedDoc || selectedDoc.id !== docIdNum) {
                // If we have docId in URL but no selectedDoc, fetch it
                api.get(`/approval/documents/${docId}`).then(res => {
                    setSelectedDoc(res.data);
                    setShowDocDetail(true);
                }).catch(() => {
                    // If fail, clean URL
                    setSearchParams(prev => {
                        prev.delete('docId');
                        return prev;
                    });
                });
            } else {
                setShowDocDetail(true);
            }
        } else {
            setShowDocDetail(false);
            // Optionally clear selectedDoc to prevent flicker when reopening another
            // setSelectedDoc(null); 
        }
    }, [searchParams]);

    const closeDocDetail = () => {
        setSearchParams(prev => {
            prev.delete('docId');
            return prev;
        });
        // State will update via the useEffect above
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
        const admins = staff.filter(s => (s.user_type === 'ADMIN' || s.role === '대표이사') && ['부장', '이사', '대표이사'].includes(s.role));
        if (admins.length === 0) return alert('결재권자로 지정 가능한 부장급 이상의 관리자가 없습니다.');
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
                            <button onClick={() => setActiveTab('documents')} className={cn("px-4 py-1.5 rounded-md text-sm transition-all", activeTab === 'documents' ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white")}>문서 목록</button>
                            <button onClick={() => setActiveTab('settings')} className={cn("px-4 py-1.5 rounded-md text-sm transition-all", activeTab === 'settings' ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white")}>공통 결재선 (기본)</button>
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
                                { id: 'WAITING_FOR_ME', label: '나의 결재 대기', badge: waitingCount },
                                { id: 'MY_DRAFTS', label: '나의 기안' }
                            ].map(m => (
                                <button key={m.id} onClick={() => { setViewMode(m.id); setSearchParams({ mode: m.id }); if (m.id === 'WAITING_FOR_ME') refreshBadge(); }} className={cn("relative px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200", viewMode === m.id ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800")}>
                                    {m.label}
                                    {m.badge > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">
                                            {m.badge > 9 ? '9+' : m.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <Card className="p-4 flex flex-wrap gap-4 items-end">
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">문서 종류</label>
                                <select className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm" value={filterDocType} onChange={(e) => setFilterDocType(e.target.value)}>
                                    <option value="">전체</option>
                                    {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                            </div>
                            {/* ... more filters ... */}
                        </Card>

                        <Card>
                            <div className="overflow-x-auto">
                                <ResizableTable
                                    columns={APPROVAL_COLS}
                                    className="text-left"
                                    theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                                    thClassName="px-6 py-3"
                                >
                                    {documents.map((doc) => (
                                        <tr key={doc.id} className="hover:bg-gray-800/40 transition-colors group cursor-pointer divide-x divide-gray-700/30 border-b border-gray-700 text-gray-300" onClick={() => (doc.doc_type === 'INTERNAL_DRAFT' ? navigate(`/approval/draft?id=${doc.id}`) : openDocDetail(doc))}>
                                            <td className="px-6 py-4 text-sm text-gray-400 truncate">{format(new Date(doc.created_at), 'yyyy-MM-dd')}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-white truncate">{doc.author?.name} ({doc.author?.role})</td>
                                            <td className="px-6 py-4 truncate">
                                                <span className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase", `bg-${DOC_TYPES[doc.doc_type]?.color}-900/40 text-${DOC_TYPES[doc.doc_type]?.color}-400`)}>
                                                    {DOC_TYPES[doc.doc_type]?.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-100 font-semibold truncate" onClick={(e) => e.stopPropagation()}>
                                                {currentUser?.user_type === 'ADMIN' && editingTitleId === doc.id ? (
                                                    <input
                                                        autoFocus
                                                        className="w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-white text-sm outline-none"
                                                        value={editingTitleValue}
                                                        onChange={e => setEditingTitleValue(e.target.value)}
                                                        onBlur={() => handleSaveTitle(doc.id)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleSaveTitle(doc.id);
                                                            if (e.key === 'Escape') setEditingTitleId(null);
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-2 group/title">
                                                        <span className="truncate">{doc.title}</span>
                                                        {doc.attachments && doc.attachments.length > 0 && (
                                                            <Paperclip className="w-3.5 h-3.5 text-blue-400 shrink-0" title={`첨부파일 ${doc.attachments.length}건`} />
                                                        )}
                                                        {currentUser?.user_type === 'ADMIN' && (
                                                            <button
                                                                className="opacity-0 group-hover/title:opacity-100 transition-opacity text-gray-500 hover:text-blue-400 flex-shrink-0"
                                                                title="제목 수정"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingTitleId(doc.id);
                                                                    setEditingTitleValue(doc.title);
                                                                }}
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm truncate">
                                                <span className={cn("px-2 py-1 rounded-full text-[10px] font-bold", STATUS_MAP[doc.status]?.bg, STATUS_MAP[doc.status]?.text)}>
                                                    {STATUS_MAP[doc.status]?.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                {isEditable(doc) && (
                                                    <>
                                                        <button 
                                                            onClick={() => handleEditDoc(doc)}
                                                            className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                            title="수정"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteDoc(doc.id)}
                                                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="삭제"
                                                        >
                                                            <Trash className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                <ChevronRight className="w-5 h-5 text-gray-500" />
                                            </td>
                                        </tr>
                                    ))}
                                </ResizableTable>
                            </div>
                        </Card>
                    </div>
                ) : (
                    <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {Object.entries(DOC_TYPES).map(([type, info]) => (
                            <Card key={type} className="flex flex-col">
                                <div className="p-4 border-b border-gray-700 bg-gray-900/30 flex items-center justify-between font-bold text-white">
                                    {info.label} 기본 결재선
                                    <button onClick={() => addApprover(type)} className="text-blue-400"><Plus className="w-5 h-5" /></button>
                                </div>
                                <div className="p-4 flex-1 space-y-3 min-h-[300px]">
                                    {(approvalLines[type] || []).map((line, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-gray-900 p-3 rounded-lg border border-gray-700 group">
                                            <span className="bg-gray-800 text-gray-500 text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full border border-gray-700">{line.sequence}</span>
                                            <select value={line.approver_id} onChange={(e) => updateApprover(type, idx, e.target.value)} className="bg-transparent border-none text-white text-xs outline-none flex-1">
                                                {staff.filter(s => (s.user_type === 'ADMIN' || s.role === '대표이사') && ['부장', '이사', '대표이사'].includes(s.role)).map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                                            </select>
                                            <button onClick={() => removeApprover(type, idx)} className="text-gray-600 hover:text-red-500 ml-auto"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 border-t border-gray-700">
                                    <button onClick={() => handleSaveLines(type)} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg">설정 저장</button>
                                </div>
                            </Card>
                        ))}
                    </div>
                    {currentUser?.user_type === 'ADMIN' && (
                        <div className="mt-8 p-4 bg-gray-800 border border-yellow-700/40 rounded-xl">
                            <h4 className="text-yellow-400 font-bold text-sm mb-1 flex items-center gap-2">
                                <Settings className="w-4 h-4"/> 관리자 도구
                            </h4>
                            <p className="text-gray-400 text-xs mb-3">기존에 작성된 모든 문서의 제목을 새 형식으로 일괄 변환합니다.</p>
                            <button
                                onClick={handleRetitleAll}
                                className="bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                                기존 문서 제목 일괄 변환
                            </button>
                        </div>
                    )}
                    </>
                )}
            </div>

            {showDocDetail && selectedDoc && createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-200/90 backdrop-blur-sm p-4 approval-modal-overlay no-print print-hide">
                    <div className="bg-white rounded-2xl border border-gray-300 w-full max-w-7xl h-full max-h-[95vh] shadow-2xl my-auto flex flex-col overflow-hidden doc-detail-modal">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-white print-hide">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-500" /> 문서 상세 보기
                            </h3>
                            <div className="flex items-center gap-3">
                                <button onClick={handlePrintApproval} className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"><Printer className="w-4 h-4" /> 인쇄</button>
                                <button onClick={handleDownloadPDFApproval} className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"><FileDown className="w-4 h-4" /> PDF 저장</button>
                                <button onClick={closeDocDetail} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                            </div>
                        </div>

                        <div className="p-0 overflow-y-auto flex-1 bg-[#eee] flex flex-col print:p-0">
                            <div className="py-8 flex flex-col items-center">
                                {/* 결재자 의견 표시 (Desktop 전용, 인쇄 제외) */}
                                {selectedDoc.steps && selectedDoc.steps.some(s => s.comment && s.status === 'APPROVED' && s.comment !== '기안자 자동 승인') && (
                                    <div className="no-print w-full max-w-[210mm] mx-auto mb-6 px-4 space-y-3">
                                        <div className="flex items-center gap-2 text-blue-600 font-bold text-sm mb-2 px-1">
                                            <MessageSquare size={16} />
                                            결재자 의견 (승인 코멘트)
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            {selectedDoc.steps.filter(s => s.comment && s.status === 'APPROVED' && s.comment !== '기안자 자동 승인').map((step, idx) => (
                                                <div key={idx} className="bg-white/80 backdrop-blur-sm border border-blue-100 p-4 rounded-xl flex gap-4 shadow-sm border-l-4 border-l-blue-500">
                                                    <div className="bg-blue-100 text-blue-600 text-[10px] font-bold w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        {step.sequence}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-gray-900 text-xs font-bold">{step.approver?.name} {step.approver?.role}</span>
                                                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-500 text-[9px] font-bold rounded capitalize">APPROVED</span>
                                                            </div>
                                                            <span className="text-gray-400 text-[10px] font-medium">
                                                                {step.processed_at && format(new Date(step.processed_at), 'yyyy-MM-dd HH:mm')}
                                                            </span>
                                                        </div>
                                                        <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{step.comment}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="a4-wrapper no-shadow-on-print">
                                    <Box className="a4-paper-root" sx={{ 
                                        width: '210mm', height: '297mm', minHeight: '297mm', maxHeight: '297mm',
                                        margin: '0 auto', display: 'flex', flexDirection: 'column',
                                        bgcolor: '#ffffff', p: 0, boxSizing: 'border-box',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', color: '#000000',
                                        overflow: 'hidden', '& *': { color: '#000000 !important', borderColor: '#000000 !important' }
                                    }}>
                                        <Box sx={{ flex: 1, p: '15mm', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                                            {selectedDoc.doc_type === 'INTERNAL_DRAFT' && <InternalDraftForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                            {selectedDoc.doc_type === 'EXPENSE_REPORT' && <ExpenseReportForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                            {selectedDoc.doc_type === 'BUSINESS_TRIP' && <BusinessTripExpenseForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                            {(selectedDoc.doc_type === 'LEAVE_REQUEST' || selectedDoc.doc_type === 'VACATION') && <LeaveRequestForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                            {selectedDoc.doc_type === 'EARLY_LEAVE' && <EarlyLeaveForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                            {(selectedDoc.doc_type === 'CONSUMABLES_PURCHASE' || selectedDoc.doc_type === 'SUPPLIES') && <ConsumablesPurchaseForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                            {selectedDoc.doc_type === 'OVERTIME' && <OvertimeWorkForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                            {selectedDoc.doc_type === 'PURCHASE_ORDER' && <PurchaseOrderForm data={{...(selectedDoc.content||{}), items: Array.isArray(selectedDoc.content?.items) ? selectedDoc.content.items : []}} isReadOnly={true} onChange={() => {}} documentData={selectedDoc} currentUser={currentUser} />}
                                        </Box>
                                    </Box>
                                </div>
                                
                                {selectedDoc.attachments && selectedDoc.attachments.length > 0 && (
                                    <Box className="no-print" sx={{ mt: 4, pt: 4, px: 4, pb: 4, borderTop: '2px dotted #ccc', width: '210mm', mx: 'auto' }}>
                                        <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}>
                                            <Paperclip size={16} /> 관련 첨부파일 ({selectedDoc.attachments.length})
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                            {selectedDoc.attachments.map((file, idx) => (
                                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: '1px solid #ddd', borderRadius: 1, cursor: 'pointer' }} onClick={() => window.open(getImageUrl(file.url), '_blank')}>
                                                    <FileText size={14} className="text-blue-500" />
                                                    <Typography sx={{ fontSize: '0.75rem' }}>{file.filename || file.name}</Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    </Box>
                                )}
                            </div>

                            {selectedDoc.rejection_reason && (
                                <div className="bg-red-50 border border-red-200 p-5 rounded-xl flex gap-3 max-w-[210mm] mx-auto mt-4 mb-4 shadow-sm no-print">
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <div>
                                        <p className="text-red-700 text-sm font-bold">반려 사유</p>
                                        <p className="text-red-600/80 text-sm mt-1">{selectedDoc.rejection_reason}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {canApprove(selectedDoc) && (
                            <div className="p-4 md:p-6 border-t border-gray-200 bg-white flex-shrink-0 z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.05)] print-hide">
                                <div className="max-w-4xl mx-auto space-y-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-gray-700">결재 의견 / 반려 사유</label>
                                        <textarea value={approvalComment} onChange={e => setApprovalComment(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 min-h-[80px] text-sm outline-none" placeholder="반려 시 사유 필수 입력" />
                                    </div>
                                    <div className="flex gap-4">
                                        <button onClick={() => { if (!approvalComment.trim()) return alert('반려 사유를 입력해주세요.'); handleProcess(selectedDoc.id, 'REJECTED', approvalComment); }} className="flex-1 px-4 py-3 bg-red-50 text-red-500 rounded-xl border border-red-100 font-bold">반려하기</button>
                                        <button onClick={() => handleProcess(selectedDoc.id, 'APPROVED', approvalComment)} className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-xl font-bold">승인 / 서명하기</button>
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
