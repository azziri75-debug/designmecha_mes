import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemText,
    ListItemButton,
    Divider,
    TextField,
    Button,
    IconButton,
    BottomNavigation,
    BottomNavigationAction,
    Card,
    CardContent,
    Stack,
    CircularProgress,
    Chip,
    InputAdornment,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Radio,
    RadioGroup,
    FormControlLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    AppBar,
    Toolbar,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Avatar,
    Alert,
    Badge,
    Checkbox
} from '@mui/material';
import { getProductNameStr } from '../lib/productionUtils';
import {
    Assignment as AssignmentIcon,
    BarChart as BarChartIcon,
    PhotoCamera as PhotoCameraIcon,
    Save as SaveIcon,
    Delete as DeleteIcon,
    ArrowBack as ArrowBackIcon,
    Search as SearchIcon,
    ExpandMore as ExpandMoreIcon,
    ChevronRight as ChevronRightIcon,
    Description as DescriptionIcon,
    History as HistoryIcon,
    Cancel as CancelIcon,
    PendingActions as PendingActionsIcon,
    Add as AddIcon,
    Close as CloseIcon,
    CheckCircle as CheckCircleIcon,
    AssignmentInd as AssignmentIndIcon,
    Logout as LogoutIcon,
    EventNote as EventNoteIcon,
    BeachAccess as VacationIcon,
    Timer as TimerIcon,
    WorkHistory as OvertimeIcon,
    AccessTime as ClockIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useApprovalBadge } from '../contexts/ApprovalBadgeContext';
import { useSSE } from '../hooks/useSSE';
import api from '../lib/api';
import { safeParseJSON } from '../lib/utils';

const ATTENDANCE_DOC_META = {
    VACATION: { label: '휴가원', color: '#3b82f6', Icon: VacationIcon },
    EARLY_LEAVE: { label: '조퇴/외출원', color: '#a855f7', Icon: TimerIcon },
    OVERTIME: { label: '특근/야근', color: '#f59e0b', Icon: OvertimeIcon },
};

