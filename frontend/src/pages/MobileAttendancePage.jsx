import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
    ArrowLeftIcon,
    ArrowRightOnRectangleIcon,
    ClockIcon,
    CheckCircleIcon,
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const MobileAttendancePage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [status, setStatus] = useState(null); // 'success' or 'error'

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

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-100 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <ArrowLeftIcon className="w-6 h-6 text-slate-600" />
                </button>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    근태 관리
                </h1>
                <button
                    onClick={() => { if (window.confirm('로그아웃 하시겠습니까?')) { logout(); navigate('/login'); } }}
                    className="p-2 hover:bg-red-50 rounded-full transition-colors"
                >
                    <ArrowRightOnRectangleIcon className="w-6 h-6 text-red-500" />
                </button>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 space-y-8">
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
                    {/* Clock In Button */}
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

                    {/* Clock Out Button */}
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

            {/* Sub-footer or decorative element */}
            <footer className="py-6 text-center">
                <p className="text-slate-300 text-[10px] uppercase tracking-[0.2em] font-bold">
                    Smart MES Attendance System
                </p>
            </footer>

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

