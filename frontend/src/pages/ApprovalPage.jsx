import React, { useState, useEffect } from 'react';
import {
    FileText, UserPlus, Clock, CheckCircle2, AlertCircle,
    Plus, Search, Filter, Pencil, Trash, X, Check,
    Calendar, User, Layers, Info, Settings, ClipboardList,
    ChevronRight, ArrowRight, Download, Eye, Upload
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';
import Card from '../components/Card';
import { format } from 'date-fns';

const DOC_TYPES = {
    VACATION: { label: '휴가원', color: 'blue' },
    EARLY_LEAVE: { label: '조퇴/외출원', color: 'purple' },
    SUPPLIES: { label: '소모품 신청서', color: 'emerald' }
};

const STATUS_MAP = {
    PENDING: { label: '기안대기', bg: 'bg-gray-700', text: 'text-gray-300' },
    IN_PROGRESS: { label: '결재진행', bg: 'bg-blue-900/40', text: 'text-blue-400' },
    COMPLETED: { label: '결재완료', bg: 'bg-emerald-900/40', text: 'text-emerald-400' },
    REJECTED: { label: '반려', bg: 'bg-red-900/40', text: 'text-red-400' }
};

const ApprovalPage = () => {
    const [activeTab, setActiveTab] = useState('documents'); // documents, settings
    const [viewMode, setViewMode] = useState('ALL'); // ALL, MY_DRAFTS, MY_APPROVALS
    const [documents, setDocuments] = useState([]);
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false); // New: distinguish create vs edit
    const [editDocId, setEditDocId] = useState(null); // New: track doc being edited
    const [selectedDocType, setSelectedDocType] = useState('VACATION');
    const [formData, setFormData] = useState({});
    const [showDocDetail, setShowDocDetail] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);

    // Settings states
    const [approvalLines, setApprovalLines] = useState({}); // { [doc_type]: lines[] }

    useEffect(() => {
        fetchInitialData();
    }, [activeTab, viewMode]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [staffRes, docRes] = await Promise.all([
                api.get('/basics/staff/'),
                api.get(`/approval/documents?view_mode=${viewMode}`)
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

    const handleCreateDoc = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                doc_type: selectedDocType,
                title: `${DOC_TYPES[selectedDocType].label} - ${format(new Date(), 'yyyy-MM-dd')}`,
                content: formData,
                attachment_file: formData.attachment_file || []
            };

            if (isEditing) {
                await api.put(`/approval/documents/${editDocId}`, payload);
                alert('기안 문서가 수정되었습니다.');
            } else {
                await api.post('/approval/documents', payload);
                alert('성공적으로 기안되었습니다.');
            }

            setShowCreateModal(false);
            setIsEditing(false);
            setEditDocId(null);
            setFormData({});
            fetchInitialData();
        } catch (error) {
            alert('요청 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleDeleteDoc = async (docId) => {
        if (!window.confirm('정말 삭제하시겠습니까? 관련 결재 데이터가 모두 삭제됩니다.')) return;
        try {
            await api.delete(`/approval/documents/${docId}`);
            alert('삭제되었습니다.');
            setShowDocDetail(false);
            fetchInitialData();
        } catch (error) {
            alert('삭제 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleEditDoc = (doc) => {
        setIsEditing(true);
        setEditDocId(doc.id);
        setSelectedDocType(doc.doc_type);
        setFormData(doc.content);
        setShowCreateModal(true);
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

    const handleSaveLines = async (type) => {
        try {
            // Sanitize data: only send approver_id and sequence
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
        const lines = [...(approvalLines[type] || [])];
        const admins = staff.filter(s => s.user_type === 'ADMIN');
        if (admins.length === 0) {
            alert('설정된 관리자 계정이 없습니다.');
            return;
        }
        lines.push({ doc_type: type, approver_id: admins[0].id, sequence: lines.length + 1 });
        setApprovalLines(prev => ({ ...prev, [type]: lines }));
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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-500" />
                        전자결재 및 문서 관리
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">휴가, 조퇴, 소모품 신청 및 결재 프로세스</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { setSelectedDocType('VACATION'); setShowCreateModal(true); }}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        문서 기안
                    </button>
                    <div className="bg-gray-800 p-1 rounded-lg border border-gray-700 flex">
                        <button
                            onClick={() => setActiveTab('documents')}
                            className={cn("px-4 py-1.5 rounded-md text-sm transition-all", activeTab === 'documents' ? "bg-gray-700 text-white shadow" : "text-gray-400 hover:text-white")}
                        >
                            문서함
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
                    <div className="flex gap-2">
                        {['ALL', 'MY_DRAFTS', 'MY_APPROVALS'].map(m => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                className={cn(
                                    "px-4 py-2 rounded-full text-xs font-semibold border transition-all",
                                    viewMode === m ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                                )}
                            >
                                {m === 'ALL' ? '전체 문서' : m === 'MY_DRAFTS' ? '내가 기안한 문서' : '내가 결재할 문서'}
                            </button>
                        ))}
                    </div>

                    <Card>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-900/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">기안일</th>
                                        <th className="px-6 py-4">기안자</th>
                                        <th className="px-6 py-4">종류</th>
                                        <th className="px-6 py-4">제목</th>
                                        <th className="px-6 py-4">상태</th>
                                        <th className="px-6 py-4 text-right">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {documents.map((doc) => (
                                        <tr
                                            key={doc.id}
                                            className="hover:bg-gray-800/50 transition-colors group cursor-pointer"
                                            onClick={() => { setSelectedDoc(doc); setShowDocDetail(true); }}
                                        >
                                            <td className="px-6 py-4 text-sm text-gray-300">
                                                {format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm')}
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
                                            <td className="px-6 py-4 text-sm text-gray-300 font-medium">
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
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 items-center">
                                                    {(doc.status === 'PENDING' || doc.status === 'REJECTED') && (
                                                        <>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleEditDoc(doc); }}
                                                                className="p-1 hover:bg-gray-700 rounded text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="수정"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }}
                                                                className="p-1 hover:bg-gray-700 rounded text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                    ))}
                                    {documents.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
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
                                    approvalLines[type].map((line, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-gray-900 p-3 rounded-lg border border-gray-700 group">
                                            <span className="bg-gray-800 text-gray-500 text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full border border-gray-700">
                                                {line.sequence}
                                            </span>
                                            <select
                                                value={line.approver_id}
                                                onChange={(e) => updateApprover(type, idx, e.target.value)}
                                                className="flex-1 bg-transparent text-sm text-white border-none focus:ring-0"
                                            >
                                                {staff.filter(s => s.user_type === 'ADMIN').map(s => (
                                                    <option key={s.id} value={s.id}>{s.name} ({s.role || '관리자'})</option>
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

            {/* Create Doc Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl shadow-2xl animation-fade-in my-auto">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-tight">
                                <Plus className="w-5 h-5 text-blue-500" />
                                {DOC_TYPES[selectedDocType].label} {isEditing ? '수정' : '기안'}
                            </h3>
                            <button onClick={() => { setShowCreateModal(false); setIsEditing(false); setEditDocId(null); setFormData({}); }} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6">
                            {!isEditing && (
                                <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 mb-6">
                                    {Object.entries(DOC_TYPES).map(([type, info]) => (
                                        <button
                                            key={type}
                                            onClick={() => setSelectedDocType(type)}
                                            className={cn(
                                                "flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all",
                                                selectedDocType === type ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"
                                            )}
                                        >
                                            {info.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <form onSubmit={handleCreateDoc} className="space-y-6">
                                {selectedDocType === 'VACATION' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">시작일</label>
                                                <input type="date" value={formData.start_date || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2" onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} required />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">종료일</label>
                                                <input type="date" value={formData.end_date || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2" onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} required />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">휴가 종류</label>
                                            <select value={formData.vacation_type || '연차'} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2" onChange={(e) => setFormData({ ...formData, vacation_type: e.target.value })}>
                                                <option value="연차">연차</option>
                                                <option value="반차">반차</option>
                                                <option value="경조휴가">경조휴가</option>
                                                <option value="병가">병가</option>
                                                <option value="기타">기타</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">사유</label>
                                            <textarea value={formData.reason || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 min-h-[100px]" placeholder="구체적인 사유를 입력해주세요." onChange={(e) => setFormData({ ...formData, reason: e.target.value })} required />
                                        </div>
                                    </div>
                                )}

                                {selectedDocType === 'EARLY_LEAVE' && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">일자</label>
                                            <input type="date" value={formData.date || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2" onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">시간</label>
                                                <input type="time" value={formData.time || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2" onChange={(e) => setFormData({ ...formData, time: e.target.value })} required />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">구분</label>
                                                <select value={formData.type || '조퇴'} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2" onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                                                    <option value="조퇴">조퇴</option>
                                                    <option value="외출">외출</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">사유</label>
                                            <textarea value={formData.reason || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 min-h-[100px]" placeholder="사유를 입력해주세요." onChange={(e) => setFormData({ ...formData, reason: e.target.value })} required />
                                        </div>
                                    </div>
                                )}

                                {selectedDocType === 'SUPPLIES' && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">신청 품목 및 수량</label>
                                            <textarea value={formData.items || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 min-h-[100px]" placeholder="예) A4 용지 2박스, 모나미 볼펜 10자루" onChange={(e) => setFormData({ ...formData, items: e.target.value })} required />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">용도/비고</label>
                                            <input value={formData.remarks || ''} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2" placeholder="사무용" onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} />
                                        </div>
                                    </div>
                                )}

                                <div className="pt-6 border-t border-gray-700 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { setShowCreateModal(false); setIsEditing(false); setEditDocId(null); setFormData({}); }}
                                        className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-2 flex-[2] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-bold flex items-center justify-center gap-2"
                                    >
                                        {isEditing ? '수정완료' : '기안하기'}
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Doc Detail / Process Modal */}
            {showDocDetail && selectedDoc && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-3xl shadow-2xl animation-fade-in my-auto overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-500" />
                                    문서 상세 정보
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">ID: {selectedDoc.id} | 기안일: {format(new Date(selectedDoc.created_at), 'yyyy-MM-dd HH:mm')}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {(selectedDoc.status === 'PENDING' || selectedDoc.status === 'REJECTED') && (
                                    <>
                                        <button
                                            onClick={() => handleEditDoc(selectedDoc)}
                                            className="p-2 hover:bg-gray-700 rounded-lg text-blue-400 transition-colors"
                                            title="수정"
                                        >
                                            <Pencil className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteDoc(selectedDoc.id)}
                                            className="p-2 hover:bg-gray-700 rounded-lg text-red-400 transition-colors"
                                            title="삭제"
                                        >
                                            <Trash className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                                <button onClick={() => setShowDocDetail(false)} className="text-gray-400 hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 md:p-8 space-y-8 overflow-y-auto max-h-[80vh]">
                            {/* Header Section (Stamp/Signature images) */}
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

                                {/* Approval Steps (Horizontal) */}
                                <div className="flex gap-3">
                                    {selectedDoc.steps.map((step, idx) => (
                                        <div key={idx} className="flex flex-col items-center gap-1.5 w-20">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase">{step.sequence === 1 ? '검토' : step.sequence === 2 ? '결재' : '최종'}</div>
                                            <div className="w-16 h-16 bg-white rounded border border-gray-600 flex items-center justify-center relative overflow-hidden group">
                                                {step.status === 'APPROVED' ? (
                                                    step.approver?.stamp_image ? (
                                                        <img src={step.approver?.stamp_image.url} alt="Sign" className="w-full h-full object-contain p-1" />
                                                    ) : (
                                                        <span className="text-[11px] text-emerald-600 font-bold border-2 border-emerald-500 px-1 rounded -rotate-12 uppercase">Approved</span>
                                                    )
                                                ) : step.status === 'REJECTED' ? (
                                                    <span className="text-[11px] text-red-600 font-bold border-2 border-red-500 px-1 rounded -rotate-12 uppercase">Rejected</span>
                                                ) : (
                                                    <div className="text-[10px] text-gray-300">대기중</div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <div className="text-[9px] text-white font-medium text-center px-1">{step.approver?.name}</div>
                                                </div>
                                            </div>
                                            <div className="text-[9px] text-gray-500">{step.processed_at ? format(new Date(step.processed_at), 'MM-dd') : '---'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-gray-900/30 p-6 rounded-xl border border-gray-700">
                                {selectedDoc.doc_type === 'VACATION' && (
                                    <>
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">기간</p>
                                            <p className="text-white font-medium">{selectedDoc.content.start_date} ~ {selectedDoc.content.end_date}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">구분</p>
                                            <p className="text-white font-medium">{selectedDoc.content.vacation_type}</p>
                                        </div>
                                        <div className="md:col-span-2 space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">사유</p>
                                            <p className="text-white bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 min-h-[100px] whitespace-pre-wrap">{selectedDoc.content.reason}</p>
                                        </div>
                                    </>
                                )}

                                {selectedDoc.doc_type === 'EARLY_LEAVE' && (
                                    <>
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">일시</p>
                                            <p className="text-white font-medium">{selectedDoc.content.date} {selectedDoc.content.time}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">구분</p>
                                            <p className="text-white font-medium">{selectedDoc.content.type}</p>
                                        </div>
                                        <div className="md:col-span-2 space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">사유</p>
                                            <p className="text-white bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 min-h-[100px] whitespace-pre-wrap">{selectedDoc.content.reason}</p>
                                        </div>
                                    </>
                                )}

                                {selectedDoc.doc_type === 'SUPPLIES' && (
                                    <>
                                        <div className="md:col-span-2 space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">신청 품목 및 수량</p>
                                            <p className="text-white bg-gray-900/50 p-4 rounded-lg border border-gray-700/50 min-h-[100px] whitespace-pre-wrap">{selectedDoc.content.items}</p>
                                        </div>
                                        <div className="md:col-span-2 space-y-1">
                                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">용도/비고</p>
                                            <p className="text-white font-medium">{selectedDoc.content.remarks || '-'}</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {selectedDoc.rejection_reason && (
                                <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-xl flex gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <div>
                                        <p className="text-red-400 text-sm font-bold">반려 사유</p>
                                        <p className="text-red-300/80 text-sm mt-1">{selectedDoc.rejection_reason}</p>
                                    </div>
                                </div>
                            )}

                            {/* Processing Section (Only for Approvers if it's their turn) */}
                            {selectedDoc.status !== 'COMPLETED' && selectedDoc.status !== 'REJECTED' && (
                                <div className="pt-8 border-t border-gray-700">
                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-sm font-medium text-gray-400">결재 의견 / 반려 사유 (필요 시)</label>
                                            <textarea
                                                id="comment"
                                                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-3 min-h-[80px]"
                                                placeholder="반려 시 사유를 명확히 적어주세요."
                                            />
                                        </div>
                                        <div className="flex gap-4">
                                            <button
                                                onClick={() => {
                                                    const comment = document.getElementById('comment').value;
                                                    if (!comment) {
                                                        alert('반려 사유를 입력해주세요.');
                                                        return;
                                                    }
                                                    handleProcess(selectedDoc.id, 'REJECTED', comment);
                                                }}
                                                className="flex-1 px-4 py-3 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-xl transition-all font-bold border border-red-800/50 flex items-center justify-center gap-2"
                                            >
                                                <X className="w-5 h-5" />
                                                반려하기
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const comment = document.getElementById('comment').value;
                                                    handleProcess(selectedDoc.id, 'APPROVED', comment);
                                                }}
                                                className="flex-[2] px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-900/20 font-bold flex items-center justify-center gap-2"
                                            >
                                                <CheckCircle2 className="w-5 h-5" />
                                                승인/서명하기
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovalPage;
