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
    Alert
} from '@mui/material';
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
import api from '../lib/api';

const ATTENDANCE_DOC_META = {
    VACATION: { label: '휴가원', color: '#3b82f6', Icon: VacationIcon },
    EARLY_LEAVE: { label: '조퇴/외출원', color: '#a855f7', Icon: TimerIcon },
    OVERTIME: { label: '특근/야근', color: '#f59e0b', Icon: OvertimeIcon },
};

const MobileWorkLogPage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Tab and selection state driven by URL to support "Back" button
    const tab = parseInt(searchParams.get('tab') || '0');
    const selectedPlanId = searchParams.get('planId');
    const selectedItemId = searchParams.get('itemId');

    const setTab = (newTab) => {
        setSearchParams({ tab: newTab });
    };

    const [loading, setLoading] = useState(false);

    // Data lists
    const [allPlans, setAllPlans] = useState([]);
    const [myPerformance, setMyPerformance] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Performance Filters
    const now = new Date();
    const [perfYear, setPerfYear] = useState(now.getFullYear());
    const [perfMonth, setPerfMonth] = useState(now.getMonth() + 1);
    const [selectedWorker, setSelectedWorker] = useState(user?.user_type === 'ADMIN' ? 'ALL' : (user?.id || ''));

    const [comment, setComment] = useState('');
    const [editingDocId, setEditingDocId] = useState(null);

    // Registration Form
    const [goodQty, setGoodQty] = useState('');
    const [badQty, setBadQty] = useState('0');
    const [note, setNote] = useState('');
    const [photos, setPhotos] = useState([]);

    // Conflict Dialog
    const [conflictOpen, setConflictOpen] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState(null);

    // Approval States
    const [approvalDocs, setApprovalDocs] = useState([]);
    const [viewMode, setViewMode] = useState('ALL'); // Filters: ALL, MY_DRAFTS, MY_APPROVALS
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedDocType, setSelectedDocType] = useState('VACATION');
    const [docFormData, setDocFormData] = useState({});
    const [selectedDoc, setSelectedDoc] = useState(null);

    // Attendance Tab State
    const [attendYear, setAttendYear] = useState(now.getFullYear());
    const [attendUserId, setAttendUserId] = useState(null);
    const [attendanceSummary, setAttendanceSummary] = useState(null);
    const [attendanceLoading, setAttendanceLoading] = useState(false);
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
        if (plan) setSearchParams({ tab: 0, planId: plan.id });
        else setSearchParams({ tab: 0 });
    };

    const setSelectedItem = (item) => {
        if (item) setSearchParams({ tab: 0, planId: selectedPlanId, itemId: item.id });
        else setSearchParams({ tab: 0, planId: selectedPlanId });
    };

    const handleLogout = () => {
        if (window.confirm("로그아웃 하시겠습니까?")) {
            logout();
            navigate('/login');
        }
    };

    const DOC_TYPES = {
        VACATION: { label: '휴가원', color: '#3b82f6' },
        EARLY_LEAVE: { label: '조퇴/외출원', color: '#a855f7' },
        SUPPLIES: { label: '소모품 신청서', color: '#10b981' },
        OVERTIME: { label: '야근/특근신청서', color: '#f97316' },
        INTERNAL_DRAFT: { label: '내부기안', color: '#3b82f6' },
        EXPENSE_REPORT: { label: '지출결의서', color: '#6366f1' },
        PURCHASE_ORDER: { label: '구매발주서', color: '#f59e0b' }
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
        if (!selectedItem || !goodQty) {
            alert("수량을 입력해주세요.");
            return;
        }

        setLoading(true);
        try {
            const uploadedPhotos = [];
            for (const file of photos) {
                const formData = new FormData();
                formData.append('file', file);

                // Remove explicit Content-Type to let browser handle boundary
                const uploadRes = await api.post('/upload', formData);
                uploadedPhotos.push({
                    name: uploadRes.data.filename,
                    url: uploadRes.data.url
                });
            }

            // Local Date handling
            const localDate = new Date();
            const year = localDate.getFullYear();
            const month = String(localDate.getMonth() + 1).padStart(2, '0');
            const day = String(localDate.getDate()).padStart(2, '0');
            const workDate = `${year}-${month}-${day}`;

            const payload = {
                work_date: workDate,
                worker_id: user.id,
                note: note,
                attachment_file: uploadedPhotos,
                mode: mode,
                items: [{
                    plan_item_id: selectedItem.id,
                    worker_id: user.id,
                    good_quantity: parseInt(goodQty),
                    bad_quantity: parseInt(badQty),
                    note: note
                }]
            };

            await api.post('/production/work-logs', payload);

            alert("저장되었습니다.");
            setSelectedItem(null);
            setSelectedPlan(null);
            setGoodQty('');
            setBadQty('0');
            setNote('');
            setPhotos([]);
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
        if (!docFormData.reason && !docFormData.items && selectedDocType !== 'SUPPLIES') {
            alert("필수 항목을 입력해주세요.");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                title: `${user.name} - ${DOC_TYPES[selectedDocType].label}`,
                doc_type: selectedDocType,
                content: docFormData
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

    const filteredPlans = allPlans.filter(p => {
        const orderNo = p.order?.order_no || p.stock_production?.production_no || '';
        const productName = p.items?.[0]?.product?.name || '';
        return orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            productName.toLowerCase().includes(searchQuery.toLowerCase());
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
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: '#f8f9fa',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <Paper elevation={0} sx={{ p: 2, borderBottom: '1px solid #eee', flexShrink: 0, borderRadius: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1}>
                        {(selectedPlan || selectedItem) && tab === 0 && (
                            <IconButton size="small" onClick={() => {
                                if (selectedItem) setSelectedItem(null);
                                else setSelectedPlan(null);
                            }}>
                                <ArrowBackIcon fontSize="small" />
                            </IconButton>
                        )}
                        <Typography variant="h6" fontWeight="bold">
                            {tab === 0 ? (selectedItem ? "실적 등록" : selectedPlan ? "공정 선택" : "생산 현황") : tab === 1 ? "내 실적 확인" : tab === 2 ? "전자결재" : "근태 현황"}
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5}>
                        <IconButton size="small" onClick={() => navigate('/mobile/attendance')}>
                            <ClockIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={handleLogout}>
                            <LogoutIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Stack>
                <Typography variant="caption" color="textSecondary">
                    {user.name} ({user.role || '사용자'})
                </Typography>
            </Paper>

            {/* Swipe Area */}
            <Box
                sx={{
                    flex: 1,
                    overflow: 'hidden',
                    position: 'relative'
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={(e) => { /* allow scroll within tab */ }}
            >
                <Box sx={{
                    display: 'flex',
                    width: '400%',
                    height: '100%',
                    transform: `translateX(-${tab * 25}%)`,
                    transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    {/* Tab 1: Production Status */}
                    <Box sx={{ width: '25%', p: 2, overflowY: 'auto' }}>
                        {!selectedPlan && !selectedItem ? (
                            /* Step 1: Browse Production Plans */
                            <Box>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="수주번호 또는 제품명 검색"
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
                                    <Stack spacing={1.5}>
                                        {filteredPlans.map(plan => {
                                            const orderNo = plan.order?.order_no || plan.stock_production?.production_no || '-';
                                            const productName = plan.items?.[0]?.product?.name || '-';

                                            return (
                                                <Card key={plan.id} sx={{ borderRadius: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }} onClick={() => setSelectedPlan(plan)}>
                                                    <CardContent sx={{ p: '16px !important' }}>
                                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                            <Box sx={{ flex: 1 }}>
                                                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                                                                    {plan.order?.order_no ? (
                                                                        <Chip label="수주" size="small" sx={{ height: 18, fontSize: '10px', bgcolor: '#3b82f6', color: '#fff', fontWeight: 'bold' }} />
                                                                    ) : (
                                                                        <Chip label="재고" size="small" sx={{ height: 18, fontSize: '10px', bgcolor: '#10b981', color: '#fff', fontWeight: 'bold' }} />
                                                                    )}
                                                                    <Typography variant="caption" color="primary" fontWeight="bold">
                                                                        {orderNo}
                                                                    </Typography>
                                                                </Stack>
                                                                <Typography variant="subtitle1" fontWeight="bold">
                                                                    {productName}
                                                                </Typography>
                                                                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                                    <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 'bold' }}>
                                                                        고객사: {plan.order?.partner?.name || '-'}
                                                                    </Typography>
                                                                    {plan.order?.order_date && (
                                                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                                                            <Typography variant="caption" color="textSecondary">
                                                                                수주일: {plan.order.order_date}
                                                                            </Typography>
                                                                            <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold' }}>
                                                                                납기: {plan.order.delivery_date || '-'}
                                                                            </Typography>
                                                                        </Box>
                                                                    )}
                                                                </Box>
                                                                <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
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
                        ) : selectedPlan && !selectedItem ? (
                            /* Step 2: Select Process from Plan */
                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 2, px: 1, color: 'textSecondary' }}>
                                    {selectedPlan.order?.order_no || selectedPlan.stock_production?.production_no} 상세 공정
                                </Typography>
                                <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                    <List disablePadding>
                                        {selectedPlan.items.map((item, idx) => (
                                            <React.Fragment key={item.id}>
                                                <ListItemButton onClick={() => setSelectedItem(item)}>
                                                    <ListItemText
                                                        primary={item.process_name}
                                                        secondary={`실적: ${item.completed_quantity || 0} / ${item.quantity}`}
                                                        primaryTypographyProps={{ fontWeight: 500 }}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        label={item.status}
                                                        color={item.status === 'COMPLETED' ? 'success' : 'default'}
                                                        variant="outlined"
                                                    />
                                                </ListItemButton>
                                                {idx < selectedPlan.items.length - 1 && <Divider />}
                                            </React.Fragment>
                                        ))}
                                    </List>
                                </Paper>
                            </Box>
                        ) : (
                            /* Step 3: Registration Form */
                            <Box component={Paper} sx={{ p: 3, borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                <Stack spacing={3}>
                                    <Box sx={{ p: 2, backgroundColor: '#f0f4f8', borderRadius: 2, borderLeft: '4px solid #1976d2' }}>
                                        <Typography variant="caption" color="textSecondary" fontWeight="bold">선택 공정</Typography>
                                        <Typography variant="subtitle1" fontWeight="bold">{selectedItem.process_name}</Typography>
                                        <Typography variant="body2" color="textSecondary">{selectedItem.product?.name}</Typography>
                                    </Box>

                                    <TextField
                                        label="양품 수량"
                                        type="number"
                                        value={goodQty}
                                        onChange={e => setGoodQty(e.target.value)}
                                        fullWidth
                                        variant="outlined"
                                    />
                                    <TextField
                                        label="불량 수량"
                                        type="number"
                                        value={badQty}
                                        onChange={e => setBadQty(e.target.value)}
                                        fullWidth
                                        variant="outlined"
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
                    <Box sx={{ width: '25%', p: 2, overflowY: 'auto' }}>
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
                                                                                {item.plan_item?.product?.name} • {item.good_quantity}개
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
                    <Box sx={{ width: '25%', p: 2, overflowY: 'auto', bgcolor: '#f1f5f9' }}>
                        <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
                            {[
                                { id: 'ALL', label: '전체' },
                                { id: 'MY_WAITING', label: '기안대기' },
                                { id: 'MY_COMPLETED', label: '결재완료' },
                                { id: 'MY_REJECTED', label: '반려문서' },
                                { id: 'WAITING_FOR_ME', label: '나의결재대기' }
                            ].map(m => (
                                <Chip
                                    key={m.id}
                                    label={m.label}
                                    onClick={() => setViewMode(m.id)}
                                    color={viewMode === m.id ? "primary" : "default"}
                                    variant={viewMode === m.id ? "filled" : "outlined"}
                                    size="small"
                                    sx={{ flexShrink: 0 }}
                                />
                            ))}
                        </Stack>

                        <Button
                            fullWidth
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => { setSelectedDocType('VACATION'); setDocFormData({}); setEditingDocId(null); setShowCreateModal(true); }}
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
                                        onClick={() => { setSelectedDoc(doc); setShowDetailModal(true); }}
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
                    <Box sx={{ width: '25%', p: 2, overflowY: 'auto' }}>
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

            {/* Bottom Nav */}
            < Paper sx={{ flexShrink: 0 }} elevation={10} >
                <BottomNavigation
                    showLabels
                    value={tab}
                    onChange={(event, newValue) => {
                        setSearchParams({ tab: newValue });
                        if (newValue !== 0) {
                            setSearchParams({ tab: newValue });
                        }
                    }}
                >
                    <BottomNavigationAction label="생산현황" icon={<AssignmentIcon />} />
                    <BottomNavigationAction label="내 실적" icon={<BarChartIcon />} />
                    <BottomNavigationAction label="전자결재" icon={<DescriptionIcon />} />
                    <BottomNavigationAction label="근태현황" icon={<AssignmentIndIcon />} />
                </BottomNavigation>
            </Paper >

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
                                {Object.entries(DOC_TYPES).map(([key, info]) => (
                                    <Chip
                                        key={key}
                                        label={info.label}
                                        onClick={() => setSelectedDocType(key)}
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
                        {selectedDocType === 'VACATION' && (
                            <Stack spacing={2}>
                                <TextField label="시작일" type="date" fullWidth size="small" value={docFormData.start_date || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, start_date: e.target.value })} />
                                <TextField label="종료일" type="date" fullWidth size="small" value={docFormData.end_date || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, end_date: e.target.value })} />
                                <FormControl size="small" fullWidth>
                                    <InputLabel>휴가 종류</InputLabel>
                                    <Select value={docFormData.vacation_type || '연차'} label="휴가 종류" onChange={e => setDocFormData({ ...docFormData, vacation_type: e.target.value })}>
                                        <option value="연차">연차</option>
                                        <option value="반차">반차</option>
                                        <option value="경조휴가">경조휴가</option>
                                        <option value="병가">병가</option>
                                        <option value="기타">기타</option>
                                    </Select>
                                </FormControl>
                                {docFormData.vacation_type === '반차' && (
                                    <FormControl size="small" fullWidth>
                                        <InputLabel>반차 구분</InputLabel>
                                        <Select value={docFormData.half_day_type || '오전'} label="반차 구분" onChange={e => setDocFormData({ ...docFormData, half_day_type: e.target.value })}>
                                            <option value="오전">오전</option>
                                            <option value="오후">오후</option>
                                        </Select>
                                    </FormControl>
                                )}
                                <TextField label="사유" multiline rows={4} fullWidth size="small" value={docFormData.reason || ''} onChange={e => setDocFormData({ ...docFormData, reason: e.target.value })} />
                            </Stack>
                        )}
                        {selectedDocType === 'EARLY_LEAVE' && (
                            <Stack spacing={2}>
                                <TextField label="일자" type="date" fullWidth size="small" value={docFormData.date || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, date: e.target.value })} />
                                <FormControl size="small" fullWidth>
                                    <InputLabel>구분</InputLabel>
                                    <Select value={docFormData.type || '조퇴'} label="구분" onChange={e => setDocFormData({ ...docFormData, type: e.target.value })}>
                                        <option value="조퇴">조퇴</option>
                                        <option value="외출">외출</option>
                                    </Select>
                                </FormControl>
                                <TextField label={docFormData.type === '외출' ? '시작 시간' : '나가는 시간'} type="time" fullWidth size="small" value={docFormData.time || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, time: e.target.value })} />
                                {docFormData.type === '외출' && (
                                    <TextField label="종료(복귀) 시간" type="time" fullWidth size="small" value={docFormData.end_time || ''} InputLabelProps={{ shrink: true }} onChange={e => setDocFormData({ ...docFormData, end_time: e.target.value })} />
                                )}
                                <TextField label="사유" multiline rows={4} fullWidth size="small" value={docFormData.reason || ''} onChange={e => setDocFormData({ ...docFormData, reason: e.target.value })} />
                            </Stack>
                        )}
                        {selectedDocType === 'SUPPLIES' && (
                            <Stack spacing={2}>
                                <TextField
                                    label="품목 및 수량"
                                    multiline
                                    rows={4}
                                    fullWidth
                                    size="small"
                                    placeholder="A4용지 1박스 등"
                                    value={Array.isArray(docFormData.items)
                                        ? docFormData.items.map(i => typeof i === 'object' ? `${i.product_name || '-'} (${i.quantity || 0}EA)${i.remarks ? ` [${i.remarks}]` : ''}` : String(i)).join('\n')
                                        : (docFormData.items || '')}
                                    onChange={e => setDocFormData({ ...docFormData, items: e.target.value })}
                                />
                                <TextField label="비고" fullWidth size="small" value={docFormData.remarks || ''} onChange={e => setDocFormData({ ...docFormData, remarks: e.target.value })} />
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
                                    {selectedDoc.doc_type === 'VACATION' && (
                                        <Stack spacing={1}>
                                            <Typography variant="body2"><b>기간:</b> {selectedDoc.content.start_date} ~ {selectedDoc.content.end_date} ({selectedDoc.content.vacation_type}{selectedDoc.content.half_day_type ? ` - ${selectedDoc.content.half_day_type}` : ''})</Typography>
                                            <Typography variant="body2"><b>사유:</b> {selectedDoc.content.reason}</Typography>
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'EARLY_LEAVE' && (
                                        <Stack spacing={1}>
                                            <Typography variant="body2"><b>일시:</b> {selectedDoc.content.date} {selectedDoc.content.time}{selectedDoc.content.end_time ? ` ~ ${selectedDoc.content.end_time}` : ''} ({selectedDoc.content.type})</Typography>
                                            <Typography variant="body2"><b>사유:</b> {selectedDoc.content.reason}</Typography>
                                        </Stack>
                                    )}
                                    {selectedDoc.doc_type === 'SUPPLIES' && (
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
                                                                        ? `${item.product_name || '-'} (${item.quantity || 0}EA)${item.remarks ? ` - ${item.remarks}` : ''}`
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
                                            {selectedDoc.content.items?.length > 0 && (
                                                <Box sx={{ mt: 2 }}>
                                                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>품목 내역</Typography>
                                                    {selectedDoc.content.items.map((item, idx) => (
                                                        <Box key={idx} sx={{ mb: 1, pl: 1, borderLeft: '2px solid #e2e8f0' }}>
                                                            <Typography variant="body2">{item.name}</Typography>
                                                            <Typography variant="caption" color="textSecondary">
                                                                {item.spec} • {item.quantity}{item.unit} • {parseInt(item.amount || 0).toLocaleString()}원
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
                                            {selectedDoc.content.items?.map((item, idx) => (
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
                                            {selectedDoc.content.items?.map((item, idx) => (
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
