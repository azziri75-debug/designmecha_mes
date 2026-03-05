import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
    UsersIcon,
    CalendarDaysIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    ClockIcon
} from '@heroicons/react/24/outline';

const AttendancePage = () => {
    const { user } = useAuth();
    const [staffList, setStaffList] = useState([]);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [attendanceData, setAttendanceData] = useState({});
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch staff list for sidebar
    useEffect(() => {
        const fetchStaff = async () => {
            try {
                const res = await api.get('/basics/staff/');
                setStaffList(res.data);
                if (res.data.length > 0 && !selectedStaff) {
                    setSelectedStaff(res.data[0]);
                }
            } catch (err) {
                console.error('Failed to fetch staff:', err);
            }
        };
        fetchStaff();
    }, []);

    // Fetch attendance for the selected staff and month
    const fetchAttendance = useCallback(async () => {
        if (!selectedStaff) return;

        setLoading(true);
        setError(null);
        try {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth() + 1;
            const res = await api.get(`/hr/attendance/${selectedStaff.id}/monthly`, {
                params: { year, month }
            });

            // Map data by day for easy lookup
            const mapped = {};
            res.data.records.forEach(record => {
                const day = new Date(record.date).getDate();
                mapped[day] = record;
            });
            setAttendanceData(mapped);
        } catch (err) {
            console.error('Failed to fetch attendance:', err);
            setError('근태 데이터를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }, [selectedStaff, currentMonth]);

    useEffect(() => {
        fetchAttendance();
    }, [fetchAttendance]);

    const changeMonth = (offset) => {
        const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
        setCurrentMonth(next);
    };

    // Calendar generation logic
    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        // Vacant cells for previous month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-32 border-b border-r border-slate-100 bg-slate-50/50" />);
        }

        // Month days
        for (let day = 1; day <= daysInMonth; day++) {
            const record = attendanceData[day];
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
            const isAnomaly = record?.attendance_status === 'LATE' || record?.attendance_status === 'EARLY_LEAVE';

            days.push(
                <div key={day} className={`h-32 border-b border-r border-slate-100 p-2 transition-colors hover:bg-slate-50 relative ${isToday ? 'bg-blue-50/30' : ''}`}>
                    <div className="flex justify-between items-start">
                        <span className={`text-sm font-bold ${isToday ? 'text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full' : 'text-slate-500'}`}>
                            {day}
                        </span>
                        {isAnomaly && (
                            <span className="flex items-center text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full animate-pulse">
                                <ExclamationTriangleIcon className="w-3 h-3 mr-0.5" />
                                {record.attendance_status === 'LATE' ? '지각' : '조퇴'}
                            </span>
                        )}
                    </div>

                    {record ? (
                        <div className="mt-2 space-y-1.5">
                            <div className={`p-1.5 rounded-lg border ${isAnomaly ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'} shadow-sm`}>
                                <div className="flex flex-col">
                                    <div className="flex items-center text-[11px] font-semibold text-slate-700">
                                        <ClockIcon className="w-3 h-3 mr-1 text-blue-500" />
                                        IN: {record.clock_in_time ? new Date(record.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </div>
                                    <div className="flex items-center text-[11px] font-semibold text-slate-700 mt-1">
                                        <ClockIcon className="w-3 h-3 mr-1 text-orange-500" />
                                        OUT: {record.clock_out_time ? new Date(record.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 text-[10px] text-slate-300 italic text-center py-4">
                            기록 없음
                        </div>
                    )}
                </div>
            );
        }

        return days;
    };

    return (
        <div className="flex h-[calc(100vh-64px)] bg-slate-100 overflow-hidden font-sans">
            {/* Sidebar: Staff List */}
            <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-lg z-10">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="flex items-center text-lg font-black text-slate-800">
                        <UsersIcon className="w-6 h-6 mr-2 text-blue-600" />
                        임직원 목록
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium italic">총 {staffList.length}명의 대원이 활약 중</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {staffList.map((staff) => (
                        <button
                            key={staff.id}
                            onClick={() => setSelectedStaff(staff)}
                            className={`w-full flex items-center p-3 rounded-2xl transition-all duration-200 text-left ${selectedStaff?.id === staff.id
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105'
                                    : 'hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-100'
                                }`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black mr-3 ${selectedStaff?.id === staff.id ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>
                                {staff.name.substring(0, 1)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold truncate">{staff.name}</p>
                                <p className={`text-[10px] uppercase tracking-tighter ${selectedStaff?.id === staff.id ? 'text-white/70' : 'text-slate-400'}`}>
                                    {staff.role || 'MEMBER'}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            {/* Main Content: Calendar */}
            <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                {/* Calendar Header */}
                <header className="px-8 py-6 bg-white border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                        <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                            <CalendarDaysIcon className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900">
                                {selectedStaff ? `${selectedStaff.name} 님의 근태` : '사원을 선택해 주세요'}
                            </h1>
                            <p className="text-sm font-bold text-slate-400 flex items-center">
                                <span className="text-blue-500 mr-1.5">●</span>
                                ATTENDANCE CALENDAR SYSTEM v2.0
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl shadow-inner">
                        <button
                            onClick={() => changeMonth(-1)}
                            className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-600"
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                        </button>
                        <div className="px-6 text-lg font-black text-slate-800 tabular-nums">
                            {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                        </div>
                        <button
                            onClick={() => changeMonth(1)}
                            className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all text-slate-600"
                        >
                            <ChevronRightIcon className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* Calendar Grid */}
                <div className="flex-1 overflow-auto p-8">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-4">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            <p className="font-black text-slate-400 animate-pulse">데이터 로딩 중...</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-w-6xl mx-auto">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
                                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d, i) => (
                                    <div key={d} className={`py-4 text-center text-[11px] font-black tracking-[0.2em] ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Days Grid */}
                            <div className="grid grid-cols-7 flex-1 min-h-0 bg-white">
                                {renderCalendar()}
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm font-bold flex items-center justify-center shadow-sm">
                            <ExclamationTriangleIcon className="w-5 h-5 mr-2" />
                            {error}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AttendancePage;

