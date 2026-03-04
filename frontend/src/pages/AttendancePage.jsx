import React, { useState, useEffect, useCallback } from 'react';
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
    Select,
    MenuItem,
    Chip,
    Alert,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
    BeachAccess as VacationIcon,
    Timer as TimerIcon,
    WorkHistory as OvertimeIcon,
    EventNote as EventNoteIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

// ─── 문서 종류별 메타데이터 ──────────────────────────────────────────────────
const DOC_TYPE_META = {
    VACATION: { label: '휴가원', color: '#3b82f6' },
    EARLY_LEAVE: { label: '조퇴/외출원', color: '#a855f7' },
    OVERTIME: { label: '특근/야근신청서', color: '#f59e0b' },
};

// ─── 요약 카드 컴포넌트 ──────────────────────────────────────────────────────
const SummaryCard = ({ icon, label, value, unit, color }) => (
    <Card
        sx={{
            height: '100%',
            borderRadius: 3,
            boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
            borderTop: `4px solid ${color}`,
            minWidth: 160,
        }}
    >
        <CardContent sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Box sx={{ color, display: 'flex' }}>{icon}</Box>
                <Typography variant="caption" color="textSecondary" fontWeight="bold" sx={{ whiteSpace: 'nowrap' }}>
                    {label}
                </Typography>
            </Stack>
            <Typography variant="h3" fontWeight="bold" sx={{ color, lineHeight: 1.1 }}>
                {value}
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                {unit}
            </Typography>
        </CardContent>
    </Card>
);

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
const AttendancePage = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState(null);
    const [staffList, setStaffList] = useState([]);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [selectedUserId, setSelectedUserId] = useState(null); // null = 본인

    // 사원 목록 조회 (ADMIN 전용)
    useEffect(() => {
        if (user?.user_type === 'ADMIN') {
            api.get('/basics/staff/')
                .then(res => setStaffList(res.data))
                .catch(err => console.error('Staff list fetch error:', err));
        }
    }, [user]);

    // 근태 요약 조회
    const fetchSummary = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            const targetId = selectedUserId || user.id;
            params.append('user_id', targetId);

            const res = await api.get(`/hr/attendance/summary?${params.toString()}`);
            setSummary(res.data);
        } catch (err) {
            console.error('Attendance summary fetch error:', err);
            setError(err?.response?.data?.detail || '데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    }, [user, year, selectedUserId]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    // 연도 목록
    const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1300, mx: 'auto' }}>
            {/* ── 헤더 ── */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                sx={{ mb: 4 }}
            >
                <Typography variant="h5" fontWeight="bold" sx={{ mr: 'auto' }}>
                    근태 및 휴가 관리
                </Typography>

                {/* 연도 선택 */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: 0.5 }}>
                        연도
                    </Typography>
                    <Select
                        size="small"
                        value={year}
                        onChange={e => setYear(e.target.value)}
                        sx={{ bgcolor: '#fff', minWidth: 110, borderRadius: 1 }}
                    >
                        {yearOptions.map(y => (
                            <MenuItem key={y} value={y}>{y}년</MenuItem>
                        ))}
                    </Select>
                </Box>

                {/* 사원 선택 (ADMIN 전용) */}
                {user?.user_type === 'ADMIN' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: 0.5 }}>
                            대상 사원
                        </Typography>
                        <Select
                            size="small"
                            value={selectedUserId ?? user.id}
                            onChange={e => setSelectedUserId(e.target.value)}
                            sx={{ bgcolor: '#fff', minWidth: 200, borderRadius: 1 }}
                        >
                            {staffList.map(s => (
                                <MenuItem key={s.id} value={s.id}>
                                    {s.name} {s.role ? `(${s.role})` : ''}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>
                )}
            </Stack>

            {/* ── 로딩 상태 ── */}
            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                    <CircularProgress />
                </Box>
            )}

            {/* ── 에러 ── */}
            {!loading && error && (
                <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
            )}

            {/* ── 콘텐츠 ── */}
            {!loading && summary && (
                <Stack spacing={4}>
                    {/* ── 사원 표시 ── */}
                    <Typography variant="body1" color="textSecondary">
                        {summary.year}년 &nbsp;|&nbsp; <strong>{summary.user_name}</strong> 님의 근태 현황
                    </Typography>

                    {/* ── 요약 카드 ── */}
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                            <SummaryCard
                                icon={<VacationIcon />}
                                label="연간 누적 휴가 사용"
                                value={summary.total_vacation_days}
                                unit="일 (연차/반차 합산)"
                                color="#3b82f6"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <SummaryCard
                                icon={<TimerIcon />}
                                label="누적 외출 / 조퇴"
                                value={summary.total_leave_outing_hours}
                                unit="시간 (외출 + 조퇴 합산)"
                                color="#a855f7"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <SummaryCard
                                icon={<OvertimeIcon />}
                                label="누적 야근 / 특근"
                                value={summary.total_overtime_hours}
                                unit="시간 (특근 + 야근 합산)"
                                color="#f59e0b"
                            />
                        </Grid>
                    </Grid>

                    {/* ── 상세 리스트 ── */}
                    <Box>
                        <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                            결재 완료 근태 내역 ({summary.documents.length}건)
                        </Typography>
                        <TableContainer
                            component={Paper}
                            sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        >
                            <Table sx={{ minWidth: 600 }}>
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        <TableCell align="center" width={60}>No.</TableCell>
                                        <TableCell align="center" width={160}>신청 적용일</TableCell>
                                        <TableCell align="center" width={150}>기안 종류</TableCell>
                                        <TableCell>문서 제목</TableCell>
                                        <TableCell align="center" width={130}>적용 값</TableCell>
                                        <TableCell align="center" width={110}>상태</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {summary.documents.length > 0 ? (
                                        summary.documents.map((doc, idx) => {
                                            const meta = DOC_TYPE_META[doc.doc_type] || {
                                                label: doc.doc_type,
                                                color: '#6b7280',
                                            };
                                            return (
                                                <TableRow key={doc.id} hover>
                                                    <TableCell align="center">{idx + 1}</TableCell>
                                                    <TableCell align="center">
                                                        <Typography variant="body2">{doc.date || '-'}</Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Chip
                                                            icon={<EventNoteIcon fontSize="small" />}
                                                            label={meta.label}
                                                            size="small"
                                                            sx={{
                                                                bgcolor: `${meta.color}18`,
                                                                color: meta.color,
                                                                fontWeight: 'bold',
                                                                '& .MuiChip-icon': { color: meta.color },
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight="bold" color="#1a1a2e">{doc.title}</Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Typography
                                                            variant="body2"
                                                            fontWeight="bold"
                                                            sx={{ color: meta.color }}
                                                        >
                                                            {doc.applied_value} {doc.applied_unit}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Chip
                                                            label="결재 완료"
                                                            size="small"
                                                            color="success"
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                                <Typography color="textSecondary">
                                                    {summary.year}년에 결재 완료된 근태 내역이 없습니다.
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                </Stack>
            )}

            {/* ── 데이터 없는 경우 ── */}
            {!loading && !summary && !error && (
                <Box sx={{ p: 8, textAlign: 'center' }}>
                    <Typography color="textSecondary">데이터를 불러올 수 없습니다.</Typography>
                </Box>
            )}
        </Box>
    );
};

export default AttendancePage;
