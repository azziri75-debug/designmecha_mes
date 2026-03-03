import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Stack,
    CircularProgress,
    Card,
    CardContent,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Avatar,
    Divider
} from '@mui/material';
import {
    EventNote as EventNoteIcon,
    BeachAccess as VacationIcon,
    Timer as TimerIcon,
    DirectionsRun as OutingIcon,
    WorkHistory as OvertimeIcon,
    Info as InfoIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

const AttendancePage = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState(null);
    const [staffList, setStaffList] = useState([]);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [selectedWorkerId, setSelectedWorkerId] = useState(user?.id);

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
        ANNUAL: { label: '연차', color: '#3b82f6', icon: <VacationIcon fontSize="small" /> },
        HALF_DAY: { label: '반차', color: '#60a5fa', icon: <VacationIcon fontSize="small" /> },
        SICK: { label: '병가', color: '#f87171', icon: <InfoIcon fontSize="small" /> },
        EARLY_LEAVE: { label: '조퇴', color: '#a855f7', icon: <TimerIcon fontSize="small" /> },
        OUTING: { label: '외출', color: '#10b981', icon: <OutingIcon fontSize="small" /> },
        OVERTIME: { label: '연장/특근', color: '#f59e0b', icon: <OvertimeIcon fontSize="small" /> },
        SPECIAL: { label: '특별휴가', color: '#ec4899', icon: <VacationIcon fontSize="small" /> }
    };

    return (
        <Box sx={{ p: 4, maxWidth: 1200, mx: 'auto' }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                <Typography variant="h5" fontWeight="bold" sx={{ mr: 'auto' }}>근태 및 휴가 관리</Typography>

                <Stack direction="row" spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                        <Select
                            value={year}
                            onChange={e => setYear(e.target.value)}
                            sx={{ bgcolor: '#fff' }}
                        >
                            {[2024, 2025, 2026].map(y => <MenuItem key={y} value={y}>{y}년</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                        <Select
                            value={month}
                            onChange={e => setMonth(e.target.value)}
                            displayEmpty
                            sx={{ bgcolor: '#fff' }}
                        >
                            <MenuItem value="">전체 월</MenuItem>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <MenuItem key={m} value={m}>{m}월</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>

                {user?.user_type === 'ADMIN' && (
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel id="worker-select-label">대상 사원 선택</InputLabel>
                        <Select
                            labelId="worker-select-label"
                            value={selectedWorkerId}
                            label="대상 사원 선택"
                            onChange={e => setSelectedWorkerId(e.target.value)}
                            sx={{
                                bgcolor: '#fff',
                                '& .MuiSelect-select': { color: '#000' }
                            }}
                        >
                            {staffList.map(s => (
                                <MenuItem key={s.id} value={s.id}>{s.name} ({s.role})</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </Stack>

            {loading && !summary ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : summary ? (
                <Stack spacing={4}>
                    {/* Summary Cards */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                        <Card sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <CardContent>
                                <Typography variant="caption" color="textSecondary" fontWeight="bold">연차 사용</Typography>
                                <Typography variant="h4" fontWeight="bold" sx={{ color: '#1e40af', mt: 1 }}>
                                    {summary.annual_used + (summary.half_day_used * 0.5)}일
                                </Typography>
                            </CardContent>
                        </Card>
                        <Card sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <CardContent>
                                <Typography variant="caption" color="textSecondary" fontWeight="bold">조퇴/외출</Typography>
                                <Typography variant="h4" fontWeight="bold" sx={{ color: '#5b21b6', mt: 1 }}>
                                    {summary.early_leave_count + summary.outing_count}건
                                </Typography>
                            </CardContent>
                        </Card>
                        <Card sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <CardContent>
                                <Typography variant="caption" color="textSecondary" fontWeight="bold">연장/특근 시간</Typography>
                                <Typography variant="h4" fontWeight="bold" sx={{ color: '#92400e', mt: 1 }}>
                                    {summary.overtime_count}건
                                </Typography>
                            </CardContent>
                        </Card>
                        <Card sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <CardContent>
                                <Typography variant="caption" color="textSecondary" fontWeight="bold">병가/기타</Typography>
                                <Typography variant="h4" fontWeight="bold" sx={{ color: '#b91c1c', mt: 1 }}>
                                    {summary.sick_used}건
                                </Typography>
                            </CardContent>
                        </Card>
                    </Box>

                    {/* Detailed Records Table */}
                    <Box>
                        <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                            {summary.year}년 근태 상세 기록
                        </Typography>
                        <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <Table sx={{ minWidth: 650 }}>
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        <TableCell align="center" width={80}>No.</TableCell>
                                        <TableCell align="center" width={150}>날짜</TableCell>
                                        <TableCell align="center" width={120}>분류</TableCell>
                                        <TableCell>상세 내용</TableCell>
                                        <TableCell align="center" width={120}>상태</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {summary.records.length > 0 ? (
                                        summary.records.map((r, index) => {
                                            const cat = CATEGORY_MAP[r.category] || { label: r.category, color: '#6b7280', icon: <EventNoteIcon fontSize="small" /> };
                                            return (
                                                <TableRow key={r.id} hover>
                                                    <TableCell align="center">{index + 1}</TableCell>
                                                    <TableCell align="center">{r.date}</TableCell>
                                                    <TableCell align="center">
                                                        <Chip
                                                            icon={cat.icon}
                                                            label={cat.label}
                                                            size="small"
                                                            sx={{
                                                                bgcolor: `${cat.color}15`,
                                                                color: cat.color,
                                                                fontWeight: 'bold',
                                                                '& .MuiChip-icon': { color: cat.color }
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{r.content || '기록 없음'}</TableCell>
                                                    <TableCell align="center">
                                                        <Chip
                                                            label={r.status === 'COMPLETED' ? '완료' : '진행중'}
                                                            size="small"
                                                            color={r.status === 'COMPLETED' ? 'success' : 'default'}
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                                                <Typography color="textSecondary">기록된 근태 내역이 없습니다.</Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                </Stack>
            ) : (
                <Box sx={{ p: 8, textAlign: 'center' }}>
                    <Typography color="textSecondary">데이터를 불러올 수 없습니다.</Typography>
                </Box>
            )}
        </Box>
    );
};

export default AttendancePage;
