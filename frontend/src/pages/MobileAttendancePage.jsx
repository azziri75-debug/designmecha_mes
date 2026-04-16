import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSSE } from '../hooks/useSSE';
import api from '../lib/api';
import {
    ArrowLeftIcon,
    ArrowRightOnRectangleIcon,
    ClockIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ListBulletIcon,
    ArrowPathIcon,
    HomeIcon
} from '@heroicons/react/24/outline';

import { 
    Tabs, 
    Tab, 
    Box as MuiBox, 
    Typography as MuiTypography,
    Divider
} from '@mui/material';

const MobileAttendancePage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [status, setStatus] = useState(null); // 'success' or 'error'
    const [activeTab, setActiveTab] = useState('action'); // action, history
    const [attendanceRecords, setAttendanceRecords] = useState([]);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    // Real-time clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleClockAction = async (type) => {
        setLoading(true);
        setMessage(null);
        setStatus(null);

        const endpoint = type === 'IN' ? '/hr/attendance/clock-in' : '/hr/attendance/clock-out';

        try {
            const res = await api.post(endpoint, { staff_id: user.id });
            const timeStr = new Date(res.data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const actionLabel = type === 'IN' ? '출근' : '퇴근';

            setMessage(`${timeStr} ${actionLabel} 완료`);
            setStatus('success');
        } catch (err) {
            console.error('Attendance API Error:', err);
            setMessage(err.response?.data?.detail || '기록 실패. 다시 시도해 주세요.');
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };

    const [approvalRecords, setApprovalRecords] = useState([]);

    const fetchMonthlyRecords = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const now = new Date();
            const res = await api.get(`/hr/attendance/${user.id}/monthly`, {
                params: { year: now.getFullYear(), month: now.getMonth() + 1 }
            });
            // Reverse to show latest first
            setAttendanceRecords([...res.data.records].reverse());
            setApprovalRecords(res.data.approval_items || []);
        } catch (err) {
            console.error('Attendance Fetch Error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') {
            fetchMonthlyRecords();
        }
        window.scrollTo(0, 0);
    }, [activeTab, user]);

    // SSE: 결재 이벤트 수신 시 이력 탭이 활성화된 경우 자동 갱신
    useSSE((eventName) => {
        if (eventName === 'approval_updated' && activeTab === 'history') {
            fetchMonthlyRecords();
        }
    });

    return (
        <div className="flex flex-col h-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
            {/* Header */}
            {/* Header was removed (now handled by MobileLayout) */}

            {activeTab === 'action' ? (
                <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 space-y-8 overflow-y-auto">
                    {/* User Info & Clock */}
                    <div className="text-center space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <p className="text-slate-500 text-sm font-medium">반갑습니다, <span className="text-slate-900 font-bold">{user?.name}님</span></p>
                        <div className="text-5xl font-black tracking-tighter text-slate-900 tabular-nums">
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <p className="text-slate-400 text-sm">
                            {currentTime.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                        </p>
                    </div>

                    {/* Status Message Display */}
                    <div className={`h-20 flex items-center justify-center w-full transition-all duration-300 ${message ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                        {message && (
                            <div className={`flex items-center space-x-2 px-6 py-3 rounded-2xl border ${status === 'success'
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                : 'bg-red-50 border-red-100 text-red-700'
                                } shadow-sm active:scale-95 transition-transform`}>
                                {status === 'success' ? (
                                    <CheckCircleIcon className="w-6 h-6 animate-bounce" />
                                ) : (
                                    <ExclamationCircleIcon className="w-6 h-6 animate-pulse" />
                                )}
                                <span className="text-lg font-bold">{message}</span>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 gap-6 w-full max-w-sm">
                        <button
                            disabled={loading}
                            onClick={() => handleClockAction('IN')}
                            className={`group relative overflow-hidden h-40 rounded-3xl transition-all duration-300 transform active:scale-95 flex flex-col items-center justify-center space-y-2 shadow-xl ${loading ? 'bg-slate-200 cursor-not-allowed' : 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:shadow-blue-200 active:shadow-inner'
                                }`}
                        >
                            <div className="absolute inset-0 bg-white/20 opacity-0 group-active:opacity-100 transition-opacity" />
                            <ClockIcon className={`w-12 h-12 text-white ${loading ? 'animate-spin' : ''}`} />
                            <span className="text-2xl font-black text-white tracking-widest">출근하기</span>
                            <div className="absolute bottom-4 text-white/60 text-xs font-medium">WORK START</div>
                        </button>

                        <button
                            disabled={loading}
                            onClick={() => handleClockAction('OUT')}
                            className={`group relative overflow-hidden h-40 rounded-3xl transition-all duration-300 transform active:scale-95 flex flex-col items-center justify-center space-y-2 shadow-xl ${loading ? 'bg-slate-200 cursor-not-allowed' : 'bg-gradient-to-br from-orange-500 to-red-600 hover:shadow-orange-200 active:shadow-inner'
                                }`}
                        >
                            <div className="absolute inset-0 bg-white/20 opacity-0 group-active:opacity-100 transition-opacity" />
                            <ArrowRightOnRectangleIcon className={`w-12 h-12 text-white ${loading ? 'animate-spin' : ''}`} />
                            <span className="text-2xl font-black text-white tracking-widest">퇴근하기</span>
                            <div className="absolute bottom-4 text-white/60 text-xs font-medium">WORK FINISH</div>
                        </button>
                    </div>
                </main>
            ) : (
                <main className="flex-1 flex flex-col px-6 py-6 space-y-6 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-black text-slate-800">최근 근태 기록</h2>
                        <button onClick={fetchMonthlyRecords} className="p-2 bg-slate-100 rounded-full text-slate-500 active:rotate-180 transition-transform duration-500">
                            <ArrowPathIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {attendanceRecords.map((record, i) => {
                            const dateStr = record.record_date;
                            // Find matching approvals for this date
                            const dayApprovals = approvalRecords.filter(ap => {
                                const dateVal = ap?.date;
                                if (dateVal && typeof dateVal === 'string' && dateVal.includes('~')) {
                                    const [s, e] = dateVal.split('~').map(d => d.trim());
                                    return dateStr >= s && dateStr <= e;
                                }
                                return dateVal === dateStr;
                            });

                            return (
                                <div key={i} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-black text-slate-400 tabular-nums">
                                            {new Date(record.record_date).toLocaleDateString([], { month: '2-digit', day: '2-digit', weekday: 'short' })}
                                        </div>
                                        <div className="flex space-x-1">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${record.attendance_status === 'NORMAL' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                {record.attendance_status === 'LATE' ? '지각' : record.attendance_status === 'EARLY_LEAVE' ? '조퇴' : '정상'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-3 rounded-2xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Clock In</p>
                                            <p className="text-lg font-black text-slate-800">
                                                {record.clock_in_time ? new Date(record.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-2xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Clock Out</p>
                                            <p className="text-lg font-black text-slate-800">
                                                {record.clock_out_time ? new Date(record.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Approval Tags */}
                                    {dayApprovals.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {dayApprovals.map((ap, idx) => {
                                                let label = ap.title;
                                                let colorClass = "bg-slate-100 text-slate-600";
                                                if (ap.doc_type === 'VACATION') {
                                                    label = "연차/휴가";
                                                    colorClass = "bg-indigo-50 text-indigo-600";
                                                } else if (ap.doc_type === 'OVERTIME') {
                                                    label = `야근/특근 (${ap.applied_value}h)`;
                                                    colorClass = "bg-rose-50 text-rose-600";
                                                } else if (ap.doc_type === 'EARLY_LEAVE') {
                                                    label = ap.title.includes('외출') ? "외출" : "조퇴원";
                                                    colorClass = "bg-amber-50 text-amber-600";
                                                }

                                                return (
                                                    <div key={idx} className={`${colorClass} px-3 py-1 rounded-xl text-[10px] font-black flex items-center`}>
                                                        <div className="w-1 h-1 rounded-full bg-current mr-2" />
                                                        {label}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {attendanceRecords.length === 0 && (
                            <div className="py-20 text-center space-y-2">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <ListBulletIcon className="w-8 h-8 text-slate-300" />
                                </div>
                                <p className="text-slate-400 font-bold">이번 달 기록이 없습니다.</p>
                            </div>
                        )}
                    </div>
                </main>
            )}

            {/* Bottom Nav was removed (now handled by MobileLayout) */}

            {/* Loading Overlay (Optional, but good for UX) */}
            {loading && (
                <div className="absolute inset-0 bg-white/10 backdrop-blur-[2px] z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center space-y-4 border border-slate-100">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <p className="font-bold text-slate-600">처리 중...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileAttendancePage;

