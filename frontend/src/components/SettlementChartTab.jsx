import React, { useState, useEffect, useCallback } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import api from '../lib/api';

// ── 팔레트 ────────────────────────────────────────────────────────────────────
const COLORS = [
    '#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa',
    '#fb923c','#38bdf8','#4ade80','#e879f9','#94a3b8'
];

const fmt = (n) => new Intl.NumberFormat('ko-KR').format(Math.round(n || 0));
const fmtShort = (n) => {
    if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
    if (n >= 1_0000)      return `${(n / 1_0000).toFixed(0)}만`;
    return fmt(n);
};

// ── Tooltip 커스텀 ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, unit }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0];
    return (
        <div style={{
            background: '#1e293b',
            border: '1px solid #475569',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
        }}>
            <p style={{ color: '#ffffff', fontWeight: 600, marginBottom: 2 }}>{d.name}</p>
            <p style={{ color: d.fill || '#60a5fa', fontWeight: 700 }}>
                {unit === '건' ? `${fmt(d.value)}건` : `${fmt(d.value)}원`}
            </p>
        </div>
    );
};

// ── 개별 파이 카드 ─────────────────────────────────────────────────────────────
const PieCard = ({ title, data, unit = '원', color }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    const isEmpty = total === 0;

    const RADIAN = Math.PI / 180;
    const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
        if (percent < 0.05) return null;
        const r = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + r * Math.cos(-midAngle * RADIAN);
        const y = cy + r * Math.sin(-midAngle * RADIAN);
        return (
            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid #334155',
            borderRadius: 16,
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minHeight: 480,
        }}>
            {/* 제목 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 18, borderRadius: 2, background: color }} />
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 15 }}>{title}</span>
                <span style={{ color: '#64748b', fontSize: 12, marginLeft: 'auto' }}>
                    총 {unit === '건' ? `${fmtShort(total)}건` : `${fmtShort(total)}원`}
                </span>
            </div>

            {isEmpty ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 13 }}>
                    데이터 없음
                </div>
            ) : (
                <>
                    {/* 파이 — 1.5배 크게 */}
                    <ResponsiveContainer width="100%" height={270}>
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%" cy="50%"
                                innerRadius={65} outerRadius={115}
                                paddingAngle={2}
                                dataKey="value"
                                labelLine={false}
                                label={renderLabel}
                            >
                                {data.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip unit={unit} />} />
                        </PieChart>
                    </ResponsiveContainer>

                    {/* 범례 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {data.map((d, i) => {
                            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0';
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                                    <span style={{ color: '#cbd5e1', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                    <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>{pct}%</span>
                                    <span style={{ color: COLORS[i % COLORS.length], fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 60, textAlign: 'right' }}>
                                        {unit === '건' ? `${fmt(d.value)}건` : fmtShort(d.value)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

// ── 순위 카드 ──────────────────────────────────────────────────────────────────
const RankCard = ({ title, data, color }) => {
    const max = data[0]?.value || 1;
    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid #334155',
            borderRadius: 16,
            padding: '20px 16px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 4, height: 18, borderRadius: 2, background: color }} />
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>{title}</span>
                <span style={{ color: '#64748b', fontSize: 12, marginLeft: 'auto' }}>
                    합계 {fmtShort(total)}원
                </span>
            </div>

            {data.length === 0 ? (
                <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>데이터 없음</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.map((d, i) => {
                        const pct = ((d.value / max) * 100).toFixed(0);
                        const share = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0';
                        const rankColor = i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#fb923c' : '#475569';
                        return (
                            <div key={i}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{ color: rankColor, fontWeight: 700, fontSize: 13, width: 22, textAlign: 'right' }}>
                                        {i + 1}
                                    </span>
                                    <span style={{ color: '#cbd5e1', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{share}%</span>
                                    <span style={{ color: color, fontWeight: 600, fontSize: 13, minWidth: 70, textAlign: 'right' }}>
                                        {fmtShort(d.value)}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 4, paddingLeft: 30 }}>
                                    <div style={{
                                        height: 5, borderRadius: 3,
                                        width: `${pct}%`, background: color,
                                        opacity: 0.7, transition: 'width .5s ease',
                                        minWidth: 4
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ── 메인 ──────────────────────────────────────────────────────────────────────
const SettlementChartTab = () => {
    const today = new Date();
    const prevMonth = today.getMonth(); // 0=Jan → 전달
    const prevYear  = prevMonth === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const prevMon   = prevMonth === 0 ? 12 : prevMonth;

    const [year,  setYear]  = useState(prevYear);
    const [month, setMonth] = useState(prevMon);
    const [exchangeRate, setExchangeRate] = useState(1350); // USD→KRW 기본 환율
    const [data,  setData]  = useState(null);
    const [loading, setLoading] = useState(false);

    const years  = ['전체', ...Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i)];
    const months = ['전체', ...Array.from({ length: 12 }, (_, i) => i + 1)];

    const fetchChart = useCallback(async () => {
        setLoading(true);
        try {
            const params = { exchange_rate: exchangeRate };
            if (year  !== '전체') params.year  = year;
            if (month !== '전체') params.month = month;
            const res = await api.get('/settlement/chart-summary', { params });
            setData(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [year, month, exchangeRate]);

    useEffect(() => { fetchChart(); }, [fetchChart]);

    const pieCards = data ? [
        { title: '수주',       data: data.orders,     color: '#60a5fa' },
        { title: '매출',       data: data.sales,      color: '#34d399' },
        { title: '매입',       data: data.purchases,  color: '#fbbf24' },
        { title: '생산 비용',  data: data.production, color: '#a78bfa' },
        { title: '불량 금액',  data: data.defects,    color: '#f87171' },
        { title: '고객불만',   data: data.complaints, color: '#fb923c', unit: '건' },
    ] : [];

    const selStyle = {
        background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0',
        borderRadius: 8, padding: '6px 12px', fontSize: 14, cursor: 'pointer', outline: 'none'
    };
    const inputStyle = {
        ...selStyle,
        width: 90, textAlign: 'right',
    };

    return (
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* ── 필터 ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#64748b', fontSize: 13 }}>연도</span>
                    <select value={year} onChange={e => setYear(e.target.value === '전체' ? '전체' : Number(e.target.value))} style={selStyle}>
                        {years.map(y => <option key={y} value={y}>{y === '전체' ? '전체 연도' : `${y}년`}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#64748b', fontSize: 13 }}>월</span>
                    <select value={month} onChange={e => setMonth(e.target.value === '전체' ? '전체' : Number(e.target.value))} style={selStyle}>
                        {months.map(m => <option key={m} value={m}>{m === '전체' ? '전체 월' : `${m}월`}</option>)}
                    </select>
                </div>
                {/* 환율 입력 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#64748b', fontSize: 13 }}>USD 환율</span>
                    <input
                        type="number"
                        value={exchangeRate}
                        onChange={e => setExchangeRate(Number(e.target.value) || 1350)}
                        style={inputStyle}
                        min={1}
                        step={10}
                    />
                    <span style={{ color: '#475569', fontSize: 12 }}>원/USD</span>
                </div>
                <span style={{ color: '#475569', fontSize: 12 }}>
                    {year === '전체' && month === '전체' ? '전체 기간' :
                     year === '전체' ? `매월 ${month}월` :
                     month === '전체' ? `${year}년 전체` :
                     `${year}년 ${month}월`}
                </span>
                {loading && <span style={{ color: '#60a5fa', fontSize: 12 }} className="animate-pulse">조회 중...</span>}
            </div>

            {/* ── 파이 차트 그리드 ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                gap: 20,
            }}>
                {pieCards.map(card => (
                    <PieCard
                        key={card.title}
                        title={card.title}
                        data={card.data}
                        unit={card.unit || '원'}
                        color={card.color}
                    />
                ))}
            </div>

            {/* ── 거래처 순위 ── */}
            {data && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <RankCard title="매출처 순위 Top10" data={data.sales_ranking}    color="#34d399" />
                    <RankCard title="매입처 순위 Top10" data={data.purchase_ranking} color="#fbbf24" />
                </div>
            )}
        </div>
    );
};

export default SettlementChartTab;
