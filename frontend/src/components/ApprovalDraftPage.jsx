import React, { useState, useRef, useEffect } from 'react';
import {
    Box, Button, TextField, Typography, Paper, Tabs, Tab,
    IconButton, Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
import { Printer, FileDown, Plus, Trash2, FileText, Send, UserCheck, X, CheckCircle2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import MultiFileUpload from './MultiFileUpload';
import { formatNumber, safeParseJSON } from '../lib/utils';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
import { useAuth } from '../contexts/AuthContext';

// Import New Components
import ApprovalLineSelector from './ApprovalLineSelector';
import InternalDraftForm from './InternalDraftForm';
import ExpenseReportForm from './ExpenseReportForm';
import ConsumablesPurchaseForm from './ConsumablesPurchaseForm';
import EarlyLeaveForm from './EarlyLeaveForm';
import LeaveRequestForm from './LeaveRequestForm';
import OvertimeWorkForm from './OvertimeWorkForm';
import PurchaseOrderForm from './PurchaseOrderForm';
import BusinessTripExpenseForm from './BusinessTripExpenseForm';
import ApprovalGrid from './ApprovalGrid';

const DOC_TYPES = [
    { value: 'INTERNAL_DRAFT', label: '내부기안' },
    { value: 'EXPENSE_REPORT', label: '지출결의서' },
    { value: 'BUSINESS_TRIP', label: '출장여비정산서' },
    { value: 'LEAVE_REQUEST', label: '휴가원' },
    { value: 'EARLY_LEAVE', label: '조퇴/외출원' },
    { value: 'CONSUMABLES_PURCHASE', label: '소모품 구매신청서' },
    { value: 'OVERTIME', label: '야근/특근신청서' },
    { value: 'PURCHASE_ORDER', label: '구매발주서' },
];

const ApprovalDraftPage = ({ documentData: initialData, onSave, onCancel }) => {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const docIdFromUrl = searchParams.get('id');

    const [documentData, setDocumentData] = useState(initialData || null);
    const [docType, setDocType] = useState(initialData?.doc_type || 'INTERNAL_DRAFT');
    const [title, setTitle] = useState('');
    const [formContent, setFormContent] = useState({});
    const [referenceId, setReferenceId] = useState(initialData?.reference_id || null);
    const [referenceType, setReferenceType] = useState(initialData?.reference_type || null);
    
    const [customApprovers, setCustomApprovers] = useState([]);
    const [showApproverSelector, setShowApproverSelector] = useState(false);

    const [attachments, setAttachments] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const printRef = useRef();

    useEffect(() => {
        if (docIdFromUrl) {
            fetchDocument(docIdFromUrl);
        }
    }, [docIdFromUrl]);

    useEffect(() => {
        if (documentData) {
            setDocType(documentData.doc_type);
            setTitle(documentData.title || '');
            setFormContent(documentData.content || {});
            setAttachments(documentData.attachments || []);
            setReferenceId(documentData.reference_id);
            setReferenceType(documentData.reference_type);
        } else {
            // Auto-fill from navigation state (Integration)
            if (navigate.state?.autoFill) {
                const { type, ref_id, data } = navigate.state.autoFill;
                setDocType(type);
                setReferenceId(ref_id);
                setReferenceType(type === 'PURCHASE_ORDER' ? 'PURCHASE' : (type === 'OUTSOURCING' ? 'OUTSOURCING' : null));
                setFormContent(data);
                if (data.title) setTitle(data.title);
            } else {
                // Set today's date as default for all forms
                const today = new Date().toISOString().split('T')[0];
                setFormContent({ 
                    request_date: today, 
                    draft_date: today, 
                    date: today,
                    items: docType === 'INTERNAL_DRAFT' ? [{ name: '', spec: '', unit: '', quantity: '', unit_price: '', amount: '', remarks: '' }] : undefined
                });
            }
        }
    }, [documentData, navigate.state]);

    // [Issue 2 Fix] Fetch default approval lines when docType changes
    useEffect(() => {
        if (!initialData && docType) {
            fetchDefaultLines(docType);
        }
    }, [docType, initialData]);

    const fetchDefaultLines = async (type) => {
        try {
            const res = await api.get(`/approval/lines?doc_type=${type}`);
            if (res.data && res.data.length > 0) {
                const lines = res.data.map(line => ({
                    ...line.approver,
                    staff_id: line.approver_id,
                    sequence: line.sequence
                }));
                setCustomApprovers(lines);
            } else {
                setCustomApprovers([]);
            }
        } catch (err) {
            console.error("Failed to fetch default lines", err);
        }
    };

    const fetchDocument = async (id) => {
        setIsLoading(true);
        try {
            const res = await api.get(`/approval/documents/${id}`);
            setDocumentData(res.data);
            // If it has steps, extract custom if they were saved (optional if needed)
        } catch (err) {
            console.error(err);
            alert('문서를 불러오는데 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrint = async () => {
        await printAsImage(printRef.current, { title: "전자결재 문서", orientation: "portrait" });
    };

        const handleDownloadPDF = async () => {
        if (!printRef.current) return;
        const fileName = `${docType}_${title || '문서'}_${Date.now()}.pdf`;
        await generateA4PDF(printRef.current, {
            fileName,
            orientation: 'portrait',
            action: 'download',
            pixelRatio: 3,
            multiPage: true
        });
    };;

    const canApprove = (doc) => {
        if (!doc || !currentUser || !doc.steps) return false;
        
        // 타입 불일치를 방지하기 위해 모두 String으로 변환
        const myStaffId = String(currentUser?.staff_id || currentUser?.id || "");
        const pendingApprovers = doc.steps.filter(a => a.status === 'PENDING');
        const currentApproverToSign = pendingApprovers.length > 0 ? pendingApprovers[0] : null;

        if (!currentApproverToSign) return false;

        const approverId = String(currentApproverToSign.approver_id || "");
        const stepStaffId = String(currentApproverToSign.staff_id || "");

        return (approverId === myStaffId || stepStaffId === myStaffId);
    };

    const handleProcess = async (status) => {
        if (!documentData) return;
        const comment = window.prompt(status === 'APPROVED' ? "승인 하시겠습니까?" : "반려 사유를 입력해주세요.");
        if (status === 'REJECTED' && !comment) return alert("반려 사유를 입력해야 합니다.");

        setIsSaving(true);
        try {
            await api.post(`/approval/documents/${documentData.id}/process`, { status, comment });
            alert(status === 'APPROVED' ? '승인되었습니다.' : '반려되었습니다.');
            navigate('/approval');
        } catch (err) {
            console.error(err);
            alert('처리 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = async () => {
        let finalTitle = title;
        if (docType === 'INTERNAL_DRAFT' && formContent?.title) {
            finalTitle = formContent.title;
        } else if (docType !== 'INTERNAL_DRAFT') {
            const label = DOC_TYPES.find(t => t.value === docType)?.label || '문서';
            const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/ /g, '');
            finalTitle = `[${label}] ${currentUser?.name || ''} - ${todayStr}`;
        }

        if (!finalTitle) { alert('제목을 입력해주세요.'); return; }
        setIsSaving(true);
        try {
            const payload = {
                title: finalTitle,
                doc_type: docType,
                // [FIX] Ensure content is a valid dictionary (Object) for Pydantic
                content: typeof formContent === 'string' ? safeParseJSON(formContent, {}) : (formContent || {}),
                // [FIX] Ensure attachment_file is a valid list of dicts for Pydantic
                attachment_file: attachments?.map(a => ({ filename: a.name || a.filename, url: a.url })) || [],
                attachments_to_add: attachments?.map(a => ({ filename: a.name || a.filename, url: a.url })) || [],
                custom_approvers: (customApprovers || []).length > 0 ? customApprovers.map(a => ({ 
                    staff_id: a.staff_id || a.user_id || a.id || a.value,
                    sequence: a.sequence 
                })) : null,
                reference_id: referenceId,
                reference_type: referenceType
            };

            if (payload.custom_approvers) {
                console.log("현재 결재자 배열 상태:", payload.custom_approvers);
            }

            if (documentData?.id) {
                await api.put(`/approval/documents/${documentData.id}`, payload);
                alert('문서가 수정되어 다시 제출되었습니다.');
            } else {
                await api.post('/approval/documents', payload);
                alert('결재 요청이 상신되었습니다.');
            }
            if (onSave) onSave();
            else navigate('/approval');
        } catch (err) {
            console.error(err);
            alert('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const isReadOnly = (documentData && !['PENDING', 'REJECTED', 'IN_PROGRESS'].includes(documentData.status)) || (documentData && parseInt(documentData.author_id) !== parseInt(currentUser?.id));

    const virtualDocData = documentData || {
        author: currentUser,
        steps: (customApprovers || []).length > 0 ? customApprovers.map(a => ({ approver: a, sequence: a.sequence, status: 'PENDING' })) : []
    };

    const renderFormBody = () => {
        const commonProps = {
            data: formContent,
            onChange: setFormContent,
            isReadOnly,
            currentUser,
            documentData: virtualDocData
        };

        switch (docType) {
            case 'EXPENSE_REPORT': return <ExpenseReportForm {...commonProps} />;
            case 'BUSINESS_TRIP': return <BusinessTripExpenseForm {...commonProps} />;
            case 'CONSUMABLES_PURCHASE': return <ConsumablesPurchaseForm {...commonProps} />;
            case 'EARLY_LEAVE': return <EarlyLeaveForm {...commonProps} />;
            case 'LEAVE_REQUEST': return <LeaveRequestForm {...commonProps} />;
            case 'OVERTIME': return <OvertimeWorkForm {...commonProps} />;
            case 'PURCHASE_ORDER': return <PurchaseOrderForm {...commonProps} />;
            case 'INTERNAL_DRAFT':
            default:
                return (
                    <Box sx={{ pt: 2 }}>
                        <InternalDraftForm {...commonProps} />
                    </Box>
                );
        }
    };

    return (
        <Box sx={{ bgcolor: '#525659', minHeight: '100vh', py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'auto' }}>
            {/* Header / Tabs Container */}
            <Paper elevation={1} sx={{ width: '100%', maxWidth: '1100px', mb: 3, borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 100, bgcolor: 'white' }}>
                <div className="flex items-center justify-between p-5 bg-white">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-500" />
                            {documentData?.id ? '문서 상세 보기' : '결재 문서 기안'}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isReadOnly && (
                            <button 
                                onClick={handleSubmit} 
                                disabled={isSaving}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                            >
                                <Send className="w-4 h-4" />
                                {documentData?.id ? '다시 제출하기' : '기안 제출하기'}
                            </button>
                        )}
                        {!isReadOnly && (
                            <button 
                                onClick={() => setShowApproverSelector(true)}
                                className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                            >
                                <UserCheck className="w-4 h-4" /> 결재자 지정
                            </button>
                        )}
                        <button
                            onClick={handlePrint}
                            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                        >
                            <Printer className="w-4 h-4" /> 인쇄
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                        >
                            <FileDown className="w-4 h-4" /> PDF 저장
                        </button>
                        <button onClick={() => navigate('/approval')} className="text-gray-400 hover:text-gray-600 transition-colors ml-2">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {!isReadOnly && !documentData?.id && (
                    <Tabs 
                        value={docType} 
                        onChange={(_, val) => setDocType(val)} 
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ 
                            px: 2,
                            borderTop: '1px solid #f3f4f6',
                            '& .MuiTab-root': { fontSize: '13px', minHeight: '48px' }
                        }}
                    >
                        {DOC_TYPES.map(type => (
                            <Tab key={type.value} label={type.label} value={type.value} />
                        ))}
                    </Tabs>
                )}
            </Paper>

            <Paper
                ref={printRef}
                className="a4-paper-root print-safe-area"
                elevation={10}
                sx={{
                    width: '210mm',
                    height: '297mm',
                    minHeight: '297mm',
                    maxHeight: '297mm',
                    display: 'flex',
                    flexDirection: 'column',
                    p: '15mm',
                    mb: 4,
                    bgcolor: 'white',
                    fontFamily: '"Malgun Gothic", "Dotum", sans-serif',
                    position: 'relative',
                    color: '#000000',
                    boxSizing: 'border-box',
                    overflow: 'hidden', // A4 영역 밖으로 나가지 않게 고정
                    flexShrink: 0,
                    '& *': { color: '#000000 !important', borderColor: '#000000 !important' } 
                }}
            >
                {renderFormBody()}
            </Paper>

            <style>{`
                @media (max-width: 768px) {
                    .a4-paper-root { 
                        width: 100% !important; 
                        min-width: auto !important; 
                        padding: 20px !important; 
                        margin: 0 !important;
                        box-shadow: none !important;
                        min-height: auto !important;
                    }
                }
                /* Global A4 Styles for overflow prevention */
                .a4-paper-root td, .a4-paper-root th, .a4-paper-root input, .a4-paper-root textarea {
                    word-break: break-all;
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    overflow: visible !important;
                }
                /* Reset nested a4-wrapper to be flexible within the paper root */
                .a4-paper-root .a4-wrapper {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-height: auto !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    background-color: transparent !important;
                }
                .a4-paper-root .a4-wrapper.print-safe-area {
                    padding: 10mm !important;
                }
            `}</style>

            {/* Attachments UI */}
            <Paper sx={{ width: '100%', maxWidth: '1100px', p: 3, mb: 4 }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileText size={20} /> 증빙 서류 및 첨부파일
                </Typography>
                <MultiFileUpload files={attachments} onChange={setAttachments} isReadOnly={isReadOnly} />
            </Paper>

            <ApprovalLineSelector 
                open={showApproverSelector} 
                onClose={() => setShowApproverSelector(false)}
                onSelect={setCustomApprovers}
                currentLines={customApprovers}
            />
            {/* Processing Section (Only for Approvers if it's their turn) */}
            {canApprove(documentData) && (
                <Box 
                    sx={{ 
                        width: '100%', 
                        position: 'sticky', 
                        bottom: 0, 
                        zIndex: 200, 
                        bgcolor: '#1f2937', 
                        borderTop: '2px solid #374151', 
                        p: 3,
                        boxShadow: '0 -10px 20px rgba(0,0,0,0.5)',
                        display: 'flex',
                        justifyContent: 'center'
                    }}
                >
                    <Box sx={{ width: '100%', maxWidth: '800px', display: 'flex', gap: 2 }}>
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            color="error" 
                            startIcon={<X />} 
                            onClick={() => handleProcess('REJECTED')}
                            sx={{ py: 1.5, fontWeight: 'bold', fontSize: '1rem', borderRadius: 2 }}
                        >
                            반려하기
                        </Button>
                        <Button 
                            fullWidth 
                            variant="contained" 
                            color="success" 
                            startIcon={<CheckCircle2 />} 
                            onClick={() => handleProcess('APPROVED')}
                            sx={{ py: 1.5, fontWeight: 'bold', fontSize: '1rem', borderRadius: 2 }}
                        >
                            승인 / 서명하기
                        </Button>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default ApprovalDraftPage;
