import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
    Plus, Trash2, ArrowUp, ArrowDown, Calendar, Sparkles, Save, CheckCircle2, Clock, RefreshCw, Users, X, Search, Printer, Bell
} from 'lucide-react';

const WEEKDAYS = [
    { key: 0, label: '월' },
    { key: 1, label: '화' },
    { key: 2, label: '수' },
    { key: 3, label: '목' },
    { key: 4, label: '금' },
    { key: 5, label: '토' },
    { key: 6, label: '일' },
];

const COLOR_PRESETS = [
    '#10b981', // emerald
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
];

const CommonDutyTab = () => {
    const [configs, setConfigs] = useState([]);
    const [selectedConfigId, setSelectedConfigId] = useState(null);
    const [staffList, setStaffList] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [holidaysMap, setHolidaysMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    // 월 선택 (당번표 조회용)
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    // 기간 배정용 시작일 ~ 종료일
    const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [assignStart, setAssignStart] = useState(() => toIso(now));
    const [assignEnd, setAssignEnd] = useState(() => toIso(new Date(now.getFullYear(), now.getMonth() + 3, 0)));
    const [holidayShift, setHolidayShift] = useState('NEXT'); // NEXT: 휴일 다음날, PREV: 휴일 전날, SKIP: 건너뜀

    // 직원 다중 선택 모달 상태
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [modalSelectedIds, setModalSelectedIds] = useState([]);
    const [staffSearch, setStaffSearch] = useState('');

    // 월간 달력 인쇄 모달 상태
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printStartMonth, setPrintStartMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const [printEndMonth, setPrintEndMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const [printConfigIds, setPrintConfigIds] = useState([]);
    const [printOrientation, setPrintOrientation] = useState('landscape');
    const [printing, setPrinting] = useState(false);

    // 신규/수정 항목 폼
    const [showNewForm, setShowNewForm] = useState(false);
    const [newForm, setNewForm] = useState({
        name: '',
        weekdays: [0, 2, 4],
        notify_time: '08:30',
        color: '#10b981',
    });

    // 선택된 항목 편집 상태
    const [editConfig, setEditConfig] = useState(null);
    const [memberIds, setMemberIds] = useState([]);

    const fetchInitial = useCallback(async () => {
        setLoading(true);
        try {
            const [cfgRes, staffRes] = await Promise.all([
                api.get('/hr/duties/configs'),
                api.get('/basics/staff/'),
            ]);
            const cfgs = cfgRes.data || [];
            setConfigs(cfgs);
            setStaffList((staffRes.data || []).filter(s => s.is_active !== false));
            if (cfgs.length > 0 && !selectedConfigId) {
                setSelectedConfigId(cfgs[0].id);
            }
        } catch (err) {
            console.error('Failed to load common duty configs:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedConfigId]);

    const fetchSchedules = useCallback(async () => {
        try {
            const [schRes, holRes] = await Promise.all([
                api.get('/hr/duties/schedules', {
                    params: { year, month, config_id: selectedConfigId || undefined },
                }),
                api.get('/hr/holidays', { params: { year, month } }),
            ]);
            setSchedules(schRes.data || []);
            setHolidaysMap(holRes.data || {});
        } catch (err) {
            console.error('Failed to load duty schedules:', err);
        }
    }, [year, month, selectedConfigId]);

    useEffect(() => {
        fetchInitial();
    }, [fetchInitial]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    const selectedConfig = configs.find(c => c.id === selectedConfigId) || null;

    useEffect(() => {
        if (selectedConfig) {
            setEditConfig({
                name: selectedConfig.name,
                weekdays: selectedConfig.weekdays || [0, 1, 2, 3, 4],
                notify_time: selectedConfig.notify_time || '08:30',
                color: selectedConfig.color || '#10b981',
                is_active: selectedConfig.is_active !== false,
            });
            setMemberIds((selectedConfig.members || []).map(m => m.staff_id));
        } else {
            setEditConfig(null);
            setMemberIds([]);
        }
    }, [selectedConfig]);

    const handleCreateConfig = async (e) => {
        e.preventDefault();
        if (!newForm.name.trim()) return alert('항목명을 입력해주세요.');
        try {
            const res = await api.post('/hr/duties/configs', newForm);
            setShowNewForm(false);
            setNewForm({ name: '', weekdays: [0, 2, 4], notify_time: '08:30', color: '#10b981' });
            await fetchInitial();
            if (res.data?.id) setSelectedConfigId(res.data.id);
        } catch (err) {
            alert(err.response?.data?.detail || '항목 생성 실패');
        }
    };

    const handleSaveConfigAndMembers = async () => {
        if (!selectedConfig || !editConfig) return;
        try {
            await api.put(`/hr/duties/configs/${selectedConfig.id}`, editConfig);
            await api.put(`/hr/duties/configs/${selectedConfig.id}/members`, { staff_ids: memberIds });
            alert('설정이 저장되었습니다.');
            await fetchInitial();
        } catch (err) {
            alert(err.response?.data?.detail || '저장 실패');
        }
    };

    const handleDeleteConfig = async (id) => {
        if (!window.confirm('이 공용관리 항목과 배정된 일정을 모두 삭제하시겠습니까?')) return;
        try {
            await api.delete(`/hr/duties/configs/${id}`);
            if (selectedConfigId === id) setSelectedConfigId(null);
            await fetchInitial();
        } catch (err) {
            alert(err.response?.data?.detail || '삭제 실패');
        }
    };

    const handleGeneratePeriod = async () => {
        if (!selectedConfig) return;
        if (memberIds.length === 0) {
            return alert('먼저 [직원 선택] 버튼으로 대상 직원을 1명 이상 선택해 주세요.');
        }
        if (!assignStart || !assignEnd) {
            return alert('배정 시작일과 종료일을 모두 지정해 주세요.');
        }
        if (assignEnd < assignStart) {
            return alert('종료일은 시작일보다 빠를 수 없습니다.');
        }
        const shiftLabel = holidayShift === 'PREV' ? '휴일 전날(영업일)' : holidayShift === 'NEXT' ? '휴일 다음날(영업일)' : '건너뜀';
        if (!window.confirm(`${assignStart} ~ ${assignEnd} 기간의 '${selectedConfig.name}' 당번을 자동 배정하시겠습니까?\n(공휴일 처리: ${shiftLabel} / 휴가자는 다음 순번으로 자동 이월됩니다.)`)) {
            return;
        }
        setGenerating(true);
        try {
            // 혹시 저장 안 된 변경사항이 있을 수 있으므로 먼저 저장
            await api.put(`/hr/duties/configs/${selectedConfig.id}`, editConfig);
            await api.put(`/hr/duties/configs/${selectedConfig.id}/members`, { staff_ids: memberIds });
            const res = await api.post('/hr/duties/generate', {
                start_date: assignStart,
                end_date: assignEnd,
                config_id: selectedConfig.id,
                holiday_shift: holidayShift,
            });
            alert(`${res.data?.created_count || 0}건의 당번 일정이 배정되었습니다.`);
            // 조회 월을 시작일 기준으로 맞춰 바로 확인
            const [sY, sM] = assignStart.split('-').map(Number);
            if (sY && sM) {
                setYear(sY);
                setMonth(sM);
            }
            await fetchInitial();
            await fetchSchedules();
        } catch (err) {
            alert(err.response?.data?.detail || '자동 배정 실패');
        } finally {
            setGenerating(false);
        }
    };

    const setQuickPeriod = (monthsCount) => {
        const base = new Date();
        const start = toIso(base);
        let end;
        if (monthsCount === 'year_end') {
            end = `${base.getFullYear()}-12-31`;
        } else {
            end = toIso(new Date(base.getFullYear(), base.getMonth() + monthsCount, 0));
        }
        setAssignStart(start);
        setAssignEnd(end);
    };

    const openStaffSelectModal = () => {
        setModalSelectedIds([...memberIds]);
        setStaffSearch('');
        setShowStaffModal(true);
    };

    const toggleModalStaff = (sid) => {
        setModalSelectedIds(prev =>
            prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]
        );
    };

    const applyModalStaffSelection = () => {
        // 기존 순번 유지 + 새로 선택된 직원은 뒤에 추가 + 해제된 직원은 제거
        const kept = memberIds.filter(id => modalSelectedIds.includes(id));
        const added = modalSelectedIds.filter(id => !memberIds.includes(id));
        setMemberIds([...kept, ...added]);
        setShowStaffModal(false);
    };

    const handleNotifyScheduleNow = async (sch) => {
        try {
            const res = await api.post(`/hr/duties/schedules/${sch.id}/notify`);
            alert(res.data?.message || '알림 요청이 처리되었습니다.');
            await fetchSchedules();
        } catch (err) {
            alert(err.response?.data?.detail || '알림 발송 중 오류가 발생했습니다.');
        }
    };

    const openPrintModal = () => {
        const curYm = `${year}-${String(month).padStart(2, '0')}`;
        setPrintStartMonth(curYm);
        setPrintEndMonth(curYm);
        setPrintConfigIds(configs.map(c => c.id));
        setShowPrintModal(true);
    };

    const setPrintQuickMonth = (mode) => {
        const base = new Date();
        const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (mode === 'this') {
            const v = ym(base);
            setPrintStartMonth(v);
            setPrintEndMonth(v);
        } else if (mode === 'next') {
            const nxt = new Date(base.getFullYear(), base.getMonth() + 1, 1);
            const v = ym(nxt);
            setPrintStartMonth(v);
            setPrintEndMonth(v);
        } else if (mode === '3m') {
            const end = new Date(base.getFullYear(), base.getMonth() + 2, 1);
            setPrintStartMonth(ym(base));
            setPrintEndMonth(ym(end));
        }
    };

    const togglePrintConfig = (cid) => {
        setPrintConfigIds(prev => prev.includes(cid) ? prev.filter(id => id !== cid) : [...prev, cid]);
    };

    const escapeHtml = (str) => String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const handlePrintCalendar = async () => {
        if (!printStartMonth || !printEndMonth) {
            return alert('인쇄할 기간(시작 월 ~ 종료 월)을 선택해 주세요.');
        }
        if (printEndMonth < printStartMonth) {
            return alert('종료 월은 시작 월보다 빠를 수 없습니다.');
        }
        if (printConfigIds.length === 0) {
            return alert('출력할 공용관리 항목을 1개 이상 선택해 주세요.');
        }

        const [sY, sM] = printStartMonth.split('-').map(Number);
        const [eY, eM] = printEndMonth.split('-').map(Number);
        const monthsList = [];
        let cy = sY, cm = sM;
        while (cy < eY || (cy === eY && cm <= eM)) {
            monthsList.push({ year: cy, month: cm });
            cm += 1;
            if (cm > 12) { cm = 1; cy += 1; }
            if (monthsList.length > 24) {
                return alert('한 번에 최대 24개월까지만 인쇄할 수 있습니다.');
            }
        }

        const lastDayOfEnd = new Date(eY, eM, 0).getDate();
        const startStr = `${sY}-${String(sM).padStart(2, '0')}-01`;
        const endStr = `${eY}-${String(eM).padStart(2, '0')}-${String(lastDayOfEnd).padStart(2, '0')}`;

        setPrinting(true);
        try {
            const yearsNeeded = Array.from(new Set(monthsList.map(m => m.year)));
            const [schRes, ...holResList] = await Promise.all([
                api.get('/hr/duties/schedules', { params: { start_date: startStr, end_date: endStr } }),
                ...yearsNeeded.map(y => api.get('/hr/holidays', { params: { year: y } }).catch(() => ({ data: {} }))),
            ]);

            const mergedHolidays = {};
            holResList.forEach(r => Object.assign(mergedHolidays, r.data || {}));

            const selectedSet = new Set(printConfigIds);
            const filteredSchedules = (schRes.data || []).filter(s => selectedSet.has(s.config_id));
            const scheduleByDate = {};
            filteredSchedules.forEach(s => {
                if (!scheduleByDate[s.duty_date]) scheduleByDate[s.duty_date] = [];
                scheduleByDate[s.duty_date].push(s);
            });

            const selectedConfigs = configs.filter(c => selectedSet.has(c.id));
            const legendHtml = selectedConfigs.map(c => `
                <span class="legend-item">
                    <span class="legend-dot" style="background:${escapeHtml(c.color || '#10b981')}"></span>
                    ${escapeHtml(c.name)}
                </span>
            `).join('');

            const nowText = new Date().toLocaleString('ko-KR');
            const isLandscape = printOrientation === 'landscape';

            const pagesHtml = monthsList.map(({ year: y, month: m }, pageIdx) => {
                const firstDow = new Date(y, m - 1, 1).getDay(); // 0=일
                const lastDate = new Date(y, m, 0).getDate();
                const cells = [];
                for (let i = 0; i < firstDow; i++) cells.push(null);
                for (let d = 1; d <= lastDate; d++) cells.push(d);
                while (cells.length % 7 !== 0) cells.push(null);

                const rowsHtml = [];
                for (let r = 0; r < cells.length; r += 7) {
                    const tds = cells.slice(r, r + 7).map((dayNum, colIdx) => {
                        if (!dayNum) return '<td class="empty"></td>';
                        const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const holName = mergedHolidays[dateKey];
                        const isSun = colIdx === 0;
                        const isSat = colIdx === 6;
                        const dayItems = scheduleByDate[dateKey] || [];

                        const dayClass = (holName || isSun) ? 'sun' : isSat ? 'sat' : '';
                        const itemsHtml = dayItems.map(item => {
                            const color = escapeHtml(item.color || '#10b981');
                            const doneMark = item.status === 'DONE' ? ' ✓' : '';
                            return `
                                <div class="duty-badge" style="border-left: 3px solid ${color}; background: ${color}18;">
                                    <span class="duty-title" style="color:${color}">${escapeHtml(item.duty_name)}</span>
                                    <span class="duty-staff">${escapeHtml(item.staff_name)}${doneMark}</span>
                                </div>
                            `;
                        }).join('');

                        return `
                            <td class="${holName ? 'holiday-cell' : ''}">
                                <div class="cell-head">
                                    <span class="day-num ${dayClass}">${dayNum}</span>
                                    ${holName ? `<span class="hol-name">${escapeHtml(holName)}</span>` : ''}
                                </div>
                                <div class="duty-list">${itemsHtml}</div>
                            </td>
                        `;
                    }).join('');
                    rowsHtml.push(`<tr>${tds}</tr>`);
                }

                return `
                    <div class="page ${pageIdx < monthsList.length - 1 ? 'page-break' : ''}">
                        <div class="doc-header">
                            <div>
                                <h1>${y}년 ${m}월 공용관리 당번표</h1>
                            </div>
                            <div class="legend">${legendHtml}</div>
                        </div>
                        <table class="cal-table">
                            <thead>
                                <tr>
                                    <th class="sun">일</th>
                                    <th>월</th>
                                    <th>화</th>
                                    <th>수</th>
                                    <th>목</th>
                                    <th>금</th>
                                    <th class="sat">토</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml.join('')}
                            </tbody>
                        </table>
                        <div class="doc-footer">
                            <span>출력일시: ${escapeHtml(nowText)}</span>
                            <span>${pageIdx + 1} / ${monthsList.length}</span>
                        </div>
                    </div>
                `;
            }).join('');

            const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>공용관리 당번표 (${printStartMonth} ~ ${printEndMonth})</title>
<style>
    @page {
        size: A4 ${printOrientation};
        margin: 10mm;
    }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body {
        margin: 0;
        padding: 0;
        font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
        color: #111827;
        background: #fff;
    }
    .page {
        width: 100%;
        padding: 4px;
    }
    .page-break {
        page-break-after: always;
    }
    .doc-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        border-bottom: 2px solid #1e293b;
        padding-bottom: 6px;
        margin-bottom: 8px;
    }
    .doc-header h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
        color: #0f172a;
    }
    .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        font-size: 11px;
        font-weight: 600;
    }
    .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .legend-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        display: inline-block;
    }
    .cal-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }
    .cal-table th {
        border: 1px solid #cbd5e1;
        background: #f1f5f9;
        padding: 5px 4px;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
    }
    .cal-table th.sun { color: #dc2626; }
    .cal-table th.sat { color: #2563eb; }
    .cal-table td {
        border: 1px solid #cbd5e1;
        vertical-align: top;
        padding: 4px;
        height: ${isLandscape ? '92px' : '125px'};
    }
    .cal-table td.empty {
        background: #f8fafc;
    }
    .cal-table td.holiday-cell {
        background: #fef2f2;
    }
    .cell-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        margin-bottom: 3px;
    }
    .day-num {
        font-size: 12px;
        font-weight: 700;
        color: #334155;
    }
    .day-num.sun { color: #dc2626; }
    .day-num.sat { color: #2563eb; }
    .hol-name {
        font-size: 9px;
        font-weight: 700;
        color: #dc2626;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .duty-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .duty-badge {
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 10px;
        line-height: 1.25;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 4px;
    }
    .duty-title {
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .duty-staff {
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .doc-footer {
        margin-top: 6px;
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #64748b;
    }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;

            const win = window.open('', '_blank', 'width=1150,height=820');
            if (!win) {
                alert('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.');
                return;
            }
            win.document.open();
            win.document.write(html);
            win.document.close();
            setShowPrintModal(false);
            setTimeout(() => {
                win.focus();
                win.print();
            }, 300);
        } catch (err) {
            console.error(err);
            alert('인쇄 데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setPrinting(false);
        }
    };

    const handleUpdateScheduleStaff = async (scheduleId, newStaffId) => {
        try {
            await api.patch(`/hr/duties/schedules/${scheduleId}`, {
                staff_id: Number(newStaffId),
                note: '수동 대타 변경',
            });
            await fetchSchedules();
        } catch (err) {
            alert(err.response?.data?.detail || '변경 실패');
        }
    };

    const handleUpdateScheduleDate = async (scheduleId, newDate) => {
        if (!newDate) return;
        try {
            await api.patch(`/hr/duties/schedules/${scheduleId}`, {
                duty_date: newDate,
                note: '날짜 수동 변경',
            });
            await fetchSchedules();
        } catch (err) {
            alert(err.response?.data?.detail || '날짜 변경 실패');
        }
    };

    const handleToggleScheduleDone = async (sched) => {
        const nextStatus = sched.status === 'DONE' ? 'ASSIGNED' : 'DONE';
        try {
            await api.patch(`/hr/duties/schedules/${sched.id}`, { status: nextStatus });
            await fetchSchedules();
        } catch (err) {
            alert(err.response?.data?.detail || '상태 변경 실패');
        }
    };

    const handleDeleteSchedule = async (scheduleId) => {
        if (!window.confirm('이 날짜의 당번 배정을 삭제하시겠습니까?')) return;
        try {
            await api.delete(`/hr/duties/schedules/${scheduleId}`);
            await fetchSchedules();
        } catch (err) {
            alert(err.response?.data?.detail || '삭제 실패');
        }
    };

    const toggleWeekday = (list, dayKey) => {
        return list.includes(dayKey) ? list.filter(d => d !== dayKey) : [...list, dayKey].sort((a, b) => a - b);
    };

    const moveMember = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= memberIds.length) return;
        const copy = [...memberIds];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        setMemberIds(copy);
    };

    const prevMonth = () => {
        if (month === 1) { setYear(y => y - 1); setMonth(12); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 12) { setYear(y => y + 1); setMonth(1); }
        else setMonth(m => m + 1);
    };

    const getDayLabel = (dateStr) => {
        const d = new Date(`${dateStr}T00:00:00`);
        return WEEKDAYS[(d.getDay() + 6) % 7]?.label || '';
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 좌측: 공용관리 항목 목록 */}
            <div className="lg:col-span-4 space-y-4">
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-base font-bold text-white">공용관리 항목</h3>
                            <p className="text-xs text-gray-400">분리수거, 화장실 청소 등 순환 당번 항목</p>
                        </div>
                        <button
                            onClick={() => setShowNewForm(v => !v)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg"
                        >
                            <Plus className="w-3.5 h-3.5" /> 항목 추가
                        </button>
                    </div>

                    {showNewForm && (
                        <form onSubmit={handleCreateConfig} className="mb-4 p-3 bg-gray-900/80 border border-gray-700 rounded-lg space-y-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">항목명</label>
                                <input
                                    type="text"
                                    value={newForm.name}
                                    onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                                    placeholder="예: 분리수거 배출, 공장 화장실 청소"
                                    className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">배정 요일</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {WEEKDAYS.map(w => {
                                        const active = newForm.weekdays.includes(w.key);
                                        return (
                                            <button
                                                type="button"
                                                key={w.key}
                                                onClick={() => setNewForm({ ...newForm, weekdays: toggleWeekday(newForm.weekdays, w.key) })}
                                                className={`px-2.5 py-1 rounded text-xs font-medium border ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                                            >
                                                {w.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">공지 시각</label>
                                    <input
                                        type="time"
                                        value={newForm.notify_time}
                                        onChange={e => setNewForm({ ...newForm, notify_time: e.target.value })}
                                        className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">달력 색상</label>
                                    <div className="flex items-center gap-1.5 pt-1">
                                        {COLOR_PRESETS.map(c => (
                                            <button
                                                type="button"
                                                key={c}
                                                onClick={() => setNewForm({ ...newForm, color: c })}
                                                className={`w-5 h-5 rounded-full border-2 ${newForm.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button type="button" onClick={() => setShowNewForm(false)} className="px-3 py-1 text-xs text-gray-400 hover:text-white">취소</button>
                                <button type="submit" className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded">등록</button>
                            </div>
                        </form>
                    )}

                    <div className="space-y-2">
                        {loading && configs.length === 0 ? (
                            <div className="text-center py-6 text-xs text-gray-500">불러오는 중...</div>
                        ) : configs.length === 0 ? (
                            <div className="text-center py-8 text-xs text-gray-500 border border-dashed border-gray-700 rounded-lg">
                                등록된 공용관리 항목이 없습니다.<br />상단 [항목 추가] 버튼으로 추가하세요.
                            </div>
                        ) : (
                            configs.map(cfg => {
                                const isSelected = cfg.id === selectedConfigId;
                                const wdLabels = (cfg.weekdays || []).map(k => WEEKDAYS.find(w => w.key === k)?.label).filter(Boolean).join('·');
                                return (
                                    <div
                                        key={cfg.id}
                                        onClick={() => setSelectedConfigId(cfg.id)}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                            isSelected ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cfg.color || '#10b981' }} />
                                                <span className="text-sm font-semibold text-white">{cfg.name}</span>
                                                {!cfg.is_active && <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">비활성</span>}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteConfig(cfg.id); }}
                                                className="text-gray-500 hover:text-red-400 p-1"
                                                title="삭제"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
                                            <span>요일: {wdLabels || '미지정'}</span>
                                            <span>공지: {cfg.notify_time || '08:30'} · {(cfg.members || []).length}명</span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* 우측: 선택된 항목 상세 설정 + 대상자 순번 + 월간 당번표 */}
            <div className="lg:col-span-8 space-y-6">
                {selectedConfig && editConfig ? (
                    <>
                        {/* 기본 설정 및 순번 */}
                        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-700 pb-3">
                                <div className="flex items-center gap-2">
                                    <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: editConfig.color }} />
                                    <h3 className="text-base font-bold text-white">{selectedConfig.name} 설정</h3>
                                </div>
                                <button
                                    onClick={handleSaveConfigAndMembers}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                                >
                                    <Save className="w-3.5 h-3.5" /> 설정 및 순번 저장
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">항목명</label>
                                    <input
                                        type="text"
                                        value={editConfig.name}
                                        onChange={e => setEditConfig({ ...editConfig, name: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" /> 아침 공지 시각
                                    </label>
                                    <input
                                        type="time"
                                        value={editConfig.notify_time}
                                        onChange={e => setEditConfig({ ...editConfig, notify_time: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">달력 표시 색상</label>
                                    <div className="flex items-center gap-2 pt-1.5">
                                        {COLOR_PRESETS.map(c => (
                                            <button
                                                type="button"
                                                key={c}
                                                onClick={() => setEditConfig({ ...editConfig, color: c })}
                                                className={`w-6 h-6 rounded-full border-2 ${editConfig.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1.5">배정 요일 (공휴일은 자동 제외됩니다)</label>
                                <div className="flex flex-wrap gap-2">
                                    {WEEKDAYS.map(w => {
                                        const active = editConfig.weekdays.includes(w.key);
                                        return (
                                            <button
                                                type="button"
                                                key={w.key}
                                                onClick={() => setEditConfig({ ...editConfig, weekdays: toggleWeekday(editConfig.weekdays, w.key) })}
                                                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                                    active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                {w.label}요일
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 대상 직원 및 순번 */}
                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <label className="text-xs font-semibold text-gray-300">
                                        순환 대상 직원 및 순서 ({memberIds.length}명) — 휴가자가 있으면 다음 순번으로 자동 이월됩니다.
                                    </label>
                                    <button
                                        type="button"
                                        onClick={openStaffSelectModal}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg"
                                    >
                                        <Users className="w-3.5 h-3.5" /> 대상 직원 선택 ({memberIds.length}명)
                                    </button>
                                </div>

                                <div className="bg-gray-900/70 border border-gray-700 rounded-lg divide-y divide-gray-800">
                                    {memberIds.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-gray-500">
                                            대상 직원을 추가해 순번을 지정하세요.
                                        </div>
                                    ) : (
                                        memberIds.map((sid, idx) => {
                                            const st = staffList.find(s => s.id === sid);
                                            return (
                                                <div key={sid} className="flex items-center justify-between px-3 py-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-6 h-6 rounded-full bg-blue-900/60 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-sm font-medium text-white">{st?.name || `직원#${sid}`}</span>
                                                        <span className="text-xs text-gray-400">{st?.role || ''}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => moveMember(idx, -1)}
                                                            disabled={idx === 0}
                                                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                                                        >
                                                            <ArrowUp className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveMember(idx, 1)}
                                                            disabled={idx === memberIds.length - 1}
                                                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                                                        >
                                                            <ArrowDown className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setMemberIds(memberIds.filter(id => id !== sid))}
                                                            className="p-1 text-gray-400 hover:text-red-400 ml-1"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 기간 지정 자동 배정 및 당번표 */}
                        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
                            <div className="p-3.5 bg-gray-900/80 border border-gray-700 rounded-lg space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-gray-200">기간 지정 일괄 자동 배정</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        <button type="button" onClick={() => setQuickPeriod(1)} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] text-gray-300">이번 달</button>
                                        <button type="button" onClick={() => setQuickPeriod(3)} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] text-gray-300">3개월</button>
                                        <button type="button" onClick={() => setQuickPeriod(6)} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] text-gray-300">6개월</button>
                                        <button type="button" onClick={() => setQuickPeriod('year_end')} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] text-gray-300">올해 말까지</button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            type="date"
                                            value={assignStart}
                                            onChange={e => setAssignStart(e.target.value)}
                                            className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                                        />
                                        <span className="text-gray-400 text-xs">~</span>
                                        <input
                                            type="date"
                                            value={assignEnd}
                                            onChange={e => setAssignEnd(e.target.value)}
                                            className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                                        />
                                        <select
                                            value={holidayShift}
                                            onChange={e => setHolidayShift(e.target.value)}
                                            className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                                            title="공휴일 겹침 시 배정 방식"
                                        >
                                            <option value="NEXT">공휴일 시 다음날(영업일) 배정</option>
                                            <option value="PREV">공휴일 시 전날(영업일) 배정</option>
                                            <option value="SKIP">공휴일 시 건너뛰기</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={handleGeneratePeriod}
                                        disabled={generating}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        {generating ? '배정 중...' : '지정 기간 자동 배정 생성'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-emerald-400" />
                                    <div className="flex items-center gap-2">
                                        <button onClick={prevMonth} className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 hover:text-white">◀</button>
                                        <span className="text-base font-bold text-white min-w-[100px] text-center">{year}년 {month}월</span>
                                        <button onClick={nextMonth} className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 hover:text-white">▶</button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={openPrintModal}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                                    >
                                        <Printer className="w-3.5 h-3.5" /> 달력 인쇄
                                    </button>
                                    <button
                                        onClick={fetchSchedules}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white"
                                        title="새로고침"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> 새로고침
                                    </button>
                                </div>
                            </div>

                            {Object.keys(holidaysMap).length > 0 && (
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <span className="text-gray-400">이달의 한국 공휴일(자동 제외):</span>
                                    {Object.entries(holidaysMap).map(([dt, name]) => (
                                        <span key={dt} className="px-2 py-0.5 bg-red-900/30 border border-red-700/50 text-red-300 rounded">
                                            {dt.slice(5)} {name}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="overflow-x-auto border border-gray-700 rounded-lg">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-900 text-gray-400">
                                        <tr>
                                            <th className="px-3 py-2.5">날짜 (수정 가능)</th>
                                            <th className="px-3 py-2.5">요일</th>
                                            <th className="px-3 py-2.5">담당자 (대타 변경 가능)</th>
                                            <th className="px-3 py-2.5">상태</th>
                                            <th className="px-3 py-2.5">알림</th>
                                            <th className="px-3 py-2.5">비고</th>
                                            <th className="px-3 py-2.5 text-right">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700/60 bg-gray-800/40">
                                        {schedules.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                    이 달에 배정된 일정이 없습니다. 상단 [자동 배정 생성] 버튼을 눌러 배정하세요.
                                                </td>
                                            </tr>
                                        ) : (
                                            schedules.map(sch => (
                                                <tr key={sch.id} className="hover:bg-gray-700/30">
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="date"
                                                            value={sch.duty_date}
                                                            onChange={e => handleUpdateScheduleDate(sch.id, e.target.value)}
                                                            className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white font-medium"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-300">{getDayLabel(sch.duty_date)}</td>
                                                    <td className="px-3 py-2">
                                                        <select
                                                            value={sch.staff_id}
                                                            onChange={e => handleUpdateScheduleStaff(sch.id, e.target.value)}
                                                            className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white"
                                                        >
                                                            {staffList.map(st => (
                                                                <option key={st.id} value={st.id}>{st.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button
                                                            onClick={() => handleToggleScheduleDone(sch)}
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                                                sch.status === 'DONE'
                                                                    ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                                                                    : 'bg-gray-900 text-gray-300 border border-gray-700 hover:border-emerald-600'
                                                            }`}
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            {sch.status === 'DONE' ? '완료' : '배정됨'}
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {sch.notified_at ? (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-700/60 text-emerald-300 text-[11px]"
                                                                title={`발송 시각: ${sch.notified_at}`}
                                                            >
                                                                발송됨 {String(sch.notified_at).slice(11, 16)}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-900 border border-gray-700 text-gray-400 text-[11px]">
                                                                대기
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-400">{sch.note || '-'}</td>
                                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleNotifyScheduleNow(sch)}
                                                            className="text-amber-400 hover:text-amber-300 p-1 mr-1"
                                                            title="담당자에게 지금 푸시 알림 발송"
                                                        >
                                                            <Bell className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteSchedule(sch.id)}
                                                            className="text-gray-500 hover:text-red-400 p-1"
                                                            title="일정 삭제"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center text-sm text-gray-400">
                        좌측에서 공용관리 항목을 선택하거나 새로 추가해 주세요.
                    </div>
                )}
            </div>

            {/* 대상 직원 일괄 선택 모달 */}
            {showStaffModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                            <div>
                                <h4 className="text-base font-bold text-white">대상 직원 선택</h4>
                                <p className="text-xs text-gray-400">체크한 직원들이 순환 당번 대상자로 등록됩니다.</p>
                            </div>
                            <button onClick={() => setShowStaffModal(false)} className="text-gray-400 hover:text-white p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 border-b border-gray-700 space-y-3">
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={staffSearch}
                                    onChange={e => setStaffSearch(e.target.value)}
                                    placeholder="이름, 부서, 직책 검색..."
                                    className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white"
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-300 font-medium">선택됨: <strong className="text-blue-400">{modalSelectedIds.length}명</strong></span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalSelectedIds(staffList.map(s => s.id))}
                                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                                    >
                                        전체 선택
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalSelectedIds([])}
                                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                                    >
                                        전체 해제
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {staffList
                                .filter(s => {
                                    const q = staffSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    return (s.name || '').toLowerCase().includes(q)
                                        || (s.role || '').toLowerCase().includes(q)
                                        || (s.department || '').toLowerCase().includes(q);
                                })
                                .map(st => {
                                    const checked = modalSelectedIds.includes(st.id);
                                    return (
                                        <label
                                            key={st.id}
                                            className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                                                checked
                                                    ? 'bg-blue-900/30 border-blue-500/60 text-white'
                                                    : 'bg-gray-900/40 border-gray-800 text-gray-300 hover:bg-gray-900'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleModalStaff(st.id)}
                                                    className="w-4 h-4 rounded accent-blue-600"
                                                />
                                                <span className="text-sm font-medium">{st.name}</span>
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {[st.department, st.role].filter(Boolean).join(' · ') || '직원'}
                                            </span>
                                        </label>
                                    );
                                })}
                        </div>

                        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-700">
                            <button
                                type="button"
                                onClick={() => setShowStaffModal(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-lg"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={applyModalStaffSelection}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg"
                            >
                                선택 적용 ({modalSelectedIds.length}명)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 월간 달력 인쇄 옵션 모달 */}
            {showPrintModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                            <div className="flex items-center gap-2">
                                <Printer className="w-5 h-5 text-emerald-400" />
                                <div>
                                    <h4 className="text-base font-bold text-white">공용관리 당번표 달력 인쇄</h4>
                                    <p className="text-xs text-gray-400">출력할 기간과 항목을 선택하세요.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-white p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5 overflow-y-auto">
                            {/* 기간 선택 */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-gray-300">출력 기간 (월 단위)</label>
                                    <div className="flex gap-1">
                                        <button type="button" onClick={() => setPrintQuickMonth('this')} className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-[11px] text-gray-200 rounded">이번 달</button>
                                        <button type="button" onClick={() => setPrintQuickMonth('next')} className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-[11px] text-gray-200 rounded">다음 달</button>
                                        <button type="button" onClick={() => setPrintQuickMonth('3m')} className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-[11px] text-gray-200 rounded">3개월</button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="month"
                                        value={printStartMonth}
                                        onChange={e => setPrintStartMonth(e.target.value)}
                                        className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white"
                                    />
                                    <span className="text-gray-400 text-xs">~</span>
                                    <input
                                        type="month"
                                        value={printEndMonth}
                                        onChange={e => setPrintEndMonth(e.target.value)}
                                        className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white"
                                    />
                                </div>
                            </div>

                            {/* 항목 선택 */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-gray-300">출력 항목 선택 ({printConfigIds.length}/{configs.length})</label>
                                    <div className="flex gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setPrintConfigIds(configs.map(c => c.id))}
                                            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-[11px] text-gray-200 rounded"
                                        >
                                            전체 선택
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPrintConfigIds([])}
                                            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-[11px] text-gray-200 rounded"
                                        >
                                            전체 해제
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto bg-gray-900/60 border border-gray-700 rounded-lg p-2.5">
                                    {configs.length === 0 ? (
                                        <div className="text-xs text-gray-500 text-center py-4">등록된 항목이 없습니다.</div>
                                    ) : (
                                        configs.map(cfg => {
                                            const checked = printConfigIds.includes(cfg.id);
                                            return (
                                                <label
                                                    key={cfg.id}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer border ${
                                                        checked ? 'bg-emerald-900/20 border-emerald-600/50 text-white' : 'bg-gray-800/40 border-gray-800 text-gray-400'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => togglePrintConfig(cfg.id)}
                                                            className="w-4 h-4 rounded accent-emerald-500"
                                                        />
                                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color || '#10b981' }} />
                                                        <span className="text-xs font-semibold">{cfg.name}</span>
                                                    </div>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* 용지 방향 */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-300">용지 방향</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPrintOrientation('landscape')}
                                        className={`py-2 rounded-lg text-xs font-semibold border ${
                                            printOrientation === 'landscape'
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-gray-900 border-gray-700 text-gray-400'
                                        }`}
                                    >
                                        A4 가로 (권장)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPrintOrientation('portrait')}
                                        className={`py-2 rounded-lg text-xs font-semibold border ${
                                            printOrientation === 'portrait'
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-gray-900 border-gray-700 text-gray-400'
                                        }`}
                                    >
                                        A4 세로
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-700">
                            <button
                                type="button"
                                onClick={() => setShowPrintModal(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-lg"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handlePrintCalendar}
                                disabled={printing}
                                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
                            >
                                <Printer className="w-4 h-4" />
                                {printing ? '준비 중...' : '인쇄하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommonDutyTab;
