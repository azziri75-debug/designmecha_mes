import React, { useState, useEffect, useCallback } from 'react';
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
    Chip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    EventNote as EventNoteIcon,
    BeachAccess as VacationIcon,
    Timer as TimerIcon,
    DirectionsRun as OutingIcon,
    WorkHistory as OvertimeIcon,
    Logout as LogoutIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

const DOC_TYPE_META = {
    VACATION: { label: '휴가원', color: '#3b82f6', Icon: VacationIcon },
    EARLY_LEAVE: { label: '조퇴/외출원', color: '#a855f7', Icon: TimerIcon },
    OVERTIME: { label: '특근/야근', color: '#f59e0b', Icon: OvertimeIcon },
};

const MobileAttendancePage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [staffList, setStaffList] = useState([]);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [selectedUserId, setSelectedUserId] = useState(null); // null = 본인
    // 마운트 시 summary를 null로 초기화하여 이전 캐시 방지
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // ADMIN 사원 목록 로드
    useEffect(() => {
        if (user?.user_type === 'ADMIN') {
            api.get('/basics/staff/')
                .then(res => setStaffList(res.data))
                .catch(err => console.error('Staff list error:', err));
        }
    }, [user]);

    // 근태 집계 조회 — 의존성이 바뀔 때마다 항상 null로 초기화 후 재조회
    const fetchSummary = useCallback(async () => {
        if (!user) return;
        setSummary(null);   // 이전 데이터 즉시 지움 (캐시 방지)
        setError(null);
        setLoading(true);
        try {
            const targetId = selectedUserId || user.id;
            const params = new URLSearchParams({ year, user_id: targetId });
            const res = await api.get(`/hr/attendance/summary?${params.toString()}`);
            setSummary(res.data);
        } catch (err) {
            console.error('Attendance fetch error:', err);
            setError(err?.response?.data?.detail || '데이터 로드 실패');
        } finally {
            setLoading(false);
        }
    }, [user, year, selectedUserId]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f8f9fa', overflow: 'hidden' }}>
            {/* 헤더 */}
            <AppBar position="static" sx={{ bgcolor: '#fff', color: '#000', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <Toolbar variant="dense">
                    <IconButton edge="start" color="inherit" onClick={() => navigate(-1)}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography sx={{ ml: 1.5, flex: 1, fontWeight: 'bold', fontSize: '1rem', color: '#111' }}>
                        근태 및 휴가 현황
                    </Typography>
                    <IconButton color="inherit" onClick={() => {
                        if (window.confirm('로그아웃 하시겠습니까?')) { logout(); navigate('/login'); }
                    }}>
                        <LogoutIcon />
                    </IconButton>
                </Toolbar>
            </AppBar>

            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                {/* 필터 패널 */}
                <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
                    <Stack direction="row" spacing={1} sx={{ mb: user?.user_type === 'ADMIN' ? 1.5 : 0 }}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>연도</InputLabel>
                            <Select value={year} label="연도" onChange={e => setYear(e.target.value)}>
                                {yearOptions.map(y => <MenuItem key={y} value={y}>{y}년</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>

                    {user?.user_type === 'ADMIN' && (
                        <FormControl size="small" fullWidth>
                            <InputLabel>대상 사원</InputLabel>
                            <Select
                                value={selectedUserId ?? user.id}
                                label="대상 사원"
                                onChange={e => setSelectedUserId(e.target.value)}
                            >
                                {staffList.map(s => (
                                    <MenuItem key={s.id} value={s.id}>{s.name} ({s.role})</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                </Paper>

                {/* 에러 */}
                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

                {/* 로딩 */}
                {loading && (
                    <Box sx={{ textAlign: 'center', mt: 6 }}>
                        <CircularProgress size={28} />
                    </Box>
                )}

                {/* 콘텐츠 */}
                {!loading && summary && (
                    <Stack spacing={2}>
                        {/* 사원 정보 헤더 */}
                        <Typography variant="caption" color="textSecondary" sx={{ px: 0.5 }}>
                            {summary.year}년 · <strong>{summary.user_name}</strong> 근태 현황
                        </Typography>

                        {/* 요약 카드 */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                            <Card sx={{ borderRadius: 3, bgcolor: '#eff6ff', border: '1px solid #dbeafe', boxShadow: 'none' }}>
                                <CardContent sx={{ p: 2, textAlign: 'center', '&:last-child': { pb: 2 } }}>
                                    <VacationIcon sx={{ color: '#3b82f6', fontSize: 20, mb: 0.5 }} />
                                    <Typography variant="caption" color="#3b82f6" fontWeight="bold" display="block">
                                        휴가 사용 (연차+반차)
                                    </Typography>
                                    <Typography variant="h5" fontWeight="bold" color="#1e40af">
                                        {summary.total_vacation_days}일
                                    </Typography>
                                </CardContent>
                            </Card>

                            <Card sx={{ borderRadius: 3, bgcolor: '#f5f3ff', border: '1px solid #ede9fe', boxShadow: 'none' }}>
                                <CardContent sx={{ p: 2, textAlign: 'center', '&:last-child': { pb: 2 } }}>
                                    <TimerIcon sx={{ color: '#a855f7', fontSize: 20, mb: 0.5 }} />
                                    <Typography variant="caption" color="#a855f7" fontWeight="bold" display="block">
                                        조퇴 / 외출
                                    </Typography>
                                    <Typography variant="h5" fontWeight="bold" color="#5b21b6">
                                        {summary.total_leave_outing_hours}h
                                    </Typography>
                                </CardContent>
                            </Card>

                            <Card sx={{ borderRadius: 3, bgcolor: '#fffbeb', border: '1px solid #fef3c7', boxShadow: 'none', gridColumn: 'span 2' }}>
                                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Stack direction="row" spacing={0.8} alignItems="center">
                                            <OvertimeIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                                            <Typography variant="subtitle2" color="#92400e" fontWeight="bold">
                                                야근 / 특근
                                            </Typography>
                                        </Stack>
                                        <Typography variant="h5" fontWeight="bold" color="#92400e">
                                            {summary.total_overtime_hours}h
                                        </Typography>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Box>

                        {/* 상세 결재 목록 */}
                        <Box sx={{ mt: 1 }}>
                            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1, px: 0.5, color: '#374151' }}>
                                결재 완료 내역 ({summary.documents.length}건)
                            </Typography>
                            <Paper sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                                <List disablePadding>
                                    {summary.documents.length > 0 ? (
                                        summary.documents.map((doc, idx) => {
                                            const meta = DOC_TYPE_META[doc.doc_type] || {
                                                label: doc.doc_type, color: '#6b7280', Icon: EventNoteIcon
                                            };
                                            const { Icon } = meta;
                                            return (
                                                <React.Fragment key={doc.id}>
                                                    <ListItem sx={{ py: 1.5 }}>
                                                        <Box sx={{
                                                            mr: 1.5, p: 1, borderRadius: 2,
                                                            bgcolor: `${meta.color}18`, color: meta.color,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0
                                                        }}>
                                                            <Icon fontSize="small" />
                                                        </Box>
                                                        <ListItemText
                                                            primary={
                                                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                                                    {/* 신청 적용일 (굵게, 강조) */}
                                                                    <Typography variant="body2" fontWeight="bold" color="#111">
                                                                        {doc.date || '-'}
                                                                    </Typography>
                                                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                                                        <Chip
                                                                            label={meta.label}
                                                                            size="small"
                                                                            sx={{ height: 18, fontSize: '10px', bgcolor: meta.color, color: '#fff', fontWeight: 'bold' }}
                                                                        />
                                                                        <Chip
                                                                            label={`${doc.applied_value}${doc.applied_unit}`}
                                                                            size="small"
                                                                            variant="outlined"
                                                                            sx={{ height: 18, fontSize: '10px', borderColor: meta.color, color: meta.color }}
                                                                        />
                                                                    </Stack>
                                                                </Stack>
                                                            }
                                                            secondary={
                                                                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.3 }}>
                                                                    {doc.title}
                                                                </Typography>
                                                            }
                                                        />
                                                        <Chip
                                                            label="완료"
                                                            size="small"
                                                            color="success"
                                                            variant="outlined"
                                                            sx={{ fontSize: '10px', flexShrink: 0, ml: 0.5 }}
                                                        />
                                                    </ListItem>
                                                    {idx < summary.documents.length - 1 && <Divider sx={{ mx: 2 }} />}
                                                </React.Fragment>
                                            );
                                        })
                                    ) : (
                                        <Box sx={{ p: 4, textAlign: 'center' }}>
                                            <Typography variant="body2" color="textSecondary">
                                                {summary.year}년 결재 완료된 근태 내역이 없습니다.
                                            </Typography>
                                        </Box>
                                    )}
                                </List>
                            </Paper>
                        </Box>
                    </Stack>
                )}

                {!loading && !summary && !error && (
                    <Box sx={{ p: 6, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">데이터를 불러오지 못했습니다.</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default MobileAttendancePage;
