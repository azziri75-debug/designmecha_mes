import React, { useState, useEffect } from 'react';
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
    InputAdornment
} from '@mui/material';
import {
    Assignment as AssignmentIcon,
    AddCircle as AddCircleIcon,
    BarChart as BarChartIcon,
    PhotoCamera as PhotoCameraIcon,
    Save as SaveIcon,
    Delete as DeleteIcon,
    ArrowBack as ArrowBackIcon,
    Search as SearchIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const MobileWorkLogPage = () => {
    const { user } = useAuth();
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(false);

    // Data lists
    const [allPlans, setAllPlans] = useState([]);
    const [myPerformance, setMyPerformance] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Navigation/Selection State
    const [selectedPlan, setSelectedPlan] = useState(null); // When a plan is selected, show its processes
    const [selectedItem, setSelectedItem] = useState(null); // When a process is selected, show registration form

    // Registration Form
    const [goodQty, setGoodQty] = useState('');
    const [badQty, setBadQty] = useState('0');
    const [note, setNote] = useState('');
    const [photos, setPhotos] = useState([]);

    useEffect(() => {
        if (tab === 0) fetchAllPlans();
        if (tab === 2) fetchMyPerformance();
    }, [tab]);

    const fetchAllPlans = async () => {
        setLoading(true);
        try {
            // Fetch all plans for production status browsing
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
            const res = await api.get(`/production/performance/workers/${user.id}/details`);
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

    const handleSaveLog = async () => {
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
                const uploadRes = await api.post('/upload', formData);
                uploadedPhotos.push(uploadRes.data);
            }

            await api.post('/production/work-logs', {
                work_date: new Date().toISOString().split('T')[0],
                worker_id: user.id,
                note: note,
                attachment_file: uploadedPhotos,
                items: [{
                    plan_item_id: selectedItem.id,
                    worker_id: user.id,
                    good_quantity: parseInt(goodQty),
                    bad_quantity: parseInt(badQty),
                    note: note
                }]
            });

            alert("저장되었습니다.");
            setSelectedItem(null);
            setGoodQty('');
            setBadQty('0');
            setNote('');
            setPhotos([]);
            setTab(0); // Back to status
            fetchAllPlans(); // Refresh
        } catch (err) {
            console.error(err);
            alert("저장 실패");
        } finally {
            setLoading(false);
        }
    };

    const filteredPlans = allPlans.filter(p => {
        const orderNo = p.order?.order_no || p.stock_production?.production_no || '';
        const productName = p.order?.items?.[0]?.product?.name || p.stock_production?.product?.name || '';
        return orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
            productName.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <Box sx={{ pb: 7, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
            {/* Header */}
            <Paper elevation={1} sx={{ p: 2, position: 'sticky', top: 0, zIndex: 10, borderRadius: 0 }}>
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
                        {tab === 0 ? (selectedItem ? "실적 등록" : selectedPlan ? "공정 선택" : "생산 현황") :
                            tab === 1 ? "간편 실적 등록" : "내 실적 확인"}
                    </Typography>
                </Stack>
                <Typography variant="caption" color="textSecondary">
                    {user.name} ({user.role || '작업자'})
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
                                    <Stack spacing={2}>
                                        {filteredPlans.map(plan => {
                                            const orderNo = plan.order?.order_no || plan.stock_production?.production_no || '-';
                                            const productName = plan.items?.[0]?.product?.name || '-';
                                            const partnerName = plan.order?.partner?.name || plan.stock_production?.partner?.name || '-';

                                            return (
                                                <Card key={plan.id} sx={{ borderRadius: 2 }} onClick={() => setSelectedPlan(plan)}>
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
                                                                    {partnerName}
                                                                </Typography>
                                                            </Box>
                                                            <Chip
                                                                label={plan.status}
                                                                size="small"
                                                                color={plan.status === 'COMPLETED' ? 'success' : 'primary'}
                                                                variant="outlined"
                                                            />
                                                        </Stack>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                        {filteredPlans.length === 0 && (
                                            <Typography sx={{ textAlign: 'center', mt: 4, color: 'textSecondary' }}>
                                                검색 결과가 없습니다.
                                            </Typography>
                                        )}
                                    </Stack>
                                )}
                            </Box>
                        ) : selectedPlan && !selectedItem ? (
                            /* Step 2: Select Process from Plan */
                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 2, px: 1 }}>
                                    수주 {selectedPlan.order?.order_no || selectedPlan.stock_production?.production_no} - 공정 선택
                                </Typography>
                                <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                    <List disablePadding>
                                        {selectedPlan.items.map((item, idx) => (
                                            <React.Fragment key={item.id}>
                                                <ListItemButton onClick={() => setSelectedItem(item)}>
                                                    <ListItemText
                                                        primary={item.process_name}
                                                        secondary={`수량: ${item.completed_quantity || 0} / ${item.quantity} | 타입: ${item.course_type}`}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        label={item.status}
                                                        color={item.status === 'COMPLETED' ? 'success' : 'default'}
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
                            <Box component={Paper} sx={{ p: 3, borderRadius: 2 }}>
                                <Stack spacing={3}>
                                    <Box sx={{ p: 2, backgroundColor: '#e8f0fe', borderRadius: 1 }}>
                                        <Typography variant="caption" color="textSecondary">선택된 공정</Typography>
                                        <Typography variant="subtitle1" fontWeight="bold">{selectedItem.process_name}</Typography>
                                        <Typography variant="body2">{selectedItem.product?.name}</Typography>
                                    </Box>

                                    <TextField
                                        label="양품 수량"
                                        type="number"
                                        value={goodQty}
                                        onChange={e => setGoodQty(e.target.value)}
                                        fullWidth
                                        autoFocus
                                    />
                                    <TextField
                                        label="불량 수량"
                                        type="number"
                                        value={badQty}
                                        onChange={e => setBadQty(e.target.value)}
                                        fullWidth
                                    />
                                    <TextField
                                        label="비고"
                                        multiline
                                        rows={2}
                                        value={note}
                                        onChange={e => setNote(e.target.value)}
                                        fullWidth
                                    />

                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>사진 첨부 ({photos.length}/5)</Typography>
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            {photos.map((p, idx) => (
                                                <Box key={idx} sx={{ position: 'relative', width: 60, height: 60 }}>
                                                    <img
                                                        src={URL.createObjectURL(p)}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                                                        alt="capture"
                                                    />
                                                    <IconButton
                                                        size="small"
                                                        sx={{ position: 'absolute', top: -10, right: -10, backgroundColor: 'rgba(255,255,255,0.8)' }}
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
                                                    sx={{ width: 60, height: 60, borderStyle: 'dashed' }}
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
                                        onClick={handleSaveLog}
                                        disabled={loading}
                                    >
                                        {loading ? "저장 중..." : "실적 저장"}
                                    </Button>
                                    <Button variant="text" onClick={() => setSelectedItem(null)}>
                                        취소
                                    </Button>
                                </Stack>
                            </Box>
                        )}
                    </Box>
                )}

                {tab === 1 && (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <Typography variant="body1" color="textSecondary">
                            '생산 현황' 메뉴에서 계획을 선택하여 실적을 등록해주세요.
                        </Typography>
                        <Button variant="contained" sx={{ mt: 3 }} onClick={() => setTab(0)}>
                            생산 현황 보러가기
                        </Button>
                    </Box>
                )}

                {tab === 2 && (
                    <Box>
                        {loading && myPerformance.length === 0 ? (
                            <Box sx={{ textAlign: 'center', mt: 4 }}><CircularProgress size={24} /></Box>
                        ) : (
                            <Stack spacing={2}>
                                {myPerformance.map(log => (
                                    <Card key={log.id} variant="outlined" sx={{ borderRadius: 2 }}>
                                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="body2" fontWeight="bold">
                                                    {log.work_log?.work_date}
                                                </Typography>
                                                <Typography variant="body2" color="primary" fontWeight="bold">
                                                    {(log.good_quantity * (log.unit_price || 0)).toLocaleString()}원
                                                </Typography>
                                            </Stack>
                                            <Typography variant="subtitle2" sx={{ mt: 0.5 }}>
                                                {log.plan_item?.process_name}
                                            </Typography>
                                            <Typography variant="body2" color="textSecondary">
                                                {log.plan_item?.product?.name}
                                            </Typography>
                                            <Typography variant="caption" color="textSecondary">
                                                양품: {log.good_quantity} / 불량: {log.bad_quantity}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                ))}
                                {myPerformance.length === 0 && (
                                    <Typography sx={{ textAlign: 'center', mt: 4, color: 'textSecondary' }}>
                                        기록된 실적이 없습니다.
                                    </Typography>
                                )}
                            </Stack>
                        )}
                    </Box>
                )}
            </Box>

            {/* Bottom Nav */}
            <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={3}>
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
                    <BottomNavigationAction label="실적등록" icon={<AddCircleIcon />} />
                    <BottomNavigationAction label="내 실적" icon={<BarChartIcon />} />
                </BottomNavigation>
            </Paper>
        </Box>
    );
};

export default MobileWorkLogPage;
