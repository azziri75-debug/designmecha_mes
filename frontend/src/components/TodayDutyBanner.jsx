import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { Bell, CheckCircle2, X } from 'lucide-react';

const getTodayKey = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `dismissed_duty_banner_${y}-${m}-${day}`;
};

const TodayDutyBanner = ({ userId, variant = 'desktop' }) => {
    const [duties, setDuties] = useState([]);
    const [dismissed, setDismissed] = useState(() => {
        try {
            return sessionStorage.getItem(getTodayKey()) === '1';
        } catch {
            return false;
        }
    });
    const [updatingId, setUpdatingId] = useState(null);

    const fetchMyToday = useCallback(async () => {
        if (!userId) return;
        try {
            const res = await api.get('/hr/duties/my-today');
            setDuties((res.data || []).filter((d) => d.status === 'ASSIGNED'));
        } catch {
            // 조용히 무시
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) return;
        fetchMyToday();
        const timer = setInterval(fetchMyToday, 5 * 60 * 1000);
        return () => clearInterval(timer);
    }, [userId, fetchMyToday]);

    const handleComplete = async (duty) => {
        setUpdatingId(duty.id);
        try {
            await api.patch(`/hr/duties/schedules/${duty.id}`, { status: 'DONE' });
            setDuties((prev) => prev.filter((item) => item.id !== duty.id));
        } catch (err) {
            alert(err?.response?.data?.detail || '완료 처리에 실패했습니다.');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleDismiss = () => {
        setDismissed(true);
        try {
            sessionStorage.setItem(getTodayKey(), '1');
        } catch {
            // ignore
        }
    };

    if (!userId || dismissed || duties.length === 0) return null;

    if (variant === 'mobile') {
        return (
            <div className="mx-3 mt-2 mb-1 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 shadow-sm text-slate-900">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                        <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>오늘의 공용관리 당번 알림</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                        aria-label="오늘 배너 닫기"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="mt-2 space-y-1.5">
                    {duties.map((d) => (
                        <div
                            key={d.id}
                            className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: d.color || '#10b981' }}
                                />
                                <span className="text-xs font-bold text-slate-800 truncate">
                                    {d.duty_name}
                                </span>
                            </div>
                            <button
                                type="button"
                                disabled={updatingId === d.id}
                                onClick={() => handleComplete(d)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shrink-0 disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {updatingId === d.id ? '처리중' : '완료'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                    <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>오늘의 공용관리 당번:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {duties.map((d) => (
                        <div
                            key={d.id}
                            className="inline-flex items-center gap-2 bg-gray-900/80 border border-amber-500/40 rounded-lg px-2.5 py-1"
                        >
                            <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: d.color || '#10b981' }}
                            />
                            <span className="text-xs font-semibold text-white">{d.duty_name}</span>
                            <button
                                type="button"
                                disabled={updatingId === d.id}
                                onClick={() => handleComplete(d)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-3 h-3" />
                                {updatingId === d.id ? '처리중' : '완료'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            <button
                type="button"
                onClick={handleDismiss}
                className="text-gray-400 hover:text-white p-1"
                title="오늘 알림 배너 닫기"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

export default TodayDutyBanner;