const MobileWorkLogPage = () => {
    const { user, logout } = useAuth();
    const { waitingCount } = useApprovalBadge();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Tab and selection state driven by URL to support "Back" button
    const tabFromUrl = parseInt(searchParams.get('tab') || '0', 10);
    const tab = isNaN(tabFromUrl) ? 0 : tabFromUrl;
    
    // Selection States
    const selectedPlanId = searchParams.get('planId');
    const selectedItemId = searchParams.get('itemId');
    const createDocInUrl = searchParams.get('create') === 'true';
    const selectedDocIdInUrl = searchParams.get('docId');

    const setTab = (newTab) => {
        const params = new URLSearchParams(searchParams);
        params.set('tab', newTab);
        setSearchParams(params);
    };

    const [loading, setLoading] = useState(false);

    // Data lists
    const [allPlans, setAllPlans] = useState([]);
    const [myPerformance, setMyPerformance] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('IN_PROGRESS'); // 기본: 생산중
    const [allProductGroups, setAllProductGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null); // null = 로딩 전

    // Performance Filters
    const now = new Date();
    const [perfYear, setPerfYear] = useState(now.getFullYear());
    const [perfMonth, setPerfMonth] = useState(now.getMonth() + 1);
    const [selectedWorker, setSelectedWorker] = useState(user?.user_type === 'ADMIN' ? 'ALL' : (user?.id || ''));

    const [comment, setComment] = useState('');
    const [editingDocId, setEditingDocId] = useState(null);
    const [originalAuthor, setOriginalAuthor] = useState(null);

    const [selectedItems, setSelectedItems] = useState([]); // Array of process items
    const [itemRecords, setItemRecords] = useState({}); // { [itemId]: { good: '', bad: '0' } }
    const [showForm, setShowForm] = useState(false); // Step 3 flag
    const [bulkGoodQty, setBulkGoodQty] = useState('');
    const [bulkBadQty, setBulkBadQty] = useState('0');
    const [note, setNote] = useState('');
    const [workDate, setWorkDate] = useState(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', ''));
    const [photos, setPhotos] = useState([]);

    // Conflict Dialog
    const [conflictOpen, setConflictOpen] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState(null);

    // Approval States
    const [approvalDocs, setApprovalDocs] = useState([]);
    const [viewMode, setViewMode] = useState('ALL'); // Filters: ALL, MY_DRAFTS, MY_APPROVALS
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedDocType, setSelectedDocType] = useState('LEAVE_REQUEST');
    const [docFormData, setDocFormData] = useState({});
    const [selectedDoc, setSelectedDoc] = useState(null);

    // Attendance Tab State
    const [attendYear, setAttendYear] = useState(now.getFullYear());
    const [attendUserId, setAttendUserId] = useState(null);
    const [attendanceSummary, setAttendanceSummary] = useState(null);
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [workEndTime, setWorkEndTime] = useState('17:30'); // 회사 퇴근 시간
    const [attendanceError, setAttendanceError] = useState(null);

    // Derived selections
    const selectedPlan = useMemo(() =>
        selectedPlanId ? allPlans.find(p => String(p.id) === selectedPlanId) : null
        , [selectedPlanId, allPlans]);

    const selectedItem = useMemo(() => {
        if (!selectedPlan || !selectedItemId) return null;
        return selectedPlan.items.find(i => String(i.id) === selectedItemId);
    }, [selectedPlan, selectedItemId]);

    const setSelectedPlan = (plan) => {
        const params = new URLSearchParams(searchParams);
        if (plan) {
            params.set('tab', '0');
            params.set('planId', plan.id);
        } else {
            params.delete('planId');
            params.delete('itemId');
        }
        setSearchParams(params);
    };

    const setSelectedItem = (item) => {
        const params = new URLSearchParams(searchParams);
        if (item) {
            params.set('tab', '0');
            params.set('planId', selectedPlanId);
            params.set('itemId', item.id);
        } else {
            params.delete('itemId');
        }
        setSearchParams(params);
    };

    const handleLogout = () => {
        if (window.confirm("로그아웃 하시겠습니까?")) {
            logout();
            navigate('/login');
        }
    };

    // 모든 문서 유형 (목록 표시용)
    const DOC_TYPES = {
        LEAVE_REQUEST: { label: '휴가원', color: '#3b82f6' },
        EARLY_LEAVE: { label: '조퇴/외출원', color: '#a855f7' },
        CONSUMABLES_PURCHASE: { label: '소모품 신청서', color: '#10b981' },
        OVERTIME: { label: '야근/특근신청서', color: '#f97316' },
        INTERNAL_DRAFT: { label: '내부기안', color: '#3b82f6' },
        EXPENSE_REPORT: { label: '지출결의서', color: '#6366f1' },
        PURCHASE_ORDER: { label: '구매발주서', color: '#f59e0b' }
    };
    // 모바일에서 생성 가능한 문서 유형 (내부기안/지출결의서/구매발주서 제외)
    const CREATE_DOC_TYPES = {
        LEAVE_REQUEST: { label: '휴가원', color: '#3b82f6' },
        EARLY_LEAVE: { label: '조퇴/외출원', color: '#a855f7' },
        CONSUMABLES_PURCHASE: { label: '소모품 신청서', color: '#10b981' },
        OVERTIME: { label: '야근/특근신청서', color: '#f97316' }
    };

    const STATUS_MAP = {
        PENDING: { label: '기안대기', color: '#6b7280' },
        IN_PROGRESS: { label: '결재진행', color: '#3b82f6' },
        COMPLETED: { label: '결재완료', color: '#10b981' },
        REJECTED: { label: '반려', color: '#ef4444' }
    };

    // Swipe State
    const [touchStart, setTouchStart] = useState(0);

    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = (e) => {
        if (!touchStart) return;
        const touchEnd = e.changedTouches[0].clientX;
        const distance = touchStart - touchEnd;

        // Disable swipe when in sub-pages (Plan/Item details)
        if (selectedPlan || selectedItem) return;

        if (distance > 70) {
            // Swipe Left -> Move Next
            if (tab < 3) setTab(tab + 1);
        } else if (distance < -70) {
            // Swipe Right -> Move Prev
            if (tab > 0) setTab(tab - 1);
        }
        setTouchStart(0);
    };

    // Attendance fetch
    const fetchAttendanceSummary = useCallback(async () => {
        if (!user || tab !== 3) return;
        setAttendanceSummary(null);
        setAttendanceError(null);
        setAttendanceLoading(true);
        try {
            const targetId = attendUserId || user.id;
            const params = new URLSearchParams({ year: attendYear, user_id: targetId });
            const res = await api.get(`/hr/attendance/summary?${params.toString()}`);
            setAttendanceSummary(res.data);
        } catch (err) {
            setAttendanceError(err?.response?.data?.detail || '데이터 로드 실패');
        } finally {
            setAttendanceLoading(false);
        }
    }, [user, tab, attendYear, attendUserId]);

    // 회사 퇴근 시간 로드
    useEffect(() => {
        api.get('/basics/company').then(res => {
            const wet = res.data?.work_end_time;
            if (wet) setWorkEndTime(wet.substring(0, 5)); // 'HH:MM:SS' → 'HH:MM'
        }).catch(() => {});
    }, []);

    // 사업부 그룹 로드 및 나이프 자동 선택
    useEffect(() => {
        api.get('/product/groups/').then(res => {
            const groups = res.data || [];
            setAllProductGroups(groups);
            if (selectedGroupId === null) {
                const majors = groups.filter(g => g.type === 'MAJOR');
                const knife = majors.find(g => g.name.includes('나이프'));
                setSelectedGroupId(knife ? knife.id : '');
            }
        }).catch(() => {});
    }, []);

    // System Back Button / URL Sync Effect
    useEffect(() => {
        // Handle Create Modal
        if (createDocInUrl) {
            setShowCreateModal(true);
        } else {
            setShowCreateModal(false);
        }

        // Handle Detail Modal
        if (selectedDocIdInUrl) {
            const doc = approvalDocs.find(d => String(d.id) === selectedDocIdInUrl);
            if (doc) {
                setSelectedDoc(doc);
                setShowDetailModal(true);
            } else if (approvalDocs.length > 0) {
                // If not found, close it (prevents stale state)
                const params = new URLSearchParams(searchParams);
                params.delete('docId');
                setSearchParams(params);
            }
        } else {
            setShowDetailModal(false);
        }
    }, [createDocInUrl, selectedDocIdInUrl, approvalDocs, searchParams, setSearchParams]);

    const handleNewDraft = () => {
        const params = new URLSearchParams(searchParams);
        params.set('create', 'true');
        setSearchParams(params);
    };

    const handleDocClick = (doc) => {
        const params = new URLSearchParams(searchParams);
        params.set('docId', doc.id);
        setSearchParams(params);
    };

    const closeModals = () => {
        const params = new URLSearchParams(searchParams);
        params.delete('docId');
        params.delete('create');
        setSearchParams(params);
    };

    useEffect(() => {
        if (!user) return;
        if (tab === 0) fetchAllPlans();
        if (tab === 1) {
            fetchPerformance();
            if (user.user_type === 'ADMIN') fetchStaffList();
        }
        if (tab === 2) fetchApprovalDocs();
        if (tab === 3) {
            if (user.user_type === 'ADMIN') fetchStaffList();
            fetchAttendanceSummary();
        }
    }, [tab, perfYear, perfMonth, user, selectedWorker, viewMode]);

    useEffect(() => {
        fetchAttendanceSummary();
    }, [fetchAttendanceSummary]);

    const fetchApprovalDocs = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/approval/documents?view_mode=${viewMode}`);
            setApprovalDocs(res.data);
        } catch (err) {
            console.error('Approval fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // SSE: 결재 이벤트 수신 시 결재 탭이 활성화된 경우 자동 갱신
    useSSE((eventName) => {
        if (eventName === 'approval_updated') {
            if (tab === 2) fetchApprovalDocs();
        }
    });

    const fetchAllPlans = async () => {
        setLoading(true);
        try {
            const res = await api.get('/production/plans');
            setAllPlans(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStaffList = async () => {
        try {
            const res = await api.get('/basics/staff/');
            setStaffList(res.data);
        } catch (err) {
            console.error('Staff fetch error:', err);
        }
    };

    const fetchPerformance = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const startDate = `${perfYear}-${String(perfMonth).padStart(2, '0')}-01`;
            const lastDay = new Date(perfYear, perfMonth, 0).getDate();
            const endDate = `${perfYear}-${String(perfMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            const params = { start_date: startDate, end_date: endDate };
            // Admin can filter by worker, or see all if empty
            if (user.user_type === 'ADMIN') {
                if (selectedWorker !== 'ALL') params.worker_id = selectedWorker;
            } else {
                params.worker_id = user.id;
            }

            console.log('Fetching performance with params:', params);
            const res = await api.get('/production/performance/details', { params });
            console.log('Performance data count:', res.data.length);
            setMyPerformance(res.data);
        } catch (err) {
            console.error('Performance fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handlePhotoCapture = (e) => {
        const files = Array.from(e.target.files);
        if (photos.length + files.length > 5) {
            alert("사진은 최대 5장까지 가능합니다.");
            return;
        }
        setPhotos([...photos, ...files]);
    };

    const handleSaveLog = async (mode = "CREATE") => {
        if (selectedItems.length === 0) {
            alert("공정을 선택해주세요.");
            return;
        }

        // [USER REQUEST] 수량 초과 검증 로직 추가
        let hasExceeded = false;
        for (const item of selectedItems) {
            const totalPlanned = item.quantity || 0;
            const currentPerformance = item.completed_quantity || 0;
            const enteringQty = parseInt(itemRecords[item.id]?.good || 0);

            if (currentPerformance + enteringQty > totalPlanned) {
                hasExceeded = true;
                break;
            }
        }

        if (hasExceeded) {
            if (!window.confirm("일부 공정의 입력한 수량이 계획된 수량을 초과합니다. 계속하시겠습니까?")) {
                return;
            }
        }

        setLoading(true);
        try {
            const uploadedPhotos = [];
            for (const file of photos) {
                const formData = new FormData();
                formData.append('file', file);

                // Remove explicit Content-Type to let browser handle boundary
                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                uploadedPhotos.push({
                    name: uploadRes.data.filename,
                    url: uploadRes.data.url
                });
            }

            const payload = {
                work_date: workDate,
                worker_id: user.id,
                note: note,
                attachment_file: uploadedPhotos,
                mode: mode,
                items: selectedItems.map(item => ({
                    plan_item_id: item.id,
                    worker_id: user.id,
                    good_quantity: parseInt(itemRecords[item.id]?.good || 0),
                    bad_quantity: parseInt(itemRecords[item.id]?.bad || 0),
                    note: note
                }))
            };

            await api.post('/production/work-logs', payload);

            alert("저장되었습니다.");
            setSelectedItems([]);
            setItemRecords({});
            setShowForm(false);
            setBulkGoodQty('');
            setBulkBadQty('0');
            setSelectedPlan(null);
            setNote('');
            setPhotos([]);
            setWorkDate(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', ''));
            setTab(0);
            setConflictOpen(false);
            fetchAllPlans();
        } catch (err) {
            if (err.response?.status === 409) {
                setConflictOpen(true);
            } else {
                console.error(err);
                alert("저장 실패: " + (err.response?.data?.detail || err.message));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCreateApproval = async () => {
        // [MODIFIED] 상세 타입별 필수 항목 검증 보강
        const errs = [];
        if (selectedDocType === 'EARLY_LEAVE') {
            if (!docFormData.date) errs.push("일자");
            if (!docFormData.leave_time) errs.push("나가는 시간");
            if (!docFormData.leave_reason) errs.push("조퇴 사유");
        } else if (selectedDocType === 'LEAVE_REQUEST') {
            if (!docFormData.start_date) errs.push("시작일");
            if (!docFormData.end_date) errs.push("종료일");
            if (!docFormData.vacation_reason) errs.push("휴가 사유");
        } else if (selectedDocType === 'OVERTIME') {
            if (!docFormData.date) errs.push("근무일");
            if (!docFormData.start_time) errs.push("시작시간");
            if (!docFormData.end_time) errs.push("종료시간");
            if (!docFormData.reason) errs.push("업무 내용");
        } else if (selectedDocType === 'CONSUMABLES_PURCHASE') {
            const items = Array.isArray(docFormData.items) ? docFormData.items : [];
            if (items.length === 0 || !items[0].product_name) errs.push("품목 내역");
        } else {
            // 기타 일반 문서
            if (!docFormData.reason && !docFormData.items && !docFormData.content) errs.push("내용");
        }

        if (errs.length > 0) {
            alert(`다음 필수 항목을 입력해주세요: ${errs.join(', ')}`);
            return;
        }

        setLoading(true);
        try {
            // [NEW] Calculate leave_days/hours for attendance docs before submission
            let finalDocFormData = { ...docFormData };
            if (selectedDocType === 'LEAVE_REQUEST') {
                const sDate = finalDocFormData.start_date;
                const eDate = finalDocFormData.end_date || sDate;
                const vType = finalDocFormData.vacation_type || '연차';
                
                if (vType.includes('반차')) {
                    finalDocFormData.leave_days = 0.5;
                } else if (sDate && eDate) {
                    const start = new Date(sDate);
                    const end = new Date(eDate);
                    if (end >= start) {
                        finalDocFormData.leave_days = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
                    }
                }
            } else if (selectedDocType === 'EARLY_LEAVE') {
                const startTime = finalDocFormData.leave_time;
                const endTime = finalDocFormData.return_time;
                const type = finalDocFormData.leave_type || '조퇴';
                
                if (startTime) {
                    const start = new Date(`2000-01-01T${startTime}`);
                    let calcHours = 0;
                    if (type === '외출' && endTime) {
                        const end = new Date(`2000-01-01T${endTime}`);
                        let diff = (end - start) / (1000 * 60 * 60);
                        if (diff < 0) diff += 24;
                        calcHours = parseFloat(diff.toFixed(1));
                    } else if (type === '조퇴') {
                        const workEnd = new Date(`2000-01-01T${workEndTime}`);
                        let diff = (workEnd - start) / (1000 * 60 * 60);
                        calcHours = parseFloat(Math.max(0, diff).toFixed(1));
                    }
                    finalDocFormData.hours = calcHours;
                }
            } else if (selectedDocType === 'OVERTIME') {
                const startTime = finalDocFormData.start_time;
                const endTime = finalDocFormData.end_time;
                if (startTime && endTime) {
                    const start = new Date(`2000-01-01T${startTime}`);
                    const end = new Date(`2000-01-01T${endTime}`);
                    let diff = (end - start) / (1000 * 60 * 60);
                    if (diff < 0) diff += 24;
                    finalDocFormData.hours = parseFloat(diff.toFixed(1));
                }
            }

            const authorName = (editingDocId && originalAuthor?.name) ? originalAuthor.name : user.name;
            const label = DOC_TYPES[selectedDocType]?.label || '문서';
            const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/ /g, '').replace(/\.$/, '');
            const fmtDate = (d) => d ? d.replace(/-/g, '.') : '';

            let docTitle;
            if (selectedDocType === 'LEAVE_REQUEST') {
                const start = fmtDate(finalDocFormData.start_date);
                const end = fmtDate(finalDocFormData.end_date);
                const period = (start && end && start !== end) ? `${start}~${end}` : (start || todayStr);
                docTitle = `[휴가원] ${authorName} - ${period}`;
            } else if (selectedDocType === 'EARLY_LEAVE') {
                const targetDate = fmtDate(finalDocFormData.date) || todayStr;
                const leaveType = finalDocFormData.leave_type || '';
                docTitle = `[조퇴/외출원] ${authorName}${leaveType ? `(${leaveType})` : ''} - ${targetDate}`;
            } else if (selectedDocType === 'OVERTIME') {
                const targetDate = fmtDate(finalDocFormData.date) || todayStr;
                docTitle = `[야근/특근신청서] ${authorName} - ${targetDate}`;
            } else if (selectedDocType === 'CONSUMABLES_PURCHASE') {
                const items = Array.isArray(finalDocFormData.items) ? finalDocFormData.items : [];
                const firstName = items[0]?.product_name || '';
                const extra = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
                const itemPart = firstName ? `${firstName}${extra}` : '';
                docTitle = itemPart
                    ? `[소모품 구매신청서] ${authorName} - ${itemPart}`
                    : `[소모품 구매신청서] ${authorName} - ${todayStr}`;
            } else {
                docTitle = `[${label}] ${authorName} - ${todayStr}`;
            }

            const payload = {
                title: docTitle,
                doc_type: selectedDocType,
                // [FIX] Ensure content is a valid dictionary (Object) for Pydantic
                content: typeof finalDocFormData === 'string' ? safeParseJSON(finalDocFormData, {}) : (finalDocFormData || {}),
                // [FIX] Ensure attachment_file is a valid list of dicts for Pydantic
                attachment_file: [] 
            };
            if (editingDocId) {
                await api.put(`/approval/documents/${editingDocId}`, payload);
                alert("수정이 완료되었습니다.");
            } else {
                await api.post('/approval/documents', payload);
                alert("기안이 완료되었습니다.");
            }
            setShowCreateModal(false);
            setEditingDocId(null);
            fetchApprovalDocs();
        } catch (err) {
            console.error('Approval creation error:', err);
            alert("처리 실패: " + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const isEditable = (doc) => {
        if (!doc) return false;
        // ADMIN can edit anything
        if (user?.user_type === 'ADMIN') return true;

        if (Number(doc.author_id) !== Number(user?.id)) return false;
        if (doc.status === 'PENDING' || doc.status === 'REJECTED') return true;
        if (doc.status === 'IN_PROGRESS') {
            return (doc.steps || []).every(s => s.status !== 'APPROVED' || s.comment === "기안자 직급에 따른 자동 승인");
        }
        return false;
    };

    const handleEditApproval = (doc) => {
        setSelectedDocType(doc.doc_type);
        setDocFormData(doc.content);
        setEditingDocId(doc.id);
        setOriginalAuthor(doc.author || null); // 원본 기안자 정보 보존
        setShowDetailModal(false);
        setShowCreateModal(true);
    };

    const handleDeleteApproval = async (docId) => {
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        setLoading(true);
        try {
            await api.delete(`/approval/documents/${docId}`);
            alert("삭제되었습니다.");
            setShowDetailModal(false);
            fetchApprovalDocs();
        } catch (err) {
            console.error('Delete error:', err);
            alert("삭제 실패: " + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleProcessApproval = async (status) => {
        if (status === 'REJECTED' && !comment) {
            alert("반려 사유를 입력해주세요.");
            return;
        }

        setLoading(true);
        try {
            await api.post(`/approval/documents/${selectedDoc.id}/process`, {
                status,
                comment
            });
            alert(status === 'APPROVED' ? "승인되었습니다." : "반려되었습니다.");
            setShowDetailModal(false);
            setComment('');
            fetchApprovalDocs();
        } catch (err) {
            console.error('Approval process error:', err);
            alert("처리 실패: " + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const majorGroups = allProductGroups.filter(g => g.type === 'MAJOR');

    const planMatchesGroup = (plan) => {
        if (!selectedGroupId) return true;
        const items = plan.items || [];
        return items.some(item => {
            const gid = item.product?.group_id;
            if (!gid) return false;
            const grp = allProductGroups.find(g => g.id === gid);
            if (!grp) return false;
            return grp.id === selectedGroupId || grp.parent_id === selectedGroupId;
        });
    };

    const filteredPlans = allPlans.filter(p => {
        if (p.status === 'CANCELED') return false;

        const orderStatus = p.order?.status;
        const isDelivered = orderStatus === 'DELIVERY_COMPLETED' || orderStatus === 'DELIVERED';
        const isProdCompleted = p.status === 'COMPLETED';

        if (statusFilter === 'IN_PROGRESS') {
            // plan.status가 COMPLETED이거나 수주가 납품완료이면 생산중 탭에서 제외
            if (isProdCompleted || isDelivered) return false;
        } else if (statusFilter === 'COMPLETED') {
            if (!isProdCompleted || isDelivered) return false;
        } else if (statusFilter === 'DELIVERED') {
            if (!isDelivered) return false;
        }
        // 'ALL': CANCELED만 제외

        if (!planMatchesGroup(p)) return false;

        const orderNo = p.order?.order_no || p.stock_production?.production_no || '';
        const productNameStr = getProductNameStr(p);
        const partnerName = p.order?.partner?.name || p.stock_production?.partner?.name || '';
        const specStr = p.items?.map(it => it.product?.specification || '').join(' ');
        const q = searchQuery.toLowerCase();
        return orderNo.toLowerCase().includes(q) ||
            productNameStr.toLowerCase().includes(q) ||
            partnerName.toLowerCase().includes(q) ||
            specStr.toLowerCase().includes(q);
    });

    // Performance Aggregation with fallback price
    const calculateItemCost = (item) => {
        let price = item.unit_price || 0;
        if (price === 0 && item.plan_item) {
            const planItem = item.plan_item;
            if (planItem.quantity > 0) {
                price = (planItem.cost || 0) / planItem.quantity;
            }
        }
        return (item.good_quantity || 0) * price;
    };

    const totalCost = useMemo(() => {
        return myPerformance.reduce((sum, item) => sum + calculateItemCost(item), 0);
    }, [myPerformance]);

    // Grouping performance by worker for admin summary
    const workerAggregates = useMemo(() => {
        const groups = {};
        myPerformance.forEach(item => {
            const workerId = item.worker?.id;
            if (!workerId) return;
            if (!groups[workerId]) {
                groups[workerId] = {
                    id: workerId,
                    name: item.worker?.name,
                    role: item.worker?.role,
                    totalCost: 0,
                    count: 0
                };
            }
            groups[workerId].totalCost += calculateItemCost(item);
            groups[workerId].count += 1;
        });
        return Object.values(groups).sort((a, b) => b.totalCost - a.totalCost);
    }, [myPerformance]);

    // Grouping performance by work_log_id for drill-down
    const groupedPerformance = useMemo(() => {
        const groups = {};
        myPerformance.forEach(item => {
            const logId = item.work_log_id;
            if (!groups[logId]) {
                groups[logId] = {
                    id: logId,
                    date: item.work_log?.work_date,
                    workerName: item.worker?.name,
                    totalCost: 0,
                    items: []
                };
            }
            groups[logId].totalCost += calculateItemCost(item);
            groups[logId].items.push(item);
        });
        return Object.values(groups).sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return b.date.localeCompare(a.date);
        });
    }, [myPerformance]);

    return (
        <Box sx={{
            backgroundColor: '#f8f9fa',
        }}>
            {/* Header was removed (now handled by MobileLayout) */}

            {/* Swipe Area */}
            <Box
                sx={{
                    flex: 1,
                    position: 'relative',
                    overflowX: 'hidden' // Only hidden on X to allow swipes
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={(e) => { /* allow scroll within tab */ }}
            >
                <Box sx={{
                    display: 'flex',
                    width: '400%',
                    transform: `translateX(-${tab * 25}%)`,
                    transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    {/* Tab 1: Production Status */}
                    <Box sx={{ width: '25%', p: 2 }}>
                        {!selectedPlan && !selectedItem ? (
                            /* Step 1: Browse Production Plans */
                            <Box>
                                {/* 사업부 필터 */}
                                <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                                    <Select
                                        value={selectedGroupId === null ? '' : (selectedGroupId || '')}
                                        onChange={e => setSelectedGroupId(e.target.value === '' ? '' : Number(e.target.value))}
                                        displayEmpty
                                        sx={{ backgroundColor: '#fff', fontSize: '13px' }}
                                    >
                                        <MenuItem value="">전체 사업부</MenuItem>
                                        {majorGroups.map(g => (
                                            <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                {/* 상태 필터 칩 */}
                                <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
                                    {[
                                        { key: 'ALL', label: '전체' },
                                        { key: 'IN_PROGRESS', label: '생산중' },
                                        { key: 'COMPLETED', label: '생산완료' },
                                        { key: 'DELIVERED', label: '납품완료' },
                                    ].map(({ key, label }) => (
                                        <Chip
                                            key={key}
                                            label={label}
                                            size="small"
                                            onClick={() => setStatusFilter(key)}
                                            color={statusFilter === key ? 'primary' : 'default'}
                                            variant={statusFilter === key ? 'filled' : 'outlined'}
                                            sx={{ fontSize: '11px', fontWeight: statusFilter === key ? 'bold' : 'normal', cursor: 'pointer' }}
                                        />
                                    ))}
                                </Box>

                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="수주번호, 고객사명, 제품명, 규격 검색"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    sx={{ mb: 2, backgroundColor: '#fff' }}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon fontSize="small" color="action" />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                {loading && allPlans.length === 0 ? (
                                    <Box sx={{ textAlign: 'center', mt: 4 }}><CircularProgress size={24} /></Box>
                                ) : (
                                    <Stack spacing={0.8}>
                                        {filteredPlans.map(plan => {
                                            const orderNo = plan.order?.order_no || plan.stock_production?.production_no || '-';
                                            
                                            const productNameStr = getProductNameStr(plan);

                                            return (
                                                <Card key={plan.id} sx={{ borderRadius: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }} onClick={() => setSelectedPlan(plan)}>
                                                    <CardContent sx={{ p: '10px !important' }}>
                                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                            <Box sx={{ flex: 1 }}>
                                                                {/* 수주번호 + 배지 */}
                                                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.3 }}>
                                                                    {plan.status === 'COMPLETED' ? (
                                                                        <Chip label="생산완료" size="small" sx={{ height: 18, fontSize: '10px', bgcolor: '#64748b', color: '#fff', fontWeight: 'bold' }} />
                                                                    ) : plan.order?.order_no ? (
                                                                        <Chip label="수주" size="small" sx={{ height: 18, fontSize: '10px', bgcolor: '#3b82f6', color: '#fff', fontWeight: 'bold' }} />
                                                                    ) : (
                                                                        <Chip label="재고" size="small" sx={{ height: 18, fontSize: '10px', bgcolor: '#10b981', color: '#fff', fontWeight: 'bold' }} />
                                                                    )}
                                                                    {/* 수주번호: 기존 제품명 크기(1rem) */}
                                                                    <Typography color="primary" fontWeight="bold" sx={{ fontSize: '1rem', lineHeight: 1.2 }}>
                                                                        {orderNo}
                                                                    </Typography>
                                                                </Stack>
                                                                {/* 제품명: 크기 업 */}
                                                                <Typography fontWeight="bold" sx={{ fontSize: '1.15rem', lineHeight: 1.25, mb: 0.2 }}>
                                                                    {productNameStr}
                                                                </Typography>
                                                                {/* 규격: 제품명과 동일 크기 */}
                                                                {plan.items?.[0]?.product?.specification && (
                                                                    <Typography color="textSecondary" sx={{ display: 'block', fontSize: '1.15rem', lineHeight: 1.25, mb: 0.2 }}>
                                                                        규격: {plan.items[0].product.specification}
                                                                    </Typography>
                                                                )}
                                                                {/* 비고 */}
                                                                {(plan.order?.note || plan.stock_production?.note) && (
                                                                    <Typography sx={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.3, mb: 0.2, color: '#d97706', fontWeight: 'bold' }}>
                                                                        비고: {plan.order?.note || plan.stock_production?.note}
                                                                    </Typography>
                                                                )}
                                                                {/* 고객사: 제품명과 동일 크기 */}
                                                                <Box sx={{ mt: 0.3, display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                                                                    <Typography color="textSecondary" sx={{ fontWeight: 'bold', fontSize: '1.15rem', lineHeight: 1.25 }}>
                                                                        고객사: {plan.order?.partner?.name || plan.stock_production?.partner?.name || '-'}
                                                                    </Typography>
                                                                    {/* 수주일·납기: 기존 제품명 크기(1rem) */}
                                                                    {plan.order?.order_date && (
                                                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                                                            <Typography color="textSecondary" sx={{ fontSize: '1rem', lineHeight: 1.3 }}>
                                                                                수주일: {plan.order.order_date}
                                                                            </Typography>
                                                                            <Typography color="primary" sx={{ fontWeight: 'bold', fontSize: '1rem', lineHeight: 1.3 }}>
                                                                                납기: {plan.order.delivery_date || '-'}
                                                                            </Typography>
                                                                        </Box>
                                                                    )}
                                                                </Box>
                                                                {/* 공정수: 기존 caption 크기 유지 */}
                                                                <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                                                                    {plan.items?.length || 0}개 공정
                                                                </Typography>
                                                            </Box>
                                                            <ChevronRightIcon color="action" />
                                                        </Stack>
                                                    </CardContent>
                                                </Card>

                                            );
                                        })}
                                    </Stack>
                                )}
                            </Box>
                        ) : selectedPlan && !showForm ? (
                            /* Step 2: Select Process from Plan */
                            <Box sx={{ pb: 8 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, px: 1 }}>
                                    <Typography variant="subtitle2" sx={{ color: 'textSecondary' }}>
                                        {selectedPlan.order?.order_no || selectedPlan.stock_production?.production_no} 상세 공정
                                    </Typography>
                                    <Button 
                                        size="small" 
                                        onClick={() => {
                                            const allValidItems = selectedPlan.items?.filter(it =>
                                                it.status !== 'COMPLETED' || (it.completed_quantity || 0) < (it.quantity || 0)
                                            ) || [];
                                            if (selectedItems.length === allValidItems.length) {
                                                setSelectedItems([]);
                                            } else {
                                                setSelectedItems(allValidItems);
                                            }
                                        }}
                                    >
                                        {(() => {
                                            const validCount = selectedPlan.items?.filter(it => it.status !== 'COMPLETED' || (it.completed_quantity || 0) < (it.quantity || 0)).length || 0;
                                            return validCount > 0 && selectedItems.length === validCount ? '전체 해제' : '전체 선택';
                                        })()}
                                    </Button>
                                </Box>
                                {(() => {
                                    const grouped = (selectedPlan.items || []).reduce((acc, item, index) => {
                                        const pId = item.product_id || `unknown_${index}`;
                                        if (!acc[pId]) {
                                            acc[pId] = {
                                                product: item.product,
                                                product_name: item.product?.name || item.product_name || `품목(${item.product_id || '?'})`,
                                                items: []
                                            };
                                        }
                                        acc[pId].items.push(item);
                                        return acc;
                                    }, {});

                                    return Object.values(grouped).map((group, groupIdx) => (
                                        <Box key={`group-${groupIdx}`} sx={{ mb: 2 }}>
                                            <Typography variant="body2" fontWeight="bold" color="primary" sx={{ px: 1, mb: 1, display: 'flex', alignItems: 'center' }}>
                                                <div style={{ width: 4, height: 14, backgroundColor: '#1976d2', marginRight: 8, borderRadius: 2 }} />
                                                품명: {group.product_name} 
                                                {group.product?.specification ? ` (${group.product?.specification})` : ''}
                                            </Typography>
                                            <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                                <List disablePadding>
                                                    {group.items.sort((a,b) => a.sequence - b.sequence).map((item, idx, arr) => {
                                                        // 완료 상태여도 실적이 목표수량에 미달이면 활성화
                                                        const isCompleted = item.status === 'COMPLETED' && (item.completed_quantity || 0) >= (item.quantity || 0);
                                                        const isSelected = selectedItems.some(i => i.id === item.id);
                                                        return (
                                                            <React.Fragment key={item.id}>
                                                                <ListItemButton 
                                                                    disabled={isCompleted}
                                                                    onClick={() => {
                                                                        if (isSelected) {
                                                                            setSelectedItems(prev => prev.filter(i => i.id !== item.id));
                                                                        } else {
                                                                            setSelectedItems(prev => [...prev, item]);
                                                                        }
                                                                    }}
                                                                >
                                                                    <Checkbox 
                                                                        edge="start" 
                                                                        checked={isSelected} 
                                                                        disabled={isCompleted} 
                                                                        tabIndex={-1} 
                                                                        disableRipple 
                                                                        sx={{ p: 0.5, mr: 1 }}
                                                                    />
                                                                    <ListItemText
                                                                        primary={<>
                                                                            <Typography variant="caption" sx={{ color: '#666', mr: 1, fontSize: '0.7rem' }}>[{item.sequence}]</Typography>
                                                                            {item.process_name}
                                                                        </>}
                                                                        secondary={`실적: ${item.completed_quantity || 0} / ${item.quantity}`}
                                                                        primaryTypographyProps={{ fontWeight: 500 }}
                                                                    />
                                                                    <Chip
                                                                        size="small"
                                                                        label={item.status}
                                                                        color={isCompleted ? 'success' : 'default'}
                                                                        variant="outlined"
                                                                    />
                                                                </ListItemButton>
                                                                {idx < arr.length - 1 && <Divider />}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </List>
                                            </Paper>
                                        </Box>
                                    ));
                                })()}
                                
                                {/* Sticky Bottom Button */}
                                {selectedItems.length > 0 && (
                                    <Box sx={{ 
                                        position: 'sticky', 
                                        bottom: 0, 
                                        left: 0, 
                                        right: 0,
                                        p: 2, 
                                        bgcolor: 'background.paper', 
                                        borderTop: '1px solid #e0e0e0', 
                                        zIndex: 10,
                                        mt: 2
                                    }}>
                                        <Button 
                                            variant="contained" 
                                            fullWidth 
                                            size="large"
                                            onClick={() => {
                                                const initRecords = { ...itemRecords };
                                                selectedItems.forEach(item => {
                                                    if (!initRecords[item.id]) {
                                                        initRecords[item.id] = { good: bulkGoodQty || '', bad: bulkBadQty || '0' };
                                                    }
                                                });
                                                setItemRecords(initRecords);
                                                setShowForm(true);
                                            }}
                                            sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}
                                        >
                                            작업일지등록
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        ) : (
                            /* Step 3: Registration Form */
                            <Box component={Paper} sx={{ p: 3, borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <IconButton onClick={() => setShowForm(false)} sx={{ mr: 1, ml: -1.5 }}>
                                        <ArrowBackIcon />
                                    </IconButton>
                                    <Typography variant="subtitle1" fontWeight="bold">실적 등록 ({selectedItems.length}개 공정)</Typography>
                                </Box>

                                <Stack spacing={3}>
                                    {/* Bulk Apply Section */}
                                    <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                                        <Typography variant="subtitle2" color="primary" fontWeight="bold" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                                            <CheckCircleIcon sx={{ fontSize: 18, mr: 0.5 }} /> 일괄 적용 수량
                                        </Typography>
                                        <Stack direction="row" spacing={2}>
                                            <TextField
                                                label="양품 수량"
                                                type="number"
                                                value={bulkGoodQty}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setBulkGoodQty(val);
                                                    setItemRecords(prev => {
                                                        const next = { ...prev };
                                                        selectedItems.forEach(item => {
                                                            if (!next[item.id]) next[item.id] = { good: '', bad: '0' };
                                                            next[item.id].good = val;
                                                        });
                                                        return next;
                                                    });
                                                }}
                                                fullWidth
                                                variant="outlined"
                                                size="small"
                                            />
                                            <TextField
                                                label="불량 수량"
                                                type="number"
                                                value={bulkBadQty}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setBulkBadQty(val);
                                                    setItemRecords(prev => {
                                                        const next = { ...prev };
                                                        selectedItems.forEach(item => {
                                                            if (!next[item.id]) next[item.id] = { good: '', bad: '0' };
                                                            next[item.id].bad = val;
                                                        });
                                                        return next;
                                                    });
                                                }}
                                                fullWidth
                                                variant="outlined"
                                                size="small"
                                            />
                                        </Stack>
                                    </Box>

                                    {/* Individual Process List */}
                                    <Box>
                                        <Typography variant="caption" color="textSecondary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>선택된 공정 개별 수량</Typography>
                                        <Stack spacing={1.5}>
                                            {selectedItems.map(item => (
                                                <Paper key={item.id} sx={{ p: 1.5, borderRadius: 2, border: '1px solid #e0e0e0', backgroundColor: '#fafafa' }} elevation={0}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                        <Typography variant="body2" fontWeight="bold">
                                                            <span style={{ color: '#666', marginRight: 4 }}>[{item.sequence}]</span>
                                                            {item.process_name}
                                                        </Typography>
                                                        <Typography variant="caption" color="primary" fontWeight="bold">
                                                            잔여: {Math.max(0, (item.quantity || 0) - (item.completed_quantity || 0))}
                                                        </Typography>
                                                    </Box>
                                                    <Stack direction="row" spacing={1}>
                                                        <TextField
                                                            label="양품"
                                                            type="number"
                                                            value={itemRecords[item.id]?.good ?? ''}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setItemRecords(prev => ({
                                                                    ...prev,
                                                                    [item.id]: { ...prev[item.id], good: val }
                                                                }));
                                                            }}
                                                            fullWidth
                                                            variant="standard"
                                                            size="small"
                                                            InputProps={{ sx: { fontSize: '0.875rem' } }}
                                                        />
                                                        <TextField
                                                            label="불량"
                                                            type="number"
                                                            value={itemRecords[item.id]?.bad ?? ''}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setItemRecords(prev => ({
                                                                    ...prev,
                                                                    [item.id]: { ...prev[item.id], bad: val }
                                                                }));
                                                            }}
                                                            fullWidth
                                                            variant="standard"
                                                            size="small"
                                                            InputProps={{ sx: { fontSize: '0.875rem' } }}
                                                        />
                                                    </Stack>
                                                </Paper>
                                            ))}
                                        </Stack>
                                    </Box>

                                    <Divider />

                                    <TextField
                                        label="등록일"
                                        type="date"
                                        value={workDate}
                                        onChange={e => setWorkDate(e.target.value)}
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        InputLabelProps={{ shrink: true }}
                                    />
                                    <TextField
                                        label="작업 비고"
                                        multiline
                                        rows={2}
                                        value={note}
                                        onChange={e => setNote(e.target.value)}
                                        fullWidth
                                    />

                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom fontWeight="bold">현장 사진 ({photos.length}/5)</Typography>
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            {photos.map((p, idx) => (
                                                <Box key={idx} sx={{ position: 'relative', width: 64, height: 64 }}>
                                                    <img
                                                        src={URL.createObjectURL(p)}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                                                        alt="capture"
                                                    />
                                                    <IconButton
                                                        size="small"
                                                        sx={{ position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', boxShadow: 1 }}
                                                        onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                                                    >
                                                        <DeleteIcon fontSize="inherit" color="error" />
                                                    </IconButton>
                                                </Box>
                                            ))}
                                            {photos.length < 5 && (
                                                <Button
                                                    variant="outlined"
                                                    component="label"
                                                    sx={{ width: 64, height: 64, borderStyle: 'dashed', borderRadius: 2 }}
                                                >
                                                    <PhotoCameraIcon />
                                                    <input type="file" accept="image/*" capture="environment" hidden onChange={handlePhotoCapture} multiple />
                                                </Button>
                                            )}
                                        </Stack>
                                    </Box>

                                    <Button
                                        variant="contained"
                                        size="large"
                                        startIcon={<SaveIcon />}
                                        fullWidth
                                        onClick={() => handleSaveLog()}
                                        disabled={loading}
                                        sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}
                                    >
                                        {loading ? "처리 중..." : "실적 제출하기"}
                                    </Button>
                                </Stack>
                            </Box>
                        )}
                    </Box>

                    {/* Tab 2: Performance */}
                    <Box sx={{ width: '25%', p: 2 }}>
                        {/* Filters & Summary */}
                        <Paper sx={{ p: 2, mb: 2, borderRadius: 3, backgroundColor: '#1a237e', color: '#fff' }}>
                            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                                <FormControl size="small" fullWidth sx={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
                                    <Select
                                        value={perfYear}
                                        onChange={e => setPerfYear(e.target.value)}
                                        sx={{ color: '#fff', '& .MuiSelect-icon': { color: '#fff' } }}
                                    >
                                        {[2024, 2025, 2026].map(y => <MenuItem key={y} value={y}>{y}년</MenuItem>)}
                                    </Select>
                                </FormControl>
                                <FormControl size="small" fullWidth sx={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
                                    <Select
                                        value={perfMonth}
                                        onChange={e => setPerfMonth(e.target.value)}
                                        sx={{ color: '#fff', '& .MuiSelect-icon': { color: '#fff' } }}
                                    >
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <MenuItem key={m} value={m}>{m}월</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Stack>

                            {user.user_type === 'ADMIN' && (
                                <FormControl size="small" fullWidth sx={{ mb: 2, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
                                    <Select
                                        value={selectedWorker}
                                        onChange={e => setSelectedWorker(e.target.value)}
                                        displayEmpty
                                        sx={{ color: '#fff', '& .MuiSelect-icon': { color: '#fff' } }}
                                    >
                                        <MenuItem value="ALL">전체 작업자</MenuItem>
                                        {staffList.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )}

                            <Box sx={{ textAlign: 'center', py: 0.5 }}>
                                {user.user_type === 'ADMIN' && (
                                    <>
                                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                            {selectedWorker === 'ALL' ? '전체' : '선택'} 작업자 실적 합계
                                        </Typography>
                                        <Typography variant="h4" fontWeight="bold">
                                            {totalCost.toLocaleString()}원
                                        </Typography>
                                    </>
                                )}
                                {user.user_type !== 'ADMIN' && (
                                    <Typography variant="h6" fontWeight="bold" sx={{ py: 1 }}>
                                        작업 실적 현황
                                    </Typography>
                                )}
                            </Box>
                        </Paper>

                        {/* Performance List */}
                        {user.user_type === 'ADMIN' ? (
                            <Stack spacing={2}>
                                {workerAggregates.map(agg => (
                                    <Accordion
                                        key={agg.id}
                                        disableGutters
                                        elevation={0}
                                        sx={{
                                            '&:before': { display: 'none' },
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                    >
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#fff', minHeight: 64 }}>
                                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                                                <Avatar sx={{ bgcolor: '#3b82f6', width: 32, height: 32, fontSize: '0.8rem' }}>
                                                    {agg.name?.charAt(0)}
                                                </Avatar>
                                                <Box sx={{ flex: 1 }}>
                                                    <Typography variant="subtitle2" fontWeight="bold">
                                                        {agg.name} ({agg.role})
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        {agg.count}건
                                                    </Typography>
                                                </Box>
                                                {user.user_type === 'ADMIN' && (
                                                    <Typography variant="subtitle2" fontWeight="bold" color="primary" sx={{ mr: 1 }}>
                                                        {agg.totalCost.toLocaleString()}원
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </AccordionSummary>
                                        <AccordionDetails sx={{ p: 0, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                                            <Box sx={{ p: 1 }}>
                                                {groupedPerformance
                                                    .filter(group => group.items.some(item => item.worker_id === agg.id))
                                                    .map(group => (
                                                        <Box
                                                            key={group.id}
                                                            sx={{
                                                                p: 1.5,
                                                                mb: 1,
                                                                bgcolor: '#fff',
                                                                borderRadius: 1,
                                                                border: '1px solid #f1f5f9'
                                                            }}
                                                        >
                                                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                                                <Typography variant="caption" fontWeight="bold" sx={{ color: '#475569' }}>
                                                                    {group.date}
                                                                </Typography>
                                                                {user.user_type === 'ADMIN' && (
                                                                    <Typography variant="caption" color="primary" fontWeight="bold">
                                                                        {group.items.filter(i => i.worker_id === agg.id).reduce((sum, i) => sum + calculateItemCost(i), 0).toLocaleString()}원
                                                                    </Typography>
                                                                )}
                                                            </Stack>
                                                            <Stack spacing={0.8}>
                                                                {group.items
                                                                    .filter(item => item.worker_id === agg.id)
                                                                    .map((item, idx) => (
                                                                        <Box key={idx} sx={{ pl: 1, borderLeft: '2px solid #cbd5e1' }}>
                                                                            <Typography variant="caption" display="block" sx={{ fontSize: '0.75rem' }}>
                                                                                {item.plan_item?.process_name}
                                                                            </Typography>
                                                                            <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.7rem' }}>
                                                                                {item.plan_item?.product?.name}
                                                                                {item.plan_item?.product?.specification && ` (${item.plan_item.product.specification})`}
                                                                                • {item.good_quantity}개
                                                                            </Typography>
                                                                        </Box>
                                                                    ))}
                                                            </Stack>
                                                        </Box>
                                                    ))}
                                            </Box>
                                        </AccordionDetails>
                                    </Accordion>
                                ))}
                                {workerAggregates.length === 0 && (
                                    <Box sx={{ textAlign: 'center', mt: 4, color: 'textSecondary' }}>
                                        <BarChartIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
                                        <Typography variant="body2">기록된 실적이 없습니다.</Typography>
                                    </Box>
                                )}
                            </Stack>
                        ) : (
                            /* Detailed List View (Mine) */
                            <Box>
                                {loading && groupedPerformance.length === 0 ? (
                                    <Box sx={{ textAlign: 'center', mt: 4 }}><CircularProgress size={24} /></Box>
                                ) : (
                                    <Stack spacing={1.5}>
                                        {groupedPerformance.map(group => (
                                            <Card key={group.id} sx={{ borderRadius: 2 }}>
                                                <ListItemButton
                                                    onClick={() => setExpandedLogId(expandedLogId === group.id ? null : group.id)}
                                                    sx={{ p: 2, flexDirection: 'column', alignItems: 'flex-start' }}
                                                >
                                                    <Stack direction="row" justifyContent="space-between" width="100%" alignItems="center">
                                                        <Box>
                                                            <Typography variant="subtitle1" fontWeight="bold">
                                                                {group.date}
                                                            </Typography>
                                                            <Typography variant="caption" color="textSecondary">
                                                                {group.items.length}건의 작업
                                                            </Typography>
                                                        </Box>
                                                        <Stack direction="row" alignItems="center" spacing={1}>
                                                            {user.user_type === 'ADMIN' && (
                                                                <Typography variant="subtitle1" fontWeight="bold" color="primary">
                                                                    {group.totalCost.toLocaleString()}원
                                                                </Typography>
                                                            )}
                                                            <ExpandMoreIcon sx={{ transform: expandedLogId === group.id ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                                                        </Stack>
                                                    </Stack>

                                                    {expandedLogId === group.id && (
                                                        <Box sx={{ width: '100%', mt: 2, pt: 2, borderTop: '1px solid #eee' }}>
                                                            {group.items.map(item => (
                                                                <Box key={item.id} sx={{ mb: 2 }}>
                                                                    <Typography variant="body2" fontWeight="bold">{item.plan_item?.process_name}</Typography>
                                                                    <Typography variant="caption" display="block" color="textSecondary">
                                                                        {item.plan_item?.product?.name}
                                                                        {item.plan_item?.product?.specification && ` (${item.plan_item.product.specification})`}
                                                                    </Typography>
                                                                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                                                                        <Typography variant="caption">
                                                                            수량: {item.good_quantity} (불량: {item.bad_quantity})
                                                                        </Typography>
                                                                        {user.user_type === 'ADMIN' && (
                                                                            <Typography variant="caption" fontWeight="bold">
                                                                                {calculateItemCost(item).toLocaleString()}원
                                                                            </Typography>
                                                                        )}
                                                                    </Stack>
                                                                </Box>
                                                            ))}
                                                        </Box>
                                                    )}
                                                </ListItemButton>
                                            </Card>
                                        ))}
                                        {groupedPerformance.length === 0 && (
                                            <Typography sx={{ textAlign: 'center', mt: 4, color: 'textSecondary' }}>
                                                해당 기간의 실적 데이터가 없습니다.
                                            </Typography>
                                        )}
                                    </Stack>
                                )}
                            </Box>
                        )}
                    </Box>

                    {/* Tab 3: Approval */}
                    <Box sx={{ width: '25%', p: 2, bgcolor: '#f1f5f9' }}>
                        <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
                            {[
                                { id: 'ALL', label: '전체' },
                                { id: 'MY_WAITING', label: '기안대기' },
                                { id: 'MY_COMPLETED', label: '결재완료' },
                                { id: 'MY_REJECTED', label: '반려문서' },
                                { id: 'WAITING_FOR_ME', label: '나의결재대기', badge: waitingCount }
                            ].map(m => (
                                <Badge
                                    key={m.id}
                                    badgeContent={m.badge || 0}
                                    color="error"
                                    invisible={!m.badge || m.badge === 0}
                                    sx={{ '& .MuiBadge-badge': { fontSize: '9px', height: 16, minWidth: 16 } }}
                                >
                                    <Chip
                                        label={m.label}
                                        onClick={() => setViewMode(m.id)}
                                        color={viewMode === m.id ? "primary" : "default"}
                                        variant={viewMode === m.id ? "filled" : "outlined"}
                                        size="small"
                                        sx={{ flexShrink: 0 }}
                                    />
                                </Badge>
                            ))}
                        </Stack>

                        <Button
                            fullWidth
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => {
                                setSelectedDocType('LEAVE_REQUEST');
                                const today = new Date().toISOString().split('T')[0];
                                setDocFormData({
                                    date: today,
                                    request_date: today,
                                    draft_date: today,
                                    staff_no: user?.staff_no || '',
                                    dept: user?.department || '',
                                    role: user?.role || '',
                                });
                                setEditingDocId(null);
                                handleNewDraft();
                            }}
                            sx={{ mb: 2, borderRadius: 2, py: 1.5, fontWeight: 'bold' }}
                        >
                            신규 문서 기안
                        </Button>

                        {loading ? (
                            <Box sx={{ textAlign: 'center', mt: 4 }}><CircularProgress size={24} /></Box>
                        ) : (
                            <Stack spacing={1.5}>
                                {approvalDocs.map(doc => (
                                    <Card
                                        key={doc.id}
                                        sx={{
                                            borderRadius: 2,
                                            borderLeft: `4px solid ${STATUS_MAP[doc.status]?.color}`,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                        }}
                                        onClick={() => handleDocClick(doc)}
                                    >
                                        <CardContent sx={{ p: 2 }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                                <Box sx={{ flex: 1 }}>
                                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                                        <Typography variant="caption" sx={{ color: DOC_TYPES[doc.doc_type]?.color, fontWeight: 'bold' }}>
                                                            {DOC_TYPES[doc.doc_type]?.label}
                                                        </Typography>
                                                        <Typography variant="caption" color="textSecondary">•</Typography>
                                                        <Typography variant="caption" color="textSecondary">
                                                            {doc.created_at?.includes('T') ? doc.created_at.split('T')[0] : (doc.created_at || '')}
                                                        </Typography>
                                                    </Stack>
                                                    <Typography variant="body1" sx={{ mb: 0.5, fontWeight: 900, color: '#1a202c', lineHeight: 1.2 }}>
                                                        {doc.title}
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                                                        기안자: {doc.author?.name} ({doc.author?.role})
                                                    </Typography>
                                                </Box>
                                                <Chip
                                                    label={STATUS_MAP[doc.status]?.label}
                                                    size="small"
                                                    sx={{
                                                        height: 22,
                                                        fontSize: '10px',
                                                        fontWeight: 'bold',
                                                        backgroundColor: `${STATUS_MAP[doc.status]?.color}20`,
                                                        color: STATUS_MAP[doc.status]?.color,
                                                        border: `1px solid ${STATUS_MAP[doc.status]?.color}50`
                                                    }}
                                                />
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                ))}
                                {approvalDocs.length === 0 && (
                                    <Box sx={{ mt: 8, textAlign: 'center', color: 'textSecondary' }}>
                                        <DescriptionIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
                                        <Typography variant="body2">해당하는 문서가 없습니다.</Typography>
                                    </Box>
                                )}
                            </Stack>
                        )}
                    </Box>

                    {/* Tab 4: Attendance */}
                    <Box sx={{ width: '25%', p: 2 }}>
                        <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
                            <Stack direction="row" spacing={1} sx={{ mb: user?.user_type === 'ADMIN' ? 1.5 : 0 }}>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>연도</InputLabel>
                                    <Select value={attendYear} label="연도" onChange={e => setAttendYear(e.target.value)}>
                                        {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <MenuItem key={y} value={y}>{y}년</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Stack>
                            {user?.user_type === 'ADMIN' && (
                                <FormControl size="small" fullWidth sx={{ mt: 1.5 }}>
                                    <InputLabel>대상 사원</InputLabel>
                                    <Select value={attendUserId ?? user.id} label="대상 사원" onChange={e => setAttendUserId(e.target.value)}>
                                        {staffList.map(s => <MenuItem key={s.id} value={s.id}>{s.name} ({s.role})</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )}
                        </Paper>
                        {attendanceError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{attendanceError}</Alert>}
                        {attendanceLoading && <Box sx={{ textAlign: 'center', mt: 6 }}><CircularProgress size={28} /></Box>}
                        {!attendanceLoading && attendanceSummary && (
                            <Stack spacing={2}>
                                <Typography variant="caption" color="textSecondary" sx={{ px: 0.5 }}>
                                    {attendanceSummary.year}년 · <strong>{attendanceSummary.user_name}</strong> 근태 현황
                                </Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
                                    <Card sx={{ gridColumn: 'span 2', borderRadius: 3, bgcolor: '#ebfdf2', border: '1px solid #d1fae5', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1)' }}>
                                        <CardContent sx={{ p: 2, textAlign: 'center', '&:last-child': { pb: 2 } }}>
                                            <CheckCircleIcon sx={{ color: '#10b981', fontSize: 24, mb: 0.5 }} />
                                            <Typography variant="caption" color="#10b981" fontWeight="heavy" display="block" sx={{ fontSize: '10px' }}>잔여 연차</Typography>
                                            <Typography variant="h5" fontWeight="900" color="#065f46" sx={{ letterSpacing: -1 }}>{attendanceSummary.remaining_annual_days}일</Typography>
                                        </CardContent>
                                    </Card>
                                    <Card sx={{ gridColumn: 'span 2', borderRadius: 3, bgcolor: '#f0f9ff', border: '1px solid #e0f2fe', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.1)' }}>
                                        <CardContent sx={{ p: 2, textAlign: 'center', '&:last-child': { pb: 2 } }}>
                                            <AssignmentIndIcon sx={{ color: '#0ea5e9', fontSize: 24, mb: 0.5 }} />
                                            <Typography variant="caption" color="#0ea5e9" fontWeight="heavy" display="block" sx={{ fontSize: '10px' }}>총 연차</Typography>
                                            <Typography variant="h5" fontWeight="900" color="#075985" sx={{ letterSpacing: -1 }}>{attendanceSummary.total_annual_days}일</Typography>
                                        </CardContent>
                                    </Card>
                                    <Card sx={{ gridColumn: 'span 2', borderRadius: 3, bgcolor: '#fff1f2', border: '1px solid #ffe4e6', boxShadow: 'none' }}>
                                        <CardContent sx={{ p: 1.5, textAlign: 'center', '&:last-child': { pb: 1.5 } }}>
                                            <Typography variant="caption" color="#e11d48" fontWeight="bold" display="block" sx={{ fontSize: '9px' }}>사용 연차</Typography>
                                            <Typography variant="subtitle1" fontWeight="bold" color="#9f1239">{attendanceSummary.total_vacation_days}일</Typography>
                                        </CardContent>
                                    </Card>
                                    <Card sx={{ gridColumn: 'span 2', borderRadius: 3, bgcolor: '#f8fafc', border: '1px solid #f1f5f9', boxShadow: 'none' }}>
                                        <CardContent sx={{ p: 1.5, textAlign: 'center', '&:last-child': { pb: 1.5 } }}>
                                            <Typography variant="caption" color="#64748b" fontWeight="bold" display="block" sx={{ fontSize: '9px' }}>외출/조퇴</Typography>
                                            <Typography variant="subtitle1" fontWeight="bold" color="#334155">{attendanceSummary.total_leave_outing_hours}h</Typography>
                                        </CardContent>
                                    </Card>
                                </Box>

                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, px: 0.5, color: '#374151' }}>
                                        결재 완료 내역 ({attendanceSummary.documents.length}건)
                                    </Typography>
                                    <Paper sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                                        <List disablePadding>
                                            {attendanceSummary.documents.length > 0 ? attendanceSummary.documents.map((doc, idx) => {
                                                const meta = ATTENDANCE_DOC_META[doc.doc_type] || { label: doc.doc_type, color: '#6b7280', Icon: EventNoteIcon };
                                                const { Icon } = meta;
                                                return (
                                                    <React.Fragment key={doc.id}>
                                                        <ListItem sx={{ py: 1.5 }}>
                                                            <Box sx={{ mr: 1.5, p: 1, borderRadius: 2, bgcolor: `${meta.color}18`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <Icon fontSize="small" />
                                                            </Box>
                                                            <ListItemText
                                                                primary={
                                                                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                                                        <Typography variant="body2" fontWeight="bold" color="#111">{doc.date || '-'}</Typography>
                                                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                                                            <Chip label={meta.label} size="small" sx={{ height: 18, fontSize: '10px', bgcolor: meta.color, color: '#fff', fontWeight: 'bold' }} />
                                                                            <Chip label={`${doc.applied_value}${doc.applied_unit}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '10px', borderColor: meta.color, color: meta.color }} />
                                                                        </Stack>
                                                                    </Stack>
                                                                }
                                                                secondary={<Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.3 }}>{doc.title}</Typography>}
                                                            />
                                                            <Chip label="완료" size="small" color="success" variant="outlined" sx={{ fontSize: '10px', flexShrink: 0, ml: 0.5 }} />
                                                        </ListItem>
                                                        {idx < attendanceSummary.documents.length - 1 && <Divider sx={{ mx: 2 }} />}
                                                    </React.Fragment>
                                                );
                                            }) : (
                                                <Box sx={{ p: 4, textAlign: 'center' }}>
                                                    <Typography variant="body2" color="textSecondary">{attendanceSummary.year}년 결재 완료된 근태 내역이 없습니다.</Typography>
                                                </Box>
                                            )}
                                        </List>
                                    </Paper>
                                </Box>
                            </Stack>
                        )}
                    </Box>
                </Box>
            </Box >

            {/* Bottom Nav was removed (now handled by MobileLayout) */}

            {/* Conflict Dialog */}
            < Dialog open={conflictOpen} onClose={() => setConflictOpen(false)}>
                <DialogTitle>일지 중복 감지</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        해당 날짜에 이미 등록된 작업일지가 있습니다.<br /><br />
                        <b>[합치기]</b>: 기존 일지에 현재 내역을 추가합니다.<br />
                        <b>[덮어쓰기]</b>: 기존 일지를 삭제하고 현재 내역으로 새로 등록합니다.
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ flexDirection: 'column', p: 2, gap: 1 }}>
                    <Button variant="contained" fullWidth onClick={() => handleSaveLog("MERGE")}>기존 일지에 합치기</Button>
                    <Button variant="outlined" color="error" fullWidth onClick={() => handleSaveLog("REPLACE")}>기존 일지 삭제 후 새로 등록</Button>
                    <Button variant="text" fullWidth onClick={() => setConflictOpen(false)}>취소</Button>
                </DialogActions>
            </Dialog >

            {/* Create Doc Modal (Mobile optimized) */}
            < Dialog fullScreen open={showCreateModal} onClose={() => { setShowCreateModal(false); setEditingDocId(null); }}>
                <AppBar sx={{ position: 'relative', bgcolor: '#fff', color: '#000' }}>
                    <Toolbar size="small">
                        <IconButton edge="start" color="inherit" onClick={() => { setShowCreateModal(false); setEditingDocId(null); }}>
                            <CloseIcon />
                        </IconButton>
                        <Typography sx={{ ml: 2, flex: 1, fontWeight: 'bold' }}>
                            {editingDocId ? "문서 수정" : "신규 문서 기안"}
                        </Typography>
                        <Button color="primary" onClick={handleCreateApproval} disabled={loading} sx={{ fontWeight: 'bold' }}>
                            {editingDocId ? "수정" : "기안"}
                        </Button>
                    </Toolbar>
                </AppBar>
                <Box sx={{ p: 2, bgcolor: '#f8f9fa', minHeight: '100%' }}>
                    {!editingDocId && (
                        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                            <Typography variant="subtitle2" gutterBottom fontWeight="bold">문서 종류 선택</Typography>
                            <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
                                {Object.entries(CREATE_DOC_TYPES).map(([key, info]) => (
                                    <Chip
                                        key={key}
                                        label={info.label}
                                        onClick={() => {
                                            setSelectedDocType(key);
                                            const today = new Date().toISOString().split('T')[0];
                                            setDocFormData({
                                                date: today,
                                                request_date: today,
                                                draft_date: today,
                                                staff_no: user?.staff_no || '',
                                                dept: user?.department || '',
                                                role: user?.role || '',
                                            });
                                        }}
                                        color={selectedDocType === key ? "primary" : "default"}
                                        variant={selectedDocType === key ? "filled" : "outlined"}
                                        size="small"
                                        sx={{ flexShrink: 0 }}
                                    />
                                ))}
                            </Stack>
                        </Paper>
                    )}

                    <Paper sx={{ p: 2, borderRadius: 2 }}>
                        {selectedDocType === 'LEAVE_REQUEST' && (
                            <Stack spacing={2}>
                                <TextField label="시작일" type="date" fullWidth size="small" value={docFormData.start_date || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, start_date: e.target.value })} />
                                <TextField label="종료일" type="date" fullWidth size="small" value={docFormData.end_date || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, end_date: e.target.value })} />
                                
                                <Box>
                                    <Typography variant="caption" color="textSecondary" fontWeight="bold">휴가 종류</Typography>
                                    <RadioGroup 
                                        value={docFormData.vacation_type === '반차' ? (docFormData.half_day_type === '오전' ? '오전 반차' : '오후 반차') : (docFormData.vacation_type || '연차')} 
                                        onChange={e => {
                                            const val = e.target.value;
                                            let newData = { ...docFormData };
                                            if (val === '오전 반차') {
                                                newData.vacation_type = '반차';
                                                newData.half_day_type = '오전';
                                            } else if (val === '오후 반차') {
                                                newData.vacation_type = '반차';
                                                newData.half_day_type = '오후';
                                            } else {
                                                newData.vacation_type = val;
                                                delete newData.half_day_type;
                                            }
                                            setDocFormData(newData);
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                                            <FormControlLabel value="연차" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>연차</Typography>} />
                                            <FormControlLabel value="오전 반차" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>오전 반차</Typography>} />
                                            <FormControlLabel value="오후 반차" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>오후 반차</Typography>} />
                                            <FormControlLabel value="경조휴가" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>경조휴가</Typography>} />
                                            <FormControlLabel value="병가" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>병가</Typography>} />
                                            <FormControlLabel value="기타" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>기타</Typography>} />
                                        </Box>
                                    </RadioGroup>
                                </Box>
                                {(() => {
                                    const sDate = docFormData.start_date;
                                    const eDate = docFormData.end_date || sDate;
                                    const vType = docFormData.vacation_type || '연차';
                                    let days = 0;
                                    if (vType.includes('반차')) {
                                        days = 0.5;
                                    } else if (sDate && eDate) {
                                        const start = new Date(sDate);
                                        const end = new Date(eDate);
                                        if (end >= start) {
                                            days = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
                                        }
                                    }
                                    if (days > 0) return (
                                        <Box sx={{ p: 1, bgcolor: '#e0f2f1', borderRadius: 1, textAlign: 'center' }}>
                                            <Typography variant="body2" color="primary" fontWeight="bold">계산된 기간: {days}일</Typography>
                                        </Box>
                                    );
                                    return null;
                                })()}
                                <TextField label="사유" multiline rows={4} fullWidth size="small" value={docFormData.vacation_reason || ''} onChange={e => setDocFormData({ ...docFormData, vacation_reason: e.target.value })} />
                            </Stack>
                        )}
                        {selectedDocType === 'EARLY_LEAVE' && (
                            <Stack spacing={2}>
                                <TextField label="일자" type="date" fullWidth size="small" value={docFormData.date || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, date: e.target.value })} />
                                <Box>
                                    <Typography variant="caption" color="textSecondary" fontWeight="bold">구분</Typography>
                                    <RadioGroup 
                                        row
                                        value={docFormData.leave_type || '조퇴'} 
                                        onChange={e => setDocFormData({ ...docFormData, leave_type: e.target.value })}
                                    >
                                        <FormControlLabel value="조퇴" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>조퇴</Typography>} />
                                        <FormControlLabel value="외출" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>외출</Typography>} />
                                    </RadioGroup>
                                </Box>
                                <TextField label={docFormData.leave_type === '외출' ? '시작 시간' : '나가는 시간'} type="time" fullWidth size="small" value={docFormData.leave_time || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, leave_time: e.target.value })} />
                                {docFormData.leave_type === '외출' && (
                                    <TextField label="종료(복귀) 시간" type="time" fullWidth size="small" value={docFormData.return_time || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, return_time: e.target.value })} />
                                )}
                                {(() => {
                                    const startTime = docFormData.leave_time;
                                    const endTime = docFormData.return_time;
                                    const type = docFormData.leave_type || '조퇴';
                                    if (startTime) {
                                        const start = new Date(`2000-01-01T${startTime}`);
                                        let h = 0;
                                        if (type === '외출' && endTime) {
                                            const end = new Date(`2000-01-01T${endTime}`);
                                            let diff = (end - start) / (1000 * 60 * 60);
                                            if (diff < 0) diff += 24;
                                            h = parseFloat(diff.toFixed(1));
                                        } else if (type === '조퇴') {
                                            const workEnd = new Date(`2000-01-01T${workEndTime}`);
                                            let diff = (workEnd - start) / (1000 * 60 * 60);
                                            h = parseFloat(Math.max(0, diff).toFixed(1));
                                        }
                                        if (h > 0) return (
                                            <Box sx={{ p: 1, bgcolor: '#f3e5f5', borderRadius: 1, textAlign: 'center' }}>
                                                <Typography variant="body2" color="secondary" fontWeight="bold">계산된 시간: {h}시간</Typography>
                                            </Box>
                                        );
                                    }
                                    return null;
                                })()}
                                <TextField label="사유" multiline rows={4} fullWidth size="small" value={docFormData.leave_reason || ''} onChange={e => setDocFormData({ ...docFormData, leave_reason: e.target.value })} />
                            </Stack>
                        )}
                        {selectedDocType === 'CONSUMABLES_PURCHASE' && (
                            <Stack spacing={2}>
                                {(() => {
                                    const items = Array.isArray(docFormData.items) ? docFormData.items : [{ product_name: '', manufacturer: '', spec: '', unit: 'EA', quantity: 1, partner_name: '', remarks: '' }];
                                    
                                    const updateItems = (newItems) => {
                                        setDocFormData({ ...docFormData, items: newItems });
                                    };

                                    return (
                                        <>
                                            {items.map((item, idx) => (
                                                <Paper key={idx} variant="outlined" sx={{ p: 1.5, borderRadius: 2, position: 'relative', bgcolor: '#fff' }}>
                                                    <Stack spacing={1.5}>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Typography variant="caption" fontWeight="bold" color="primary">품목 {idx + 1}</Typography>
                                                            {items.length > 1 && (
                                                                <IconButton size="small" color="error" onClick={() => updateItems(items.filter((_, i) => i !== idx))}>
                                                                    <DeleteIcon fontSize="small" />
                                                                </IconButton>
                                                            )}
                                                        </Box>
                                                        <TextField 
                                                            label="품명 (용도)" fullWidth size="small" 
                                                            value={item.product_name || ''} 
                                                            onChange={e => {
                                                                const next = [...items];
                                                                next[idx].product_name = e.target.value;
                                                                updateItems(next);
                                                            }} 
                                                        />
                                                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                                            <TextField 
                                                                label="제조사" fullWidth size="small" 
                                                                value={item.manufacturer || ''} 
                                                                onChange={e => {
                                                                    const next = [...items];
                                                                    next[idx].manufacturer = e.target.value;
                                                                    updateItems(next);
                                                                }} 
                                                            />
                                                            <TextField 
                                                                label="규격" fullWidth size="small" 
                                                                value={item.spec || ''} 
                                                                onChange={e => {
                                                                    const next = [...items];
                                                                    next[idx].spec = e.target.value;
                                                                    updateItems(next);
                                                                }} 
                                                            />
                                                            <TextField 
                                                                label="단위" fullWidth size="small" 
                                                                value={item.unit || 'EA'} 
                                                                onChange={e => {
                                                                    const next = [...items];
                                                                    next[idx].unit = e.target.value;
                                                                    updateItems(next);
                                                                }} 
                                                            />
                                                            <TextField 
                                                                label="수량" fullWidth size="small" type="number"
                                                                value={item.quantity || 1} 
                                                                onChange={e => {
                                                                    const next = [...items];
                                                                    next[idx].quantity = e.target.value;
                                                                    updateItems(next);
                                                                }} 
                                                            />
                                                        </Box>
                                                        <TextField 
                                                            label="거래처 (공급사)" fullWidth size="small" 
                                                            value={item.partner_name || ''} 
                                                            onChange={e => {
                                                                const next = [...items];
                                                                next[idx].partner_name = e.target.value;
                                                                updateItems(next);
                                                            }} 
                                                            placeholder="공급사 이름 (발주 연동)"
                                                        />
                                                        <TextField 
                                                            label="비고" fullWidth size="small" 
                                                            value={item.remarks || ''} 
                                                            onChange={e => {
                                                                const next = [...items];
                                                                next[idx].remarks = e.target.value;
                                                                updateItems(next);
                                                            }} 
                                                        />
                                                    </Stack>
                                                </Paper>
                                            ))}
                                            <Button 
                                                variant="outlined" 
                                                startIcon={<AddIcon />} 
                                                onClick={() => updateItems([...items, { product_name: '', manufacturer: '', spec: '', unit: 'EA', quantity: 1, partner_name: '', remarks: '' }])}
                                                sx={{ mt: 1, borderRadius: 2 }}
                                            >
                                                품목 추가
                                            </Button>
                                            <TextField 
                                                label="전체 특기사항" multiline rows={2} fullWidth size="small" 
                                                value={docFormData.special_notes || ''} 
                                                onChange={e => setDocFormData({ ...docFormData, special_notes: e.target.value })} 
                                                sx={{ mt: 2 }}
                                            />
                                        </>
                                    );
                                })()}
                            </Stack>
                        )}
                        {selectedDocType === 'OVERTIME' && (
                            <Stack spacing={2}>
                                <TextField label="근무일" type="date" fullWidth size="small" value={docFormData.date || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, date: e.target.value })} />
                                <Stack direction="row" spacing={1}>
                                    <TextField label="시작" type="time" fullWidth size="small" value={docFormData.start_time || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, start_time: e.target.value })} />
                                    <TextField label="종료" type="time" fullWidth size="small" value={docFormData.end_time || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, end_time: e.target.value })} />
                                </Stack>
                                <TextField label="업무 내용" multiline rows={4} fullWidth size="small" value={docFormData.reason || ''} onChange={e => setDocFormData({ ...docFormData, reason: e.target.value })} />
                            </Stack>
                        )}
                    </Paper>
                </Box>
            </Dialog >

            {/* Doc Detail Modal */}
            < Dialog fullScreen open={showDetailModal} onClose={() => setShowDetailModal(false)}>
                <AppBar sx={{ position: 'relative', bgcolor: '#fff', color: '#000' }}>
                    <Toolbar size="small">
                        <IconButton edge="start" color="inherit" onClick={() => setShowDetailModal(false)}>
                            <CloseIcon />
                        </IconButton>
                        <Typography sx={{ ml: 2, flex: 1, fontWeight: 'bold' }}>문서 상세</Typography>
                    </Toolbar>
                </AppBar>
                <Box sx={{ p: 2, bgcolor: '#f8f9fa', minHeight: '100%' }}>
                    {selectedDoc && (
                        <Stack spacing={2}>
                            <Paper sx={{ p: 2, borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: DOC_TYPES[selectedDoc.doc_type]?.color, fontWeight: 'bold' }}>
                                    {DOC_TYPES[selectedDoc.doc_type]?.label}
                                </Typography>
                                <Typography variant="h5" sx={{ fontWeight: 900, color: '#1a202c', mb: 1, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
                                    {selectedDoc.title}
                                </Typography>
                                <Divider sx={{ my: 1 }} />
                                <Box sx={{ mt: 1 }}>
                                    {(selectedDoc.doc_type === 'VACATION' || selectedDoc.doc_type === 'LEAVE_REQUEST') && (
                                        <Stack spacing={1}>
                                            <Typography variant="body2"><b>기간:</b> {selectedDoc.content.start_date} ~ {selectedDoc.content.end_date} ({selectedDoc.content.vacation_type}{selectedDoc.content.half_day_type ? ` - ${selectedDoc.content.half_day_type}` : ''})</Typography>
                                            {selectedDoc.content.leave_days && (
                                                <Typography variant="body2" color="primary"><b>신청일수:</b> {selectedDoc.content.leave_days}일</Typography>
                                            )}
                                            <Typography variant="body2"><b>사유:</b> {selectedDoc.content.vacation_reason || selectedDoc.content.reason}</Typography>
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'EARLY_LEAVE' && (
                                        <Stack spacing={1}>
                                            <Typography variant="body2"><b>일시:</b> {selectedDoc.content.date} {selectedDoc.content.leave_time || selectedDoc.content.time}{(selectedDoc.content.return_time || selectedDoc.content.end_time) ? ` ~ ${selectedDoc.content.return_time || selectedDoc.content.end_time}` : ''} ({selectedDoc.content.leave_type || selectedDoc.content.type})</Typography>
                                            {selectedDoc.content.hours && (
                                                <Typography variant="body2" sx={{ color: '#a855f7' }}><b>신청시간:</b> {selectedDoc.content.hours}시간</Typography>
                                            )}
                                            <Typography variant="body2"><b>사유:</b> {selectedDoc.content.leave_reason || selectedDoc.content.reason}</Typography>
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'CONSUMABLES_PURCHASE' && (
                                        <Stack spacing={1}>
                                            <Typography variant="body2" component="div">
                                                <b>품목:</b>
                                                {(() => {
                                                    const items = Array.isArray(selectedDoc.content.items)
                                                        ? selectedDoc.content.items
                                                        : (selectedDoc.content.items ? [selectedDoc.content.items] : []);

                                                    if (items.length === 0) return " -";

                                                    return (
                                                        <Box sx={{ mt: 0.5, pl: 1 }}>
                                                            {items.map((item, idx) => (
                                                                <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5, borderLeft: '2px solid #e0e0e0', pl: 1, color: 'text.secondary' }}>
                                                                    {typeof item === 'object'
                                                                        ? (
                                                                            <>
                                                                                <Box component="span" sx={{ fontWeight: 'bold', color: 'text.primary' }}>{item.product_name || '-'}</Box>
                                                                                <Box component="span" sx={{ ml: 0.5 }}>
                                                                                    {item.manufacturer && `[${item.manufacturer}] `}
                                                                                    {item.spec && `${item.spec} `}
                                                                                    {item.quantity && `(${item.quantity}${item.unit || 'EA'})`}
                                                                                    {item.remarks && ` - ${item.remarks}`}
                                                                                </Box>
                                                                            </>
                                                                        )
                                                                        : String(item)
                                                                    }
                                                                </Typography>
                                                            ))}
                                                        </Box>
                                                    );
                                                })()}
                                            </Typography>
                                            {selectedDoc.content.remarks && <Typography variant="body2"><b>비고:</b> {selectedDoc.content.remarks}</Typography>}
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'OVERTIME' && (
                                        <Stack spacing={1}>
                                            <Typography variant="body2"><b>일자:</b> {selectedDoc.content.date}</Typography>
                                            <Typography variant="body2"><b>시간:</b> {selectedDoc.content.start_time} ~ {selectedDoc.content.end_time}</Typography>
                                            <Typography variant="body2"><b>내용:</b> {selectedDoc.content.reason}</Typography>
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'INTERNAL_DRAFT' && (
                                        <Stack spacing={1}>
                                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                {selectedDoc.content.reason || selectedDoc.content.content}
                                            </Typography>
                                            {selectedDoc.content.items?.filter(item => item.name || item.description)?.length > 0 && (
                                                <Box sx={{ mt: 2 }}>
                                                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>품목 내역</Typography>
                                                    {selectedDoc.content.items.filter(item => item.name || item.description).map((item, idx) => (
                                                        <Box key={idx} sx={{ mb: 1, pl: 1, borderLeft: '2px solid #e2e8f0' }}>
                                                            <Typography variant="body2">{item.name || item.description}</Typography>
                                                            <Typography variant="caption" color="textSecondary">
                                                                {item.spec} • {item.quantity || item.qty}{item.unit} • {parseInt(item.amount || item.total || 0).toLocaleString()}원
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            )}
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'EXPENSE_REPORT' && (
                                        <Stack spacing={1}>
                                            <Box sx={{ p: 1, bgcolor: '#f1f5f9', borderRadius: 1, mb: 1 }}>
                                                <Typography variant="caption" color="textSecondary">총 지출 금액</Typography>
                                                <Typography variant="h6" color="primary" fontWeight="bold">
                                                    {(selectedDoc.content.total_amount || 0).toLocaleString()}원
                                                </Typography>
                                            </Box>
                                            <Typography variant="subtitle2" fontWeight="bold">지출 내역</Typography>
                                            {selectedDoc.content.items?.filter(item => item.description || item.amount)?.map((item, idx) => (
                                                <Box key={idx} sx={{ pl: 1, borderLeft: '2px solid #e2e8f0', mb: 1 }}>
                                                    <Typography variant="body2">{item.description}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{item.date} • {parseInt(item.amount || 0).toLocaleString()}원</Typography>
                                                </Box>
                                            ))}
                                            {selectedDoc.content.summary && <Typography variant="body2"><b>요약:</b> {selectedDoc.content.summary}</Typography>}
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'PURCHASE_ORDER' && (
                                        <Stack spacing={1}>
                                            <Box sx={{ p: 1, bgcolor: '#fff7ed', borderRadius: 1, mb: 1 }}>
                                                <Typography variant="caption" color="textSecondary">공급처</Typography>
                                                <Typography variant="subtitle2" fontWeight="bold">{selectedDoc.content.partner_name || '-'}</Typography>
                                                <Typography variant="caption" color="textSecondary">발주일: {selectedDoc.content.order_date || '-'}</Typography>
                                            </Box>
                                            <Typography variant="subtitle2" fontWeight="bold">발주 품목</Typography>
                                            {selectedDoc.content.items?.filter(item => item.name || item.qty)?.map((item, idx) => (
                                                <Box key={idx} sx={{ pl: 1, borderLeft: '2px solid #fdba74', mb: 1 }}>
                                                    <Typography variant="body2">{item.name}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{item.spec} • {item.qty} {item.unit || 'EA'}</Typography>
                                                    {item.total && <Typography variant="caption" sx={{ ml: 1, fontWeight: 'bold' }}>{parseInt(item.total).toLocaleString()}원</Typography>}
                                                </Box>
                                            ))}
                                        </Stack>
                                    )}
                                </Box>
                            </Paper>

                            <Paper sx={{ p: 2, borderRadius: 2 }}>
                                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>결재 진행 상태</Typography>
                                <Stack spacing={1.5}>
                                    {selectedDoc.steps?.map((step, idx) => (
                                        <Box key={idx}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography variant="body2">
                                                    {step.sequence}. {step.approver?.name} ({step.approver?.role})
                                                </Typography>
                                                <Chip
                                                    label={STATUS_MAP[step.status]?.label || step.status}
                                                    size="small"
                                                    color={step.status === 'APPROVED' ? 'success' : step.status === 'REJECTED' ? 'error' : 'default'}
                                                    sx={{ height: 20, fontSize: '10px' }}
                                                />
                                            </Stack>
                                            {step.comment && (
                                                <Typography variant="caption" color="textSecondary" sx={{ ml: 2, display: 'block', mt: 0.5 }}>
                                                    의견: {step.comment}
                                                </Typography>
                                            )}
                                        </Box>
                                    ))}
                                </Stack>
                            </Paper>

                            {/* Processing for current approver */}
                            {(selectedDoc.status === 'PENDING' || selectedDoc.status === 'IN_PROGRESS') && selectedDoc.steps?.some(s => s.approver_id === user.id && s.sequence === selectedDoc.current_sequence && s.status === 'PENDING') && (
                                <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #3b82f6' }}>
                                    <TextField
                                        label="의견 (반려 시 필수)"
                                        fullWidth
                                        size="small"
                                        value={comment}
                                        onChange={e => setComment(e.target.value)}
                                        sx={{ mb: 2 }}
                                    />
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            variant="outlined"
                                            color="error"
                                            fullWidth
                                            onClick={() => handleProcessApproval('REJECTED')}
                                        >
                                            반려
                                        </Button>
                                        <Button
                                            variant="contained"
                                            color="success"
                                            fullWidth
                                            onClick={() => handleProcessApproval('APPROVED')}
                                        >
                                            승인
                                        </Button>
                                    </Stack>
                                </Paper>
                            )}

                            {/* Self Edit/Delete (PENDING, REJECTED, or IN_PROGRESS with only auto-approvals) */}
                            {isEditable(selectedDoc) && (
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        variant="outlined"
                                        color="primary"
                                        fullWidth
                                        startIcon={<SaveIcon />}
                                        onClick={() => handleEditApproval(selectedDoc)}
                                    >
                                        수정
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        fullWidth
                                        startIcon={<DeleteIcon />}
                                        onClick={() => handleDeleteApproval(selectedDoc.id)}
                                    >
                                        삭제
                                    </Button>
                                </Stack>
                            )}
                        </Stack>
                    )}
                </Box>
            </Dialog >
        </Box >
    );
};

export default MobileWorkLogPage;
