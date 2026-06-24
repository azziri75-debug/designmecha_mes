import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

/* ─── 이벤트 타입별 스타일 ─────────────────────────────────── */
const TYPE_STYLE = {
  // 연차 계열
  '연차':  { bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
  '병가':  { bg: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
  '휴가':  { bg: '#e0f2fe', text: '#0369a1', dot: '#38bdf8' },
  // 조퇴/외출
  '조퇴':  { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
  '외출':  { bg: '#fefce8', text: '#a16207', dot: '#eab308' },
  // 야근/특근
  '야근':  { bg: '#f3e8ff', text: '#7e22ce', dot: '#a855f7' },
  '특근':  { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
};
const defaultStyle = { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
const getStyle = (type) => TYPE_STYLE[type] || defaultStyle;

/* ─── 헬퍼 ──────────────────────────────────────────────────── */
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const isoToday = () => new Date().toISOString().slice(0, 10);

function buildCalendar(year, month) {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const lastDate = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) {
    const mm = String(month).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push(`${year}-${mm}-${dd}`);
  }
  return cells;
}

/* ─── 메인 컴포넌트 ─────────────────────────────────────────── */
const MobileTeamCalendar = () => {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState([]);   // [{date, name, type, category}]
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  /* ── 데이터 조회 ─────────────────────────────────────────── */
  const fetchEvents = useCallback(async (y, m) => {
    setLoading(true);
    try {
      const res = await api.get('/approval/team-schedule', { params: { year: y, month: m } });
      setEvents(res.data || []);
    } catch (e) {
      console.error('Team schedule fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(year, month); }, [year, month, fetchEvents]);

  /* ── 월 이동 ──────────────────────────────────────────────── */
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  /* ── 날짜별 이벤트 맵 ───────────────────────────────────── */
  const eventMap = {};
  events.forEach(ev => {
    if (!eventMap[ev.date]) eventMap[ev.date] = [];
    eventMap[ev.date].push(ev);
  });

  const cells = buildCalendar(year, month);
  const todayStr = isoToday();
  const selectedEvents = selectedDate ? (eventMap[selectedDate] || []) : [];

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'inherit' }}>

      {/* ── 헤더: 월 네비게이션 ─────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        color: '#fff',
        padding: '16px 20px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <button
            onClick={prevMonth}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10,
              color: '#fff', width: 36, height: 36, fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >‹</button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
              {year}년 {month}월
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              팀 일정 공유 캘린더
            </div>
          </div>

          <button
            onClick={nextMonth}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10,
              color: '#fff', width: 36, height: 36, fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >›</button>
        </div>

        {/* 범례 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', marginTop: 14 }}>
          {Object.entries(TYPE_STYLE).map(([label, s]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 캘린더 그리드 ───────────────────────────────────── */}
      <div style={{ padding: '12px 10px 0' }}>

        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{
              textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0',
              color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#64748b'
            }}>{d}</div>
          ))}
        </div>

        {/* 날짜 셀 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 14 }}>
            불러오는 중...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((dateStr, idx) => {
              if (!dateStr) return <div key={`empty-${idx}`} />;

              const dayNum   = parseInt(dateStr.slice(8));
              const dayOfWeek = new Date(dateStr).getDay();
              const isToday  = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const dayEvents = eventMap[dateStr] || [];
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  style={{
                    minHeight: 54,
                    borderRadius: 8,
                    padding: '4px 2px',
                    cursor: hasEvents ? 'pointer' : 'default',
                    background: isSelected ? '#1e293b' : isToday ? '#eff6ff' : '#fff',
                    border: isSelected ? '2px solid #3b82f6'
                          : isToday    ? '2px solid #bfdbfe'
                          : '1px solid #f1f5f9',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* 날짜 숫자 */}
                  <div style={{
                    textAlign: 'center', fontSize: 12, fontWeight: isToday ? 800 : 500,
                    color: isSelected ? '#fff'
                         : isToday   ? '#1d4ed8'
                         : dayOfWeek === 0 ? '#ef4444'
                         : dayOfWeek === 6 ? '#3b82f6'
                         : '#1e293b',
                    marginBottom: 2,
                  }}>{dayNum}</div>

                  {/* 이벤트 도트 목록 (최대 3개 + 더보기) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 1px' }}>
                    {dayEvents.slice(0, 2).map((ev, i) => {
                      const st = getStyle(ev.type);
                      return (
                        <div key={i} style={{
                          background: isSelected ? 'rgba(255,255,255,0.15)' : st.bg,
                          borderRadius: 3,
                          padding: '1px 3px',
                          display: 'flex', alignItems: 'center', gap: 2,
                          overflow: 'hidden',
                        }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%',
                            background: isSelected ? '#fff' : st.dot, flexShrink: 0 }} />
                          <span style={{
                            fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            color: isSelected ? '#e2e8f0' : st.text,
                          }}>{ev.name}</span>
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div style={{
                        fontSize: 9, color: isSelected ? 'rgba(255,255,255,0.6)' : '#94a3b8',
                        textAlign: 'center', fontWeight: 600
                      }}>+{dayEvents.length - 2}명</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 선택 날짜 상세 패널 ─────────────────────────────── */}
      {selectedDate && selectedEvents.length > 0 && (
        <div style={{ margin: '14px 10px 0', borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{
            background: '#1e293b', color: '#fff',
            padding: '12px 16px', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>
              {(() => {
                const d = new Date(selectedDate + 'T00:00:00');
                return `${d.getMonth()+1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`;
              })()}
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: 20,
              padding: '2px 10px', fontSize: 11
            }}>{selectedEvents.length}건</span>
          </div>

          <div style={{ background: '#fff' }}>
            {selectedEvents.map((ev, i) => {
              const st = getStyle(ev.type);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderBottom: i < selectedEvents.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: st.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {ev.category === 'LEAVE' && (ev.type === '병가' ? '🏥' : '🏖️')}
                    {ev.category === 'EARLY_LEAVE' && (ev.type === '외출' ? '🚶' : '🏃')}
                    {ev.category === 'OVERTIME' && (ev.type === '특근' ? '⭐' : '🌙')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      {ev.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                      {ev.type}
                    </div>
                  </div>
                  <div style={{
                    background: st.bg, color: st.text,
                    borderRadius: 20, padding: '4px 12px',
                    fontSize: 12, fontWeight: 700,
                  }}>{ev.type}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedDate && selectedEvents.length === 0 && (
        <div style={{ margin: '14px 10px 0', background: '#fff', borderRadius: 14,
          padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 13,
          border: '1px solid #f1f5f9' }}>
          이 날에는 등록된 일정이 없습니다
        </div>
      )}

      {/* ── 이번 달 요약 ────────────────────────────────────── */}
      {!loading && events.length > 0 && (
        <div style={{ margin: '14px 10px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b',
            marginBottom: 8, paddingLeft: 2 }}>이번 달 일정 요약</div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          }}>
            {Object.entries(
              events.reduce((acc, ev) => {
                acc[ev.type] = (acc[ev.type] || 0) + 1; return acc;
              }, {})
            ).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, cnt]) => {
              const st = getStyle(type);
              return (
                <div key={type} style={{
                  background: st.bg, borderRadius: 10, padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ fontSize: 10, color: st.text, fontWeight: 600 }}>{type}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: st.dot }}>{cnt}</div>
                  <div style={{ fontSize: 10, color: st.text, opacity: 0.7 }}>건</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && events.length === 0 && (
        <div style={{ margin: '30px 10px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>이번 달 등록된 일정이 없습니다</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>승인 완료된 기안이 있으면 여기에 표시됩니다</div>
        </div>
      )}
    </div>
  );
};

export default MobileTeamCalendar;
