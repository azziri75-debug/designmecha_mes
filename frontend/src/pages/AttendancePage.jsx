import React, { useState, useEffect, useCallback } from 'react';
import { Box, Button } from '@mui/material';
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
import { RefreshCw } from 'lucide-react';

const AttendancePage = () => {
    const { user } = useAuth();
    const [staffList, setStaffList] = useState([]);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [attendanceData, setAttendanceData] = useState({});
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [activeTab, setActiveTab] = useState('calendar'); // calendar, history
    const [summaryData, setSummaryData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [editFormData, setEditFormData] = useState({
        clock_in_time: '',
        clock_out_time: '',
        attendance_status: 'NORMAL'
    });

    // Fetch staff list for sidebar
    useEffect(() => {
        // [Cleanup] 마운트 시 유령 데이터(과거 결재 삭제 후 남은 near records) 자동 삭제
        api.post('/hr/cleanup-ghost-data').catch(() => { }); // 실패해도 조용히 넘김

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

    const [approvalData, setApprovalData] = useState({});

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

            // Map records by day
            const mappedRecords = {};
            res.data.records.forEach(record => {
                const day = parseInt((record.record_date?.toString().split('-')?.[2]) || '0');
                mappedRecords[day] = record;
            });
            setAttendanceData(mappedRecords);

            // Map approvals by day
            const mappedApprovals = {};
            res.data.approval_items.forEach(doc => {
                if (!doc?.date || typeof doc.date !== 'string') return;
                const parts = (doc.date || '').toString().split('~');
                const startStr = parts[0].trim();
                const endStr = (parts[1] || parts[0]).trim();

                const [sY, sM, sD] = startStr.split('-').map(Number);
                const [eY, eM, eD] = endStr.split('-').map(Number);
                
                if (!sY || !sM || !sD || !eY || !eM || !eD) return;

                let d = new Date(sY, sM - 1, sD);
                const e = new Date(eY, eM - 1, eD);

                while (d <= e) {
                    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
                        const day = d.getDate();
                        if (!mappedApprovals[day]) mappedApprovals[day] = [];
                        mappedApprovals[day].push(doc);
                    }
                    d.setDate(d.getDate() + 1);
                }
            });
            setApprovalData(mappedApprovals);

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

    const fetchSummary = useCallback(async () => {
        if (!selectedStaff) return;
        try {
            const year = currentMonth.getFullYear();
            const res = await api.get('/hr/attendance/summary', {
                params: { year, user_id: selectedStaff.id }
            });
            setSummaryData(res.data);
        } catch (err) {
            console.error('Failed to fetch summary:', err);
        }
    }, [selectedStaff, currentMonth]);

    useEffect(() => {
        fetchSummary();
    }, [selectedStaff, fetchSummary]);

    const changeMonth = (offset) => {
        const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
        setCurrentMonth(next);
    };

    const handleOpenEdit = (record) => {
        const toLocalISO = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const offset = date.getTimezoneOffset() * 60000;
            return new Date(date.getTime() - offset).toISOString().slice(0, 16);
        };

        setEditingRecord(record);
        setEditFormData({
            clock_in_time: toLocalISO(record.clock_in_time),
            clock_out_time: toLocalISO(record.clock_out_time),
            attendance_status: record.attendance_status || 'NORMAL'
        });
        setShowEditModal(true);
    };

    const handleUpdateAttendance = async () => {
        try {
            setLoading(true);
            await api.put(`/hr/attendance/records/${editingRecord.id}`, {
                clock_in_time: editFormData.clock_in_time || null,
                clock_out_time: editFormData.clock_out_time || null,
                attendance_status: editFormData.attendance_status,
                category: editingRecord.category
            });
            setShowEditModal(false);
            fetchAttendance();
        } catch (err) {
            console.error('Failed to update attendance:', err);
            alert('수정에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSyncAnnualLeave = async () => {
        if (!selectedStaff) return;
        const year = currentMonth.getFullYear();
        try {
            setLoading(true);
            await api.post(`/hr/sync-annual-leave/${selectedStaff.id}?year=${year}`);
            await fetchAttendance();
            await fetchSummary();
            alert(`✅ ${selectedStaff.name} 사원의 ${year}년 연차 데이터가 강제 동기화되었습니다.`);
        } catch (err) {
            alert('동기화 실패: ' + (err?.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleSyncAttendance = async () => {
        if (!window.confirm("결재는 완료되었으나 누락된 근태/연차 기록을 찾아 복구하시겠습니까?")) return;
        
        try {
            setLoading(true);
            const res = await api.post('/hr/sync-attendance');
            alert(res.data.message);
            // 완료 후 화면 새로고침(데이터 재요청) 함수 호출
            fetchAttendance(); 
            fetchSummary();
        } catch (error) {
            alert("동기화 중 오류가 발생했습니다: " + (error?.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
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
            const approvals = approvalData[day] || [];
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
            const isAnomaly = record?.attendance_status === 'LATE' || record?.attendance_status === 'EARLY_LEAVE';

            days.push(
                <div
                    key={day}
                    onClick={() => user?.user_type === 'ADMIN' && record && handleOpenEdit(record)}
                    className={`h-32 border-b border-r border-slate-100 p-2 transition-colors hover:bg-slate-50 relative overflow-y-auto custom-scrollbar ${isToday ? 'bg-blue-50/30' : ''} ${user?.user_type === 'ADMIN' ? 'cursor-pointer' : ''}`}
                >
                    <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm font-bold ${isToday ? 'text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full' : 'text-slate-500'}`}>
                            {day}
                        </span>
                        {isAnomaly && (
                            <span className="flex items-center text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                                <ExclamationTriangleIcon className="w-2.5 h-2.5 mr-0.5" />
                                {record.attendance_status === 'LATE' ? '지각' : '조퇴'}
                            </span>
                        )}
                    </div>

                    {/* Attendance Clock In/Out */}
                    {record && (
                        <div className="mb-1.5">
                            <div className={`p-1 rounded border ${isAnomaly ? 'bg-red-50/50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="text-[9px] font-bold text-slate-600 flex justify-between tabular-nums">
                                    <span>IN {record.clock_in_time ? new Date(record.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}</span>
                                    <span>OUT {record.clock_out_time ? new Date(record.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Approval Labels (Vacation, Overtime, etc.) */}
                    <div className="space-y-1">
                        {approvals.map((ap, idx) => {
                            let config = { bg: 'bg-slate-100', text: 'text-slate-600', label: ap.title };
                            if (ap.doc_type === 'VACATION') {
                                config = { bg: 'bg-blue-100', text: 'text-blue-700', label: '휴가' };
                            } else if (ap.doc_type === 'OVERTIME') {
                                config = { bg: 'bg-red-100', text: 'text-red-700', label: '특근' };
                            } else if (ap.doc_type === 'EARLY_LEAVE') {
                                config = { bg: 'bg-amber-100', text: 'text-amber-700', label: ap.title.includes('외출') ? '외출' : '조퇴' };
                            }

                            return (
                                <div key={idx} className={`${config.bg} ${config.text} text-[9px] font-black px-1.5 py-0.5 rounded flex items-center shadow-sm`}>
                                    <div className="w-1 h-1 rounded-full bg-current mr-1 animate-pulse" />
                                    {config.label}
                                </div>
                            );
                        })}
                    </div>

                    {!record && approvals.length === 0 && (
                        <div className="mt-2 text-[10px] text-slate-300 italic text-center opacity-50">
                            -
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
                            {activeTab === 'calendar' ? <CalendarDaysIcon className="w-8 h-8 text-blue-600" /> : <ClockIcon className="w-8 h-8 text-blue-600" />}
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900">
                                {selectedStaff ? `${selectedStaff.name} 님의 근태` : '사원을 선택해 주세요'}
                            </h1>
                            <div className="flex items-center mt-1 space-x-1">
                                <button
                                    onClick={() => setActiveTab('calendar')}
                                    className={`px-3 py-1 rounded-full text-[10px] font-black tracking-tighter transition-all ${activeTab === 'calendar' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                    CALENDAR VIEW
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`px-3 py-1 rounded-full text-[10px] font-black tracking-tighter transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                    HISTORY LIST
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap justify-end">
                        {(user?.is_sysadmin || user?.user_type === 'ADMIN') && (
                            <Button 
                                variant="outlined" 
                                color="warning" 
                                startIcon={<RefreshCw className="w-4 h-4" />}
                                onClick={handleSyncAttendance}
                                disabled={loading}
                                sx={{ ml: 2, fontWeight: 'bold' }}
                            >
                                누락 근태 일괄 동기화 (복구)
                            </Button>
                        )}
                        {user?.user_type === 'ADMIN' && selectedStaff && (
                            <button
                                onClick={handleSyncAnnualLeave}
                                disabled={loading}
                                className="text-[10px] font-black tracking-tight bg-orange-500 hover:bg-orange-400 text-white px-3 py-2 rounded-xl shadow-lg shadow-orange-900/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                                title="선택 사원의 연차 데이터를 전자결재 기준으로 강제 재계산합니다"
                            >
                                ⚡ 근태/연차 강제 동기화
                            </button>
                        )}
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
                    </div>
                </header>

                {/* Always Visible Summary Info at Top */}
                {selectedStaff && summaryData && (
                    <Box sx={{ px: 8, pt: 4, pb: 0 }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-4 rounded-2xl text-white shadow-lg border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-1">총 연차</p>
                                <p className="text-2xl font-black">{summaryData.total_annual_days?.toFixed(1) || 0} <span className="text-xs">일</span></p>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 rounded-2xl text-white shadow-lg border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-1">잔여 연차</p>
                                <p className="text-2xl font-black">{summaryData.remaining_annual_days?.toFixed(1) || 0} <span className="text-xs">일</span></p>
                            </div>
                            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 rounded-2xl text-white shadow-lg border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-1">사용 연차</p>
                                <p className="text-2xl font-black">{summaryData.total_vacation_days?.toFixed(1) || 0} <span className="text-xs">일</span></p>
                            </div>
                            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-4 rounded-2xl text-white shadow-lg border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-1">병가</p>
                                <p className="text-2xl font-black">{summaryData.total_sick_leave_days?.toFixed(1) || 0} <span className="text-xs">일</span></p>
                            </div>
                            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-2xl text-white shadow-lg border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-1">경조휴가</p>
                                <p className="text-2xl font-black">{summaryData.total_event_leave_days?.toFixed(1) || 0} <span className="text-xs">일</span></p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-400 to-blue-500 p-4 rounded-2xl text-white shadow-lg border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-1">외출/조퇴</p>
                                <p className="text-2xl font-black">{summaryData.total_leave_outing_hours?.toFixed(1) || 0} <span className="text-xs">시간</span></p>
                            </div>
                            <div className="bg-gradient-to-br from-slate-700 to-slate-800 p-4 rounded-2xl text-white shadow-lg border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider opacity-70 mb-1">특근</p>
                                <p className="text-2xl font-black">{summaryData.total_overtime_hours?.toFixed(1) || 0} <span className="text-xs">시간</span></p>
                            </div>
                        </div>
                    </Box>
                )}

                {/* Calendar Grid */}
                <div className="flex-1 overflow-auto p-8">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-4">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            <p className="font-black text-slate-400 animate-pulse">데이터 로딩 중...</p>
                        </div>
                    ) : activeTab === 'calendar' ? (
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
                    ) : (
                        <div className="max-w-6xl mx-auto space-y-6">

                            {/* Records Table */}
                            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden">
                                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                    <h3 className="font-black text-slate-800 flex items-center">
                                        <ClockIcon className="w-5 h-5 mr-2 text-blue-600" />
                                        전자결재 근태 내역
                                    </h3>
                                    <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase">
                                        {currentMonth.getFullYear()} Annual Records
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50/80 border-b border-slate-100">
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Title</th>
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Annual</th>
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Sick</th>
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Event</th>
                                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Etc (Hrs)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {summaryData?.documents?.map((doc) => (
                                                <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-8 py-4">
                                                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${doc.doc_type === 'VACATION' ? 'bg-indigo-100 text-indigo-600' : doc.doc_type === 'EARLY_LEAVE' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                            {doc.doc_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-4 text-sm font-bold text-slate-700">{doc.title}</td>
                                                    <td className="px-8 py-4 text-xs font-bold text-slate-400 tabular-nums">{doc.date}</td>
                                                    <td className="px-8 py-4 text-sm font-black text-slate-900 text-center">
                                                        {doc.doc_type === 'VACATION' && (doc.vacation_type === '연차' || doc.vacation_type === '반차') ? doc.applied_value.toFixed(1) : '-'}
                                                    </td>
                                                    <td className="px-8 py-4 text-sm font-black text-rose-600 text-center">
                                                        {doc.doc_type === 'VACATION' && doc.vacation_type === '병가' ? doc.applied_value.toFixed(1) : '-'}
                                                    </td>
                                                    <td className="px-8 py-4 text-sm font-black text-amber-600 text-center">
                                                        {doc.doc_type === 'VACATION' && doc.vacation_type === '경조휴가' ? doc.applied_value.toFixed(1) : '-'}
                                                    </td>
                                                    <td className="px-8 py-4 text-sm font-black text-slate-900 text-right">
                                                        {doc.doc_type !== 'VACATION' ? doc.applied_value.toFixed(1) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!summaryData?.documents || summaryData.documents.length === 0) && (
                                                <tr>
                                                    <td colSpan="4" className="px-8 py-12 text-center text-slate-400 font-bold italic">
                                                        기록이 없습니다.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
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

            {/* Attendance Edit Modal (Admin only) */}
            {
                showEditModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-xl font-black text-slate-800">근태 기록 수정</h3>
                                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <ChevronRightIcon className="w-6 h-6 rotate-90" />
                                </button>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">사원명</label>
                                        <input type="text" disabled value={selectedStaff?.name || ''} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-400" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">날짜</label>
                                        <input type="text" disabled value={editingRecord?.record_date || ''} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-400" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">출근 시간</label>
                                            <input
                                                type="datetime-local"
                                                value={editFormData.clock_in_time}
                                                onChange={e => setEditFormData({ ...editFormData, clock_in_time: e.target.value })}
                                                className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">퇴근 시간</label>
                                            <input
                                                type="datetime-local"
                                                value={editFormData.clock_out_time}
                                                onChange={e => setEditFormData({ ...editFormData, clock_out_time: e.target.value })}
                                                className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">근태 상태</label>
                                        <select
                                            value={editFormData.attendance_status}
                                            onChange={e => setEditFormData({ ...editFormData, attendance_status: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all"
                                        >
                                            <option value="NORMAL">정상</option>
                                            <option value="LATE">지각</option>
                                            <option value="EARLY_LEAVE">조퇴</option>
                                            <option value="ABSENT">결근</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex space-x-3 pt-4">
                                    <button
                                        onClick={() => setShowEditModal(false)}
                                        className="flex-1 px-6 py-4 bg-slate-100 text-slate-400 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleUpdateAttendance}
                                        className="flex-[2] px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-blue-200 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-xs"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AttendancePage;

