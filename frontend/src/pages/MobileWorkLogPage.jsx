import React, { useState, useEffect, useMemo } from 'react';
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
    DialogActions
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
    ChevronRight as ChevronRightIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const MobileWorkLogPage = () => {
    const { user } = useAuth();
    const [tab, setTab] = useState(0); // 0: Status, 1: Performance
    const [loading, setLoading] = useState(false);

    // Data lists
    const [allPlans, setAllPlans] = useState([]);
    const [myPerformance, setMyPerformance] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Performance Filters
    const now = new Date();
    const [perfYear, setPerfYear] = useState(now.getFullYear());
    const [perfMonth, setPerfMonth] = useState(now.getMonth() + 1);

    // Navigation/Selection State
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [expandedLogId, setExpandedLogId] = useState(null); // For performance drill-down

    // Registration Form
    const [goodQty, setGoodQty] = useState('');
    const [badQty, setBadQty] = useState('0');
    const [note, setNote] = useState('');
    const [photos, setPhotos] = useState([]);

    // Conflict Dialog
    const [conflictOpen, setConflictOpen] = useState(false);

    useEffect(() => {
        if (tab === 0) fetchAllPlans();
        if (tab === 1) fetchMyPerformance();
    }, [tab, perfYear, perfMonth]);

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

    const fetchMyPerformance = async () => {
        setLoading(true);
        try {
            const startDate = `${perfYear}-${String(perfMonth).padStart(2, '0')}-01`;
            const endDate = new Date(perfYear, perfMonth, 0).toISOString().split('T')[0];

            const res = await api.get(`/production/performance/workers/${user.id}/details`, {
                params: { start_date: startDate, end_date: endDate }
            });
            setMyPerformance(res.data);
        } catch (err) {
            console.error(err);
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
                // OVERRIDE default headers for multipart
                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                uploadedPhotos.push({
                    name: uploadRes.data.filename,
                    url: uploadRes.data.url
                });
            }

            const payload = {
                work_date: new Date().toISOString().split('T')[0],
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

    const filteredPlans = allPlans.filter(p => {
        const orderNo = p.order?.order_no || p.stock_production?.production_no || '';
        const productName = p.items?.[0]?.product?.name || '';
        return orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            productName.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Performance Aggregation
    const totalCost = useMemo(() => {
        return myPerformance.reduce((sum, item) => sum + (item.good_quantity * (item.unit_price || 0)), 0);
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
                    totalCost: 0,
                    items: []
                };
            }
            groups[logId].totalCost += (item.good_quantity * (item.unit_price || 0));
            groups[logId].items.push(item);
        });
        return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
    }, [myPerformance]);

    return (
        <Box sx={{ pb: 7, backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
            {/* Header */}
            <Paper elevation={0} sx={{ p: 2, borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 10, borderRadius: 0 }}>
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
                        {tab === 0 ? (selectedItem ? "실적 등록" : selectedPlan ? "공정 선택" : "생산 현황") : "내 실적 확인"}
                    </Typography>
                </Stack>
                <Typography variant="caption" color="textSecondary">
                    {user.name} ({user.role || '사용자'})
                </Typography>
            </Paper>

            <Box sx={{ p: 2 }}>
                {tab === 0 && (
                    <Box>
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
                                                <Card key={plan.id} sx={{ borderRadius: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} onClick={() => setSelectedPlan(plan)}>
                                                    <CardContent sx={{ p: '16px !important' }}>
                                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                            <Box>
                                                                <Typography variant="caption" color="primary" fontWeight="bold">
                                                                    {orderNo}
                                                                </Typography>
                                                                <Typography variant="subtitle1" fontWeight="bold">
                                                                    {productName}
                                                                </Typography>
                                                                <Typography variant="caption" color="textSecondary">
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
                )}

                {tab === 1 && (
                    <Box>
                        {/* Filters & Summary */}
                        <Paper sx={{ p: 2, mb: 2, borderRadius: 3, backgroundColor: '#1a237e', color: '#fff' }}>
                            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
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
                            <Box sx={{ textAlign: 'center', py: 1 }}>
                                <Typography variant="caption" sx={{ opacity: 0.8 }}>선택 기간 총 실적 비용</Typography>
                                <Typography variant="h4" fontWeight="bold">
                                    {totalCost.toLocaleString()}원
                                </Typography>
                            </Box>
                        </Paper>

                        {/* Drill-down List */}
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
                                                    <Typography variant="subtitle1" fontWeight="bold">{group.date}</Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        {group.items.length}건의 작업
                                                    </Typography>
                                                </Box>
                                                <Stack direction="row" alignItems="center" spacing={1}>
                                                    <Typography variant="subtitle1" fontWeight="bold" color="primary">
                                                        {group.totalCost.toLocaleString()}원
                                                    </Typography>
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
                                                                <Typography variant="caption" fontWeight="bold">
                                                                    {(item.good_quantity * (item.unit_price || 0)).toLocaleString()}원
                                                                </Typography>
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

            {/* Bottom Nav */}
            <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={10}>
                <BottomNavigation
                    showLabels
                    value={tab}
                    onChange={(event, newValue) => {
                        setTab(newValue);
                        if (newValue !== 0) {
                            setSelectedItem(null);
                            setSelectedPlan(null);
                        }
                    }}
                >
                    <BottomNavigationAction label="생산현황" icon={<AssignmentIcon />} />
                    <BottomNavigationAction label="내 실적" icon={<BarChartIcon />} />
                </BottomNavigation>
            </Paper>

            {/* Conflict Dialog */}
            <Dialog open={conflictOpen} onClose={() => setConflictOpen(false)}>
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
            </Dialog>
        </Box>
    );
};

export default MobileWorkLogPage;
