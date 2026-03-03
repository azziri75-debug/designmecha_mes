import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemText,
    Divider,
    Stack,
    CircularProgress,
    Card,
    CardContent,
    IconButton,
    AppBar,
    Toolbar,
    Avatar,
    Chip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    EventNote as EventNoteIcon,
    BeachAccess as VacationIcon,
    Timer as TimerIcon,
    DirectionsRun as OutingIcon,
    WorkHistory as OvertimeIcon,
    Info as InfoIcon,
    Logout as LogoutIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

const MobileAttendancePage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [staffList, setStaffList] = useState([]);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [selectedWorkerId, setSelectedWorkerId] = useState(user?.id);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) return;
        fetchAttendanceSummary();
        if (user.user_type === 'ADMIN') {
            fetchStaffList();
        }
    }, [selectedWorkerId, year, month]);

    const fetchAttendanceSummary = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (year) queryParams.append('year', year);
            if (month) queryParams.append('month', month);
            if (user.user_type === 'ADMIN' && selectedWorkerId !== user.id) {
                queryParams.append('worker_id', selectedWorkerId);
            }

            const res = await api.get(`/basics/staff/me/attendance-summary?${queryParams.toString()}`);
            setSummary(res.data);
        } catch (err) {
            console.error('Attendance fetch error:', err);
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

    const CATEGORY_MAP = {
        ANNUAL: { label: '연차', color: '#3b82f6', icon: <VacationIcon /> },
        HALF_DAY: { label: '반차', color: '#60a5fa', icon: <VacationIcon /> },
        SICK: { label: '병가', color: '#f87171', icon: <InfoIcon /> },
        EARLY_LEAVE: { label: '조퇴', color: '#a855f7', icon: <TimerIcon /> },
        OUTING: { label: '외출', color: '#10b981', icon: <OutingIcon /> },
        OVERTIME: { label: '연장/특근', color: '#f59e0b', icon: <OvertimeIcon /> },
        SPECIAL: { label: '특별휴가', color: '#ec4899', icon: <VacationIcon /> }
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: '#f8f9fa',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <AppBar position="static" sx={{ bgcolor: '#fff', color: '#000', elevation: 0, borderBottom: '1px solid #eee' }}>
                <Toolbar size="small">
                    <IconButton edge="start" color="inherit" onClick={() => navigate(-1)}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography sx={{ ml: 2, flex: 1, fontWeight: 'bold' }}>
                        근태 및 휴가 현황
                    </Typography>
                    <IconButton color="inherit" onClick={() => {
                        if (window.confirm("로그아웃 하시겠습니까?")) {
                            logout();
                            navigate('/login');
                        }
                    }}>
                        <LogoutIcon />
                    </IconButton>
                </Toolbar>
            </AppBar>

            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
                    <Stack direction="row" spacing={1} sx={{ mb: user.user_type === 'ADMIN' ? 1.5 : 0 }}>
                        <FormControl size="small" fullWidth>
                            <Select
                                value={year}
                                onChange={e => setYear(e.target.value)}
                            >
                                {[2024, 2025, 2026].map(y => <MenuItem key={y} value={y}>{y}년</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                            <Select
                                value={month}
                                onChange={e => setMonth(e.target.value)}
                                displayEmpty
                            >
                                <MenuItem value="">전체 월</MenuItem>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <MenuItem key={m} value={m}>{m}월</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>

                    {user.user_type === 'ADMIN' && (
                        <FormControl size="small" fullWidth>
                            <InputLabel id="worker-select-label">대상 사원 선택</InputLabel>
                            <Select
                                labelId="worker-select-label"
                                value={selectedWorkerId}
                                label="대상 사원 선택"
                                onChange={e => setSelectedWorkerId(e.target.value)}
                            >
                                {staffList.map(s => (
                                    <MenuItem key={s.id} value={s.id}>{s.name} ({s.role})</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                </Paper>

                {loading && !summary ? (
                    <Box sx={{ textAlign: 'center', mt: 4 }}><CircularProgress size={24} /></Box>
                ) : summary ? (
                    <Stack spacing={2}>
                        {/* Summary Cards Grid */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                            <Card sx={{ borderRadius: 3, bgcolor: '#eff6ff', border: '1px solid #dbeafe', boxShadow: 'none' }}>
                                <CardContent sx={{ p: 2, textAlign: 'center' }}>
                                    <Typography variant="caption" color="primary" fontWeight="bold">연차/병가</Typography>
                                    <Typography variant="h5" fontWeight="bold" color="#1e40af">
                                        {(summary.annual_used || 0) + ((summary.half_day_used || 0) * 0.5) + (summary.sick_used || 0)}일
                                    </Typography>
                                </CardContent>
                            </Card>
                            <Card sx={{ borderRadius: 3, bgcolor: '#f5f3ff', border: '1px solid #ede9fe', boxShadow: 'none' }}>
                                <CardContent sx={{ p: 2, textAlign: 'center' }}>
                                    <Typography variant="caption" color="secondary" fontWeight="bold">조퇴/외출</Typography>
                                    <Typography variant="h5" fontWeight="bold" color="#5b21b6">{(summary.early_leave_hours || 0) + (summary.outing_hours || 0)}h</Typography>
                                </CardContent>
                            </Card>
                            <Card sx={{ borderRadius: 3, bgcolor: '#fffbeb', border: '1px solid #fef3c7', boxShadow: 'none', gridColumn: 'span 2' }}>
                                <CardContent sx={{ p: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                        <Typography variant="subtitle2" sx={{ color: '#92400e' }} fontWeight="bold">연장/특근 합계</Typography>
                                        <Typography variant="h5" fontWeight="bold" sx={{ color: '#92400e' }}>{(summary.overtime_hours || 0).toFixed(1)}h</Typography>
                                    </Stack>
                                    <Divider sx={{ my: 1.5, borderColor: '#fef3c7' }} />
                                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                                        <Box>
                                            <Typography variant="caption" color="textSecondary" display="block">연장</Typography>
                                            <Typography variant="body2" fontWeight="bold">{(summary.extension_hours || 0).toFixed(1)}h</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="textSecondary" display="block">야간</Typography>
                                            <Typography variant="body2" fontWeight="bold">{(summary.night_hours || 0).toFixed(1)}h</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="textSecondary" display="block">휴일</Typography>
                                            <Typography variant="body2" fontWeight="bold">{(summary.holiday_hours || 0).toFixed(1)}h</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="textSecondary" display="block">휴일야간</Typography>
                                            <Typography variant="body2" fontWeight="bold">{(summary.holiday_night_hours || 0).toFixed(1)}h</Typography>
                                        </Box>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Box>

                        {/* Detail List */}
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5, px: 1, color: '#4b5563' }}>
                                {summary.year}년 근태 상세 기록
                            </Typography>
                            <Paper sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                                <List disablePadding>
                                    {summary.records.length > 0 ? (
                                        summary.records.map((r, idx) => {
                                            const cat = CATEGORY_MAP[r.category] || { label: r.category, color: '#6b7280', icon: <EventNoteIcon /> };
                                            return (
                                                <React.Fragment key={r.id}>
                                                    <ListItem sx={{ py: 1.5 }}>
                                                        <Box sx={{
                                                            mr: 2,
                                                            p: 1,
                                                            borderRadius: 1.5,
                                                            bgcolor: `${cat.color}15`,
                                                            color: cat.color,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}>
                                                            {React.cloneElement(cat.icon, { fontSize: 'small' })}
                                                        </Box>
                                                        <ListItemText
                                                            primary={
                                                                <Stack direction="row" alignItems="center" spacing={1} justifyContent="space-between">
                                                                    <Typography variant="body2" fontWeight="bold">{r.date}</Typography>
                                                                    <Stack direction="row" spacing={0.5}>
                                                                        <Chip label={cat.label} size="small" sx={{ height: 18, fontSize: '10px', bgcolor: cat.color, color: '#fff', fontWeight: 'bold' }} />
                                                                        {r.hours > 0 && <Chip label={`${r.hours}h`} size="small" variant="outlined" sx={{ height: 18, fontSize: '10px' }} />}
                                                                    </Stack>
                                                                </Stack>
                                                            }
                                                            secondary={
                                                                <Box>
                                                                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                                                                        {r.content || '기록 없음'}
                                                                    </Typography>
                                                                    {r.category === 'OVERTIME' && (r.extension_hours > 0 || r.night_hours > 0 || r.holiday_hours > 0 || r.holiday_night_hours > 0) && (
                                                                        <Typography variant="caption" color="primary" sx={{ display: 'block', fontSize: '10px' }}>
                                                                            [연 {r.extension_hours}h, 야 {r.night_hours}h, 휴 {r.holiday_hours}h, 휴야 {r.holiday_night_hours}h]
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            }
                                                        />
                                                        <Chip
                                                            label={r.status === 'COMPLETED' ? '완료' : '진행중'}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{ fontSize: '10px' }}
                                                        />
                                                    </ListItem>
                                                    {idx < summary.records.length - 1 && <Divider sx={{ mx: 2 }} />}
                                                </React.Fragment>
                                            );
                                        })
                                    ) : (
                                        <Box sx={{ p: 4, textAlign: 'center', color: 'textSecondary' }}>
                                            <Typography variant="body2">기록된 근태 내역이 없습니다.</Typography>
                                        </Box>
                                    )}
                                </List>
                            </Paper>
                        </Box>
                    </Stack>
                ) : (
                    <Box sx={{ p: 4, textAlign: 'center', color: 'textSecondary' }}>
                        <Typography variant="body2">데이터를 불러오지 못했습니다.</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default MobileAttendancePage;
