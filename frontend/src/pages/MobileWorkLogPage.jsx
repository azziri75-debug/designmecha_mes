import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemText,
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
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions
} from '@mui/material';
import {
    Assignment as AssignmentIcon,
    AddCircle as AddCircleIcon,
    BarChart as BarChartIcon,
    PhotoCamera as PhotoCameraIcon,
    Save as SaveIcon,
    Delete as DeleteIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const MobileWorkLogPage = () => {
    const { user } = useAuth();
    const [tab, setTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [assignedPlans, setAssignedPlans] = useState([]);
    const [myPerformance, setMyPerformance] = useState([]);

    // For Registration
    const [selectedItem, setSelectedItem] = useState(null);
    const [goodQty, setGoodQty] = useState('');
    const [badQty, setBadQty] = useState('0');
    const [note, setNote] = useState('');
    const [photos, setPhotos] = useState([]); // List of {name, url} or File objects

    useEffect(() => {
        if (tab === 0) fetchAssignedPlans();
        if (tab === 2) fetchMyPerformance();
    }, [tab]);

    const fetchAssignedPlans = async () => {
        setLoading(true);
        try {
            // Updated backend supports worker_id
            const res = await api.get(`/production/plans?worker_id=${user.id}`);
            // Flatten plans into items
            const items = [];
            res.data.forEach(plan => {
                plan.items.forEach(item => {
                    if (item.worker_id === user.id && item.status !== 'COMPLETED') {
                        items.push({ ...item, plan_no: plan.order?.order_no || plan.stock_production?.production_no || '-' });
                    }
                });
            });
            setAssignedPlans(items);
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

        // In a real app, we'd upload these to a server and get URLs.
        // For now, we store them as temporary Blobs or similar if we were mocking,
        // but here we should handle actual upload if possible or just store files.
        setPhotos([...photos, ...files]);
    };

    const handleSaveLog = async () => {
        if (!selectedItem || !goodQty) {
            alert("공정과 수량을 입력해주세요.");
            return;
        }

        setLoading(true);
        try {
            // 1. Upload photos first (Mocking here, but usually one by one)
            const uploadedPhotos = [];
            for (const file of photos) {
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData); // Corrected endpoint
                uploadedPhotos.push(uploadRes.data);
            }

            // 2. Save Work Log
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
            setTab(0);
        } catch (err) {
            console.error(err);
            alert("저장 실패");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ pb: 7, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
            {/* Header */}
            <Paper elevation={1} sx={{ p: 2, position: 'sticky', top: 0, zIndex: 10, borderRadius: 0 }}>
                <Typography variant="h6" fontWeight="bold">
                    {tab === 0 ? "내 작업 목록" : tab === 1 ? "작업 실적 등록" : "내 실적 확인"}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                    {user.name} ({user.role || '작업자'})
                </Typography>
            </Paper>

            <Box sx={{ p: 2 }}>
                {tab === 0 && (
                    <Box>
                        {loading && assignedPlans.length === 0 ? (
                            <Box sx={{ textAlign: 'center', mt: 4 }}><CircularProgress size={24} /></Box>
                        ) : assignedPlans.length === 0 ? (
                            <Typography sx={{ textAlign: 'center', mt: 4, color: 'textSecondary' }}>
                                할당된 작업이 없습니다.
                            </Typography>
                        ) : (
                            <Stack spacing={2}>
                                {assignedPlans.map(item => (
                                    <Card key={item.id} sx={{ borderRadius: 2 }} onClick={() => { setSelectedItem(item); setTab(1); }}>
                                        <CardContent>
                                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                                <Box>
                                                    <Typography variant="caption" color="primary" fontWeight="bold">
                                                        {item.plan_no}
                                                    </Typography>
                                                    <Typography variant="subtitle1" fontWeight="bold">
                                                        {item.process_name}
                                                    </Typography>
                                                    <Typography variant="body2" color="textSecondary">
                                                        {item.product?.name}
                                                    </Typography>
                                                </Box>
                                                <Chip
                                                    label={`${item.completed_quantity || 0} / ${item.quantity}`}
                                                    size="small"
                                                    color="secondary"
                                                    variant="outlined"
                                                />
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                ))}
                            </Stack>
                        )}
                    </Box>
                )}

                {tab === 1 && (
                    <Box component={Paper} sx={{ p: 3, borderRadius: 2 }}>
                        {selectedItem ? (
                            <Stack spacing={3}>
                                <Box sx={{ p: 2, backgroundColor: '#e8f0fe', borderRadius: 1 }}>
                                    <Typography variant="caption" color="textSecondary">선택된 작업</Typography>
                                    <Typography variant="subtitle1" fontWeight="bold">{selectedItem.process_name}</Typography>
                                    <Typography variant="body2">{selectedItem.product?.name}</Typography>
                                </Box>

                                <TextField
                                    label="양품 수량"
                                    type="number"
                                    value={goodQty}
                                    onChange={e => setGoodQty(e.target.value)}
                                    fullWidth
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
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography color="textSecondary">
                                    '내 작업 목록'에서 작업을 선택해주세요.
                                </Typography>
                                <Button sx={{ mt: 2 }} onClick={() => setTab(0)}>작업 목록 가기</Button>
                            </Box>
                        )}
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
                                            <Typography variant="caption" color="textSecondary">
                                                양품: {log.good_quantity} / 불량: {log.bad_quantity}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                ))}
                                {myPerformance.length === 0 && (
                                    <Typography sx={{ textAlign: 'center', mt: 4, color: 'textSecondary' }}>
                                        실적 내역이 없습니다.
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
                    onChange={(event, newValue) => setTab(newValue)}
                >
                    <BottomNavigationAction label="작업목록" icon={<AssignmentIcon />} />
                    <BottomNavigationAction label="실적등록" icon={<AddCircleIcon />} />
                    <BottomNavigationAction label="내 실적" icon={<BarChartIcon />} />
                </BottomNavigation>
            </Paper>
        </Box>
    );
};

export default MobileWorkLogPage;
