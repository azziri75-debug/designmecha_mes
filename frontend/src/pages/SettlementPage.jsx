import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { 
    FileText, 
    Download, 
    Calendar, 
    Layers, 
    Search,
    ChevronRight,
    Filter,
    ArrowUpDown,
    TrendingDown,
    TrendingUp,
    RefreshCw,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import ResizableTable from '../components/ResizableTable';
import { formatCurrency } from '../utils/currency';
import SettlementChartTab from '../components/SettlementChartTab';

/* ══════════════════════════════════════════════════════════════════════
   원가분석 탭 컴포넌트
   ══════════════════════════════════════════════════════════════════════ */
const CostAnalysisTab = ({ majorGroupId, groups, onDrillDown }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sortKey, setSortKey] = useState('cost_rate');
    const [sortDir, setSortDir] = useState('desc');
    const [filterText, setFilterText] = useState('');

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (majorGroupId && majorGroupId !== '소모품') params.major_group_id = majorGroupId;
            const res = await api.get('/settlement/cost-analysis', { params });
            setData(res.data || []);
        } catch (e) {
            console.error(e);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [majorGroupId]);

    useEffect(() => { fetch(); }, [fetch]);

    const handleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const sorted = useMemo(() => {
        let rows = data.filter(r =>
            !filterText ||
            r.product_name?.includes(filterText) ||
            r.partner_name?.includes(filterText) ||
            r.specification?.includes(filterText)
        );
        rows = [...rows].sort((a, b) => {
            const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
            const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
            return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
        return rows;
    }, [data, sortKey, sortDir, filterText]);

    // 요약 통계
    const stats = useMemo(() => {
        const withRate = sorted.filter(r => r.cost_rate !== null);
        if (!withRate.length) return null;
        const avg = withRate.reduce((s, r) => s + r.cost_rate, 0) / withRate.length;
        const high = withRate.filter(r => r.cost_rate >= 100).length;
        const warn = withRate.filter(r => r.cost_rate >= 80 && r.cost_rate < 100).length;
        const good = withRate.filter(r => r.cost_rate < 80).length;
        return { avg, high, warn, good, total: withRate.length };
    }, [sorted]);

    const Th = ({ label, col, align = 'left' }) => (
        <th
            className={`px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-white border-b border-gray-700 text-${align} whitespace-nowrap`}
            onClick={() => handleSort(col)}
        >
            {label}
            {sortKey === col && (
                <span className="ml-1 text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
            )}
        </th>
    );

    const handleDownload = () => {
        const rows = sorted.map((r, i) => ({
            'No': i + 1,
            '거래처': r.partner_name || '',
            '품명': r.product_name,
            '규격': r.specification || '',
            '생산수량': r.quantity,
            '수주단가(원)': r.latest_unit_price,
            '단위원가(원)': r.cost_per_unit,
            '공정비용합계': r.total_process_cost ? Math.round(r.total_process_cost) : 0,
            '원가율(%)': r.cost_rate,
            '최근완료일': r.latest_completion_date,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '원가분석');
        XLSX.writeFile(wb, `원가분석_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    };

    return (
        <div className="space-y-4">
            {/* 요약 카드 */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1">분석 품목 수</p>
                        <p className="text-2xl font-bold text-white">{stats.total}<span className="text-sm font-normal text-gray-500 ml-1">개</span></p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1">평균 원가율</p>
                        <p className={`text-2xl font-bold ${stats.avg >= 100 ? 'text-red-400' : stats.avg >= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {stats.avg.toFixed(1)}<span className="text-sm font-normal ml-1">%</span>
                        </p>
                    </div>
                    <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4">
                        <p className="text-xs text-red-400 mb-1">🔴 원가율 100% 이상 (위험)</p>
                        <p className="text-2xl font-bold text-red-400">{stats.high}<span className="text-sm font-normal ml-1">개</span></p>
                    </div>
                    <div className="bg-amber-900/20 border border-amber-900/40 rounded-xl p-4">
                        <p className="text-xs text-amber-400 mb-1">🟡 원가율 80~99% (주의)</p>
                        <p className="text-2xl font-bold text-amber-400">{stats.warn}<span className="text-sm font-normal ml-1">개</span></p>
                    </div>
                </div>
            )}

            {/* 검색 + 다운로드 */}
            <div className="flex gap-2 items-center">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="품명 / 거래처 / 규격 검색..."
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                    />
                </div>
                <button
                    onClick={fetch}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    새로고침
                </button>
                <button
                    onClick={handleDownload}
                    disabled={!sorted.length}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700/30 border border-emerald-700/50 rounded-lg text-sm text-emerald-400 hover:bg-emerald-700/50 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    엑셀
                </button>
            </div>

            {/* 테이블 */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead className="bg-gray-800/80">
                            <tr>
                                <th className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700 text-center w-10">No</th>
                                <Th label="거래처" col="partner_name" />
                                <Th label="품명" col="product_name" />
                                <Th label="규격" col="specification" />
                                <Th label="수량" col="quantity" align="right" />
                                <Th label="수주단가(원)" col="latest_unit_price" align="right" />
                                <Th label="단위원가(원)" col="cost_per_unit" align="right" />
                                <Th label="공정비용합계" col="total_process_cost" align="right" />
                                <Th label="원가율(%)" col="cost_rate" align="right" />
                                <Th label="최근완료일" col="latest_completion_date" />
                                <th className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700 text-center">공정상세</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-300 divide-y divide-gray-800">
                            {loading ? (
                                <tr><td colSpan={11} className="px-4 py-20 text-center text-gray-500 animate-pulse">데이터를 불러오는 중...</td></tr>
                            ) : sorted.length === 0 ? (
                                <tr><td colSpan={11} className="px-4 py-20 text-center text-gray-600">
                                    공정비용이 입력된 생산완료 품목이 없습니다.
                                </td></tr>
                            ) : sorted.map((row, i) => {
                                const rate = row.cost_rate;
                                const rateColor = rate === null ? 'text-gray-500'
                                    : rate >= 100 ? 'text-red-400 font-bold'
                                    : rate >= 80  ? 'text-amber-400 font-semibold'
                                    : 'text-emerald-400';
                                const rowBg = rate >= 100 ? 'bg-red-900/10 hover:bg-red-900/20'
                                    : rate >= 80  ? 'bg-amber-900/10 hover:bg-amber-900/20'
                                    : 'hover:bg-gray-800/50';
                                return (
                                    <tr key={`${row.product_id}-${i}`} className={`transition-colors ${rowBg}`}>
                                        <td className="px-3 py-2 text-center text-gray-600 text-xs">{i + 1}</td>
                                        <td className="px-3 py-2 text-xs text-gray-400">{row.partner_name || '-'}</td>
                                        <td className="px-3 py-2 font-medium text-white">{row.product_name}</td>
                                        <td className="px-3 py-2 text-xs text-gray-400">{row.specification || '-'}</td>
                                        <td className="px-3 py-2 text-right font-mono text-sm">{(row.quantity || 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right font-mono text-sm text-blue-300">
                                            {row.latest_unit_price ? row.latest_unit_price.toLocaleString() : <span className="text-gray-600">-</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-sm text-purple-300">
                                            {row.cost_per_unit ? row.cost_per_unit.toLocaleString() : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-sm text-gray-300">
                                            {row.total_process_cost ? Math.round(row.total_process_cost).toLocaleString() : '-'}
                                        </td>
                                        <td className={`px-3 py-2 text-right ${rateColor}`}>
                                            {rate !== null ? `${rate.toFixed(1)}%` : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-500">{row.latest_completion_date || '-'}</td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                onClick={() => onDrillDown({ plan_id: row.plan_id, product_id: row.product_id, product_name: row.product_name })}
                                                className="text-xs px-2 py-1 bg-blue-900/30 text-blue-400 border border-blue-900/50 rounded hover:bg-blue-900/50 transition-colors"
                                            >
                                                공정보기
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 범례 */}
            <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-900/40 border border-red-700/50 inline-block"/> 원가율 100% 이상 — 판매단가 미만 (손실 위험)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-900/40 border border-amber-700/50 inline-block"/> 원가율 80~99% — 마진 10~20% (주의)</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-800 border border-gray-700 inline-block"/> 원가율 80% 미만 — 마진 20% 이상 (양호)</span>
            </div>
        </div>
    );
};

const SettlementPage = () => {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1); // null = 전체월
    const [majorGroupId, setMajorGroupId] = useState("");
    const [activeTab, setActiveTab] = useState("orders");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [prodDetail, setProdDetail] = useState(null); // 생산내역 공정별 상세모달
    const [prodDetailLoading, setProdDetailLoading] = useState(false);
    const [groups, setGroups] = useState([]);
    const [exchangeRate, setExchangeRate] = useState(1350); // 1 USD = N KRW
    const [rateLoading, setRateLoading] = useState(true);
    const [rateDate, setRateDate] = useState(null);
    const [availableYears, setAvailableYears] = useState([today.getFullYear()]);
    const [basis, setBasis] = useState("amount"); // "amount" or "qty"
    const [annualData, setAnnualData] = useState({ data: [], overall_total_qty: 0, overall_total_amount: 0 });

    const tabs = [
        { id: "orders",        label: "수주내역" },
        { id: "sales",         label: "매출내역" },
        { id: "purchases",     label: "매입내역" },
        { id: "production",    label: "생산내역" },
        { id: "defects",       label: "불량내역" },
        { id: "complaints",    label: "고객불만" },
        { id: "annual",        label: "품목별 연간실적" },
        { id: "cost-analysis", label: "💰 원가분석" },
        { id: "chart",         label: "📊 차트 분석" },
    ];

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                const res = await api.get('/product/groups/');
                setGroups(res.data.filter(g => g.type === 'MAJOR') || []);
            } catch (e) { console.error(e); }
        };
        const fetchYears = async () => {
            try {
                const res = await api.get('/settlement/available-years');
                if (res.data && res.data.length > 0) {
                    setAvailableYears(res.data);
                }
            } catch (e) { console.error(e); }
        };
        fetchGroups();
        fetchYears();
    }, []);

    // 실시간 환율 조회 (open.er-api.com - 무료, API키 불필요)
    useEffect(() => {
        const fetchExchangeRate = async () => {
            setRateLoading(true);
            try {
                const res = await fetch('https://open.er-api.com/v6/latest/USD');
                const json = await res.json();
                if (json?.result === 'success' && json?.rates?.KRW) {
                    setExchangeRate(Math.round(json.rates.KRW));
                    // 고시 날짜 파싱 (time_last_update_utc)
                    if (json.time_last_update_utc) {
                        const d = new Date(json.time_last_update_utc);
                        setRateDate(`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`);
                    }
                }
            } catch (e) {
                console.warn('환율 조회 실패, 기본값 유지:', e);
            } finally {
                setRateLoading(false);
            }
        };
        fetchExchangeRate();
    }, []);

    useEffect(() => {
        // 매입내역 탭이 아닌 경우 소모품 필터 초기화
        if (activeTab !== 'purchases' && majorGroupId === '소모품') {
            setMajorGroupId('');
        }
        if (activeTab !== 'chart' && activeTab !== 'cost-analysis') fetchData();
    }, [year, month, majorGroupId, activeTab, exchangeRate, basis]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'annual') {
                const params = { year, exchange_rate: exchangeRate };
                if (majorGroupId && majorGroupId !== '소모품') params.major_group_id = majorGroupId;
                const res = await api.get('/settlement/annual-performance', { params });
                setAnnualData(res.data || { data: [], overall_total_qty: 0, overall_total_amount: 0 });
                setData([]); // Clear standard data
            } else {
                const params = { year };
                if (month) params.month = month; // null이면 미전송 = 전체월
                if (activeTab === 'purchases' && majorGroupId === '소모품') {
                    // 소모품 필터: dept 파라미터로 전달
                    params.dept = '소모품';
                } else if (majorGroupId && majorGroupId !== '소모품') {
                    params.major_group_id = majorGroupId;
                }
                const res = await api.get(`/settlement/${activeTab}`, { params });
                setData(res.data || []);
            }
        } catch (e) {
            console.error(e);
            setData([]);
            setAnnualData({ data: [], overall_total_qty: 0, overall_total_amount: 0 });
        } finally {
            setLoading(false);
        }
    };

    const fmtWon = (val) => new Intl.NumberFormat('ko-KR').format(val || 0) + '원';
    const fmtNum = (val) => new Intl.NumberFormat('ko-KR').format(val || 0);

    const fetchProdDetail = async (item) => {
        if (!item.plan_id) return;
        setProdDetailLoading(true);
        setProdDetail({ item, processes: [] });
        try {
            const params = item.product_id ? { product_id: item.product_id } : {};
            const res = await api.get(`/settlement/production/${item.plan_id}/processes`, { params });
            setProdDetail({ item, processes: res.data || [] });
        } catch (e) {
            console.error(e);
            setProdDetail(null);
        } finally {
            setProdDetailLoading(false);
        }
    };
    // 통화 인식 포맷 (currency 필드 필요)
    const fmtWithCurrency = (val, row, key) => {
        const cur = row?.currency || 'KRW';
        return formatCurrency(val, cur);
    };

    const getColumns = () => {
        const noCol = { key: "no", label: "No", width: 60, noResize: true, thClassName: "text-center" };
        switch (activeTab) {
            case "orders":
                return [
                    noCol,
                    { key: "partner_name", label: "업체명", width: 140 },
                    { key: "order_date", label: "수주일", width: 110 },
                    { key: "product_name", label: "품명", width: 200 },
                    { key: "specification", label: "규격", width: 150 },
                    { key: "quantity", label: "수량", align: "right", width: 80 },
                    { key: "unit_price", label: "단가", align: "right", width: 120, renderCell: (val, row) => formatCurrency(val, row?.currency || 'KRW') },
                    { key: "total_price", label: "합계", align: "right", width: 140, renderCell: (val, row) => formatCurrency(val, row?.currency || 'KRW') },
                ];
            case "sales":
                return [
                    noCol,
                    { key: "partner_name", label: "업체명", width: 140 },
                    { key: "order_date", label: "수주일", width: 110 },
                    { key: "delivery_date", label: "납품일", width: 110 },
                    { key: "product_name", label: "품명", width: 180 },
                    { key: "specification", label: "규격", width: 150 },
                    { key: "quantity", label: "수량", align: "right", width: 80 },
                    { key: "unit_price", label: "단가", align: "right", width: 120, renderCell: (val, row) => formatCurrency(val, row?.currency || 'KRW') },
                    { key: "total_price", label: "합계", align: "right", width: 140, renderCell: (val, row) => formatCurrency(val, row?.currency || 'KRW') },
                ];
            case "purchases":
                return [
                    noCol,
                    { key: "category", label: "구분", width: 110, renderCell: (val) => {
                        const labels = {
                            'PAYMENT': '대금지급기안',
                            'OUTSOURCING': '외주',
                            'PART': '부품',
                            'MATERIAL': '자재',
                            'MRP': 'MRP',
                            'CONSUMABLE': '소모품',
                        };
                        return labels[val] || val || '-';
                    }},
                    { key: "dept", label: "기안부서", width: 120, renderCell: (val, row) => row?.category === 'PAYMENT' ? (val || '-') : '-' },
                    { key: "partner_name", label: "공급사", width: 140 },
                    { key: "order_date", label: "발주/기안일", width: 110 },
                    { key: "delivery_date", label: "입고/기안일", width: 110 },
                    { key: "product_name", label: "품명/항목", width: 180 },
                    { key: "specification", label: "규격", width: 150 },
                    { key: "quantity", label: "수량", align: "right", width: 80 },
                    { key: "unit_price", label: "단가", align: "right", width: 120, renderCell: (val, row) => formatCurrency(val, row?.currency || 'KRW') },
                    { key: "total_price", label: "합계", align: "right", width: 140, renderCell: (val, row) => formatCurrency(val, row?.currency || 'KRW') },
                ];

            case "production":
                return [
                    noCol,
                    { key: "partner_name", label: "업체명", width: 140 },
                    { key: "order_date", label: "수주일", width: 110 },
                    { key: "end_date", label: "생산완료일", width: 110 },
                    { key: "product_name", label: "품명", width: 180 },
                    { key: "specification", label: "규격", width: 150 },
                    { key: "quantity", label: "수량", align: "right", width: 80 },
                    { key: "order_amount", label: "수주금액", align: "right", width: 140,
                      renderCell: (val) => val != null && val > 0 ? fmtWon(val) : '-' },
                    { key: "process_cost", label: "총 공정비용", align: "right", width: 140,
                      renderCell: (val, row) => {
                          const overCost = row.order_amount > 0 && (val || 0) > row.order_amount;
                          return (
                              <span className={overCost ? 'text-red-400 font-black' : ''}>
                                  {fmtWon(val)}
                              </span>
                          );
                      }},
                ];
            case "defects":
                return [
                    noCol,
                    { key: "defect_date", label: "발생일", width: 110 },
                    { key: "process_name", label: "공정명", width: 130 },
                    { key: "partner_name", label: "고객사", width: 140 },
                    { key: "product_name", label: "품명", width: 180 },
                    { key: "specification", label: "규격", width: 150 },
                    { key: "quantity", label: "수량", align: "right", width: 80 },
                    { key: "amount", label: "금액", align: "right", format: fmtWon, width: 120 },
                    { key: "resolution_date", label: "처리일", width: 110 },
                ];
            case "complaints":
                return [
                    noCol,
                    { key: "receipt_date", label: "접수일", width: 110 },
                    { key: "partner_name", label: "고객사", width: 140 },
                    { key: "content", label: "내용", width: 300 },
                    { key: "status", label: "상태", width: 100 },
                    { key: "action_note", label: "조치내역", width: 250 },
                ];
            case "cost-analysis":
                return [
                    noCol,
                    { key: "partner_name",          label: "거래처",       width: 130 },
                    { key: "product_name",           label: "품명",         width: 200 },
                    { key: "specification",          label: "규격",         width: 130 },
                    { key: "quantity",               label: "생산수량",     align: "right", width: 80 },
                    { key: "latest_unit_price",      label: "수주단가(원)",  align: "right", width: 120,
                        renderCell: (val) => <span className="font-mono">{val ? val.toLocaleString() : '-'}</span> },
                    { key: "cost_per_unit",          label: "단위원가(원)",  align: "right", width: 120,
                        renderCell: (val) => <span className="font-mono">{val ? val.toLocaleString() : '-'}</span> },
                    { key: "total_process_cost",     label: "공정비용합계",  align: "right", width: 130,
                        renderCell: (val) => <span className="font-mono">{val ? Math.round(val).toLocaleString() : '-'}</span> },
                    { key: "cost_rate",              label: "원가율(%)",    align: "right", width: 100,
                        renderCell: (val) => {
                            if (val === null || val === undefined) return <span className="text-gray-500">-</span>;
                            const color = val >= 100 ? 'text-red-400' : val >= 80 ? 'text-amber-400' : 'text-emerald-400';
                            return <span className={`font-bold ${color}`}>{val.toFixed(1)}%</span>;
                        }},
                    { key: "latest_completion_date", label: "최근완료일",   width: 110 },
                ];
            default: return [];
        }
    };

    const totalSums = useMemo(() => {
        if (activeTab === 'annual') {
            const total = basis === 'amount' ? annualData.overall_total_amount : annualData.overall_total_qty;
            // For annual, we return a simpler structure or mock KRW/USD for compatibility
            return { krw: total, usd: 0, converted: total, isAnnual: true };
        }
        const sumKey = {
            orders: "total_price",
            sales: "total_price",
            purchases: "total_price",
            production: "process_cost",
            defects: "amount"
        }[activeTab];
        if (!sumKey) return null;
        const krw = data.filter(r => (r.currency || 'KRW') === 'KRW').reduce((a, c) => a + (c[sumKey] || 0), 0);
        const usd = data.filter(r => (r.currency || 'KRW') === 'USD').reduce((a, c) => a + (c[sumKey] || 0), 0);
        return { krw, usd, converted: krw + usd * exchangeRate };
    }, [data, activeTab, exchangeRate, annualData, basis]);

    const handleDownloadExcel = () => {
        const tabLabel = tabs.find(t => t.id === activeTab)?.label || "";
        const groupName = majorGroupId ? (groups.find(g => g.id === parseInt(majorGroupId))?.name || "") : "전체";
        const dateStr = format(new Date(), 'yyyy-MM-dd');

        if (activeTab === 'annual') {
            if (!annualData.data || annualData.data.length === 0) return;
            const fileName = `연간실적-${groupName}-${year}-${dateStr.replace(/-/g, '')}.xlsx`;
            
            const head1 = [`${year}년 품목별 연간 실적 (${basis === 'amount' ? '금액기준' : '수량기준'})`];
            const head2 = [`사업부: ${groupName}`, `기준연도: ${year}년`, `작성일: ${dateStr}`, `기준단위: ${basis === 'amount' ? '원(KRW)' : 'EA'}`, `적용환율: 1 USD = ${exchangeRate.toLocaleString()} KRW`];
            const head3 = ["고객사", "품명", "규격", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월", "누적합계", "비율(%)"];
            
            const body = [];
            annualData.data.forEach(cust => {
                cust.products.forEach((prod, pidx) => {
                    const row = [
                        pidx === 0 ? cust.partner_name : "",
                        prod.product_name,
                        prod.specification || "",
                        ...(basis === 'amount' ? prod.monthly_amount : prod.monthly_qty),
                        basis === 'amount' ? prod.annual_amount : prod.annual_qty,
                        ((basis === 'amount' ? prod.annual_amount : prod.annual_qty) / 
                         (basis === 'amount' ? annualData.overall_total_amount : annualData.overall_total_qty) * 100).toFixed(1) + "%"
                    ];
                    body.push(row);
                });
                // Customer Total Row
                body.push([
                    `${cust.partner_name} 합계`, "", "", 
                    ...Array(12).fill(""),
                    basis === 'amount' ? cust.customer_total_amount : cust.customer_total_qty,
                    ((basis === 'amount' ? cust.customer_total_amount : cust.customer_total_qty) / 
                     (basis === 'amount' ? annualData.overall_total_amount : annualData.overall_total_qty) * 100).toFixed(1) + "%"
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet([head1, [], head2, head3, ...body]);

            // 열 너비 자동 맞춤
            const colWidths = head3.map((h, i) => {
                const maxLen = Math.max(
                    h.length * 2,
                    ...body.map(row => {
                        const val = String(row[i] ?? '');
                        return val.split('').reduce((acc, ch) => acc + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
                    })
                );
                return { wch: Math.min(maxLen + 2, 50) }; // 최대 너비 50으로 제한
            });
            ws['!cols'] = colWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "AnnualPerformance");
            XLSX.writeFile(wb, fileName);
            return;
        }

        if (!data || data.length === 0) {
            alert("다운로드할 데이터가 없습니다.");
            return;
        }

        const columns = getColumns();
        const fileName = `${tabLabel}-${groupName}-${year}${String(month).padStart(2, '0')}-${dateStr.replace(/-/g, '')}.xlsx`;

        // 1. Prepare HeaderRows (for standard formatting)
        const header1 = [`${year}년 ${month}월 ${tabLabel} 결산`];
        const header2 = [`사업부: ${groupName}`, `기준연월: ${year}년 ${month}월`, `작성일: ${dateStr}`, `적용환율: 1 USD = ${exchangeRate.toLocaleString()} KRW`];
        const header3 = columns.map(c => c.label);

        // 2. Prepare Data Body — USD 항목은 현재 환율로 원화 변환
        const PRICE_KEYS = ['unit_price', 'total_price', 'amount'];
        const body = data.map(item => columns.map(col => {
            let val = item[col.key];
            // USD → KRW 변환 (단가·합계 필드만)
            if (item.currency === 'USD' && PRICE_KEYS.includes(col.key) && val != null) {
                val = Math.round(val * exchangeRate);
            }
            return val !== null && val !== undefined ? val : "";
        }));

        // 3. Construct Sheet
        const ws = XLSX.utils.aoa_to_sheet([
            header1,
            [], // spacer row
            header2,
            header3,
            ...body
        ]);

        // 열 너비 자동 맞춤
        const colWidths = header3.map((h, i) => {
            const maxLen = Math.max(
                h.length * 2,
                ...body.map(row => {
                    const val = String(row[i] ?? '');
                    return val.split('').reduce((acc, ch) => acc + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
                })
            );
            return { wch: Math.min(maxLen + 2, 50) };
        });
        ws['!cols'] = colWidths;

        // 4. Merge Cells for titles
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Settlement");
        XLSX.writeFile(wb, fileName);
    };

    const columns = getColumns();
    const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const totalProcCost = prodDetail?.processes.reduce((s, p) => s + (p.cost || 0), 0) || 0;

    return (
        <div className="space-y-6">
            {/* 생산내역 공정별 상세 모달 */}
            {prodDetail && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setProdDetail(null)}>
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-white mb-1">공정별 비용 상세</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            {prodDetail.item.product_name}
                            {prodDetail.item.specification && <span className="text-gray-600 ml-1">/ {prodDetail.item.specification}</span>}
                            <span className="text-blue-400 ml-2">{prodDetail.item.partner_name}</span>
                        </p>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-700 text-xs uppercase tracking-wider">
                                    <th className="pb-2 pr-4">공정명</th>
                                    <th className="pb-2 text-right pr-4">목표수량</th>
                                    <th className="pb-2 text-right pr-4">실적수량</th>
                                    <th className="pb-2 text-right">공정비용</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {prodDetail.processes.map((p, i) => (
                                    <tr key={i} className="hover:bg-gray-800/30">
                                        <td className="py-2.5 pr-4 text-gray-300 font-medium">{p.process_name || '-'}</td>
                                        <td className="py-2.5 pr-4 text-right text-gray-400">{p.quantity?.toLocaleString()}</td>
                                        <td className="py-2.5 pr-4 text-right text-green-400">{p.completed_quantity?.toLocaleString()}</td>
                                        <td className="py-2.5 text-right font-bold text-blue-400">{formatCurrency(p.cost, 'KRW')}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-600">
                                    <td colSpan={3} className="pt-3 font-bold text-white text-right pr-4">총 공정비용</td>
                                    <td className="pt-3 text-right font-black text-white text-lg">{formatCurrency(totalProcCost, 'KRW')}</td>
                                </tr>
                                {prodDetail.item.order_amount > 0 && (
                                    <tr>
                                        <td colSpan={3} className="pt-1 text-gray-400 text-sm text-right pr-4">수주금액</td>
                                        <td className="pt-1 text-right text-gray-300 font-bold">{formatCurrency(prodDetail.item.order_amount, 'KRW')}</td>
                                    </tr>
                                )}
                            </tfoot>
                        </table>
                        <div className="mt-5 text-right">
                            <button onClick={() => setProdDetail(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">닫기</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Filters */}
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex flex-wrap items-end gap-6 shadow-sm">
                <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">조회 연도</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <select 
                            value={year} onChange={(e) => setYear(parseInt(e.target.value))}
                            className="bg-gray-900 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-32 appearance-none"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}년</option>)}
                        </select>
                    </div>
                </div>

                <div className={`space-y-1.5 transition-opacity ${activeTab === 'annual' ? 'opacity-30 pointer-events-none' : ''}`}>
                    <label className="text-xs text-gray-500 font-medium">조회 월</label>
                    <select 
                        value={month ?? ''}
                        onChange={(e) => setMonth(e.target.value === '' ? null : parseInt(e.target.value))}
                        disabled={activeTab === 'annual'}
                        className="bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-24 appearance-none disabled:bg-gray-800"
                    >
                        <option value="">전체</option>
                        {months.map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                </div>

                {activeTab === 'annual' && (
                    <div className="space-y-1.5">
                        <label className="text-xs text-gray-500 font-medium">기준값 선택</label>
                        <select 
                            value={basis} onChange={(e) => setBasis(e.target.value)}
                            className="bg-gray-900 border border-blue-500 text-blue-400 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-32 appearance-none font-bold"
                        >
                            <option value="amount">납품 금액</option>
                            <option value="qty">납품 수량</option>
                        </select>
                    </div>
                )}

                <div className={`space-y-1.5 flex-1 min-w-[200px] transition-opacity ${activeTab === 'chart' ? 'opacity-30 pointer-events-none' : ''}`}>
                    <label className="text-xs text-gray-500 font-medium">사업부(대그룹)</label>
                    <div className="relative">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <select 
                            value={majorGroupId} onChange={(e) => setMajorGroupId(e.target.value)}
                            disabled={activeTab === 'chart'}
                            className="bg-gray-900 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full appearance-none disabled:bg-gray-800"
                        >
                        <option value="">전체 사업부</option>
                            {activeTab === 'purchases' && (
                                <option value="소모품" style={{ color: '#f59e0b', fontWeight: 'bold' }}>🧴 소모품</option>
                            )}
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                </div>

                <button 
                    onClick={handleDownloadExcel}
                    disabled={activeTab === 'chart'}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium shadow-lg h-[38px] ${
                        activeTab === 'chart' 
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                    }`}
                >
                    <Download className="w-4 h-4" />
                    <span>엑셀 다운로드</span>
                </button>

                {/* 환율 설정 */}
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 font-medium">기준환율 (1 USD = ? KRW)</label>
                        {rateLoading ? (
                            <span className="text-xs text-yellow-500 animate-pulse">조회 중...</span>
                        ) : rateDate ? (
                            <span className="text-xs text-emerald-500">({rateDate} 기준)</span>
                        ) : (
                            <span className="text-xs text-gray-600">수동 입력</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={exchangeRate}
                            onChange={e => setExchangeRate(Number(e.target.value) || 1350)}
                            className="bg-gray-900 border border-yellow-700/50 text-yellow-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-500 outline-none w-28 font-mono"
                        />
                        <span className="text-xs text-gray-500 font-medium">원</span>
                    </div>
                </div>
            </div>

            {/* Tabs & Total Sum */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 gap-4">
                <nav className="flex gap-1 flex-wrap">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-3 text-sm font-medium transition-all relative ${
                                activeTab === tab.id
                                ? tab.id === 'chart' ? 'text-emerald-400' : 'text-blue-500'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                            }`}
                        >
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                                    tab.id === 'chart' ? 'bg-emerald-400' : 'bg-blue-500'
                                }`} />
                            )}
                        </button>
                    ))}
                </nav>

                {totalSums !== null && (
                    <div className="flex items-center gap-3 mb-2 md:mb-0 flex-wrap">
                        {totalSums.krw !== 0 && (
                            <div className="bg-blue-500/10 border border-blue-500/30 px-4 py-2 rounded-full animate-in fade-in">
                                <span className="text-gray-400 text-xs mr-2 font-medium uppercase tracking-wider">화</span>
                                <span className="text-blue-400 font-bold">{formatCurrency(totalSums.krw, 'KRW')}</span>
                            </div>
                        )}
                        {totalSums.usd !== 0 && (
                            <div className="bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-full animate-in fade-in">
                                <span className="text-gray-400 text-xs mr-2 font-medium uppercase tracking-wider">$</span>
                                <span className="text-emerald-400 font-bold">{formatCurrency(totalSums.usd, 'USD')}</span>
                            </div>
                        )}
                        {totalSums.usd !== 0 && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 rounded-full animate-in fade-in">
                                <span className="text-gray-400 text-xs mr-2 font-medium">환올합산</span>
                                <span className="text-yellow-400 font-bold">{formatCurrency(totalSums.converted, 'KRW')}</span>
                            </div>
                        )}
                        {totalSums.usd === 0 && (
                            <div className="bg-blue-500/10 border border-blue-500/30 px-4 py-2 rounded-full animate-in fade-in">
                                <span className="text-gray-400 text-xs mr-3 font-medium uppercase tracking-wider">Total</span>
                                <span className="text-blue-400 font-bold text-lg">{formatCurrency(totalSums.krw, 'KRW')}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Table or Chart */}
            {activeTab === 'chart' ? (
                <SettlementChartTab year={year} month={month} exchangeRate={exchangeRate} />
            ) : activeTab === 'cost-analysis' ? (
                <CostAnalysisTab
                    majorGroupId={majorGroupId}
                    groups={groups}
                    onDrillDown={fetchProdDetail}
                />
            ) : activeTab === 'annual' ? (
                <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-xl overflow-hidden min-h-[500px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700">
                                <tr>
                                    <th className="px-4 py-3 border-r border-gray-700 text-center" rowSpan={2}>고객사</th>
                                    <th className="px-4 py-3 border-r border-gray-700 text-center" rowSpan={2}>생산제품</th>
                                    <th className="px-4 py-3 border-r border-gray-700 text-center" rowSpan={2}>규격</th>
                                    <th className="px-4 py-3 border-b border-gray-700 text-center" colSpan={12}>{year}년 월별 실적 ({basis === 'amount' ? '금액: 원' : '수량: EA'})</th>
                                    <th className="px-4 py-3 border-l border-gray-700 text-center" rowSpan={2}>연간 누적</th>
                                    <th className="px-4 py-3 border-l border-gray-700 text-center" rowSpan={2}>비율(%)</th>
                                </tr>
                                <tr>
                                    {months.map(m => (
                                        <th key={m} className="px-2 py-2 text-center border-r border-gray-700/50 min-w-[60px]">{m}월</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {loading ? (
                                    <tr><td colSpan={17} className="px-4 py-20 text-center animate-pulse">데이터를 불러오는 중...</td></tr>
                                ) : annualData.data.length > 0 ? (
                                    annualData.data.map((cust, cidx) => (
                                        <React.Fragment key={cust.partner_name}>
                                            {cust.products.map((prod, pidx) => (
                                                <tr key={prod.product_id} className="hover:bg-gray-800/40 border-b border-gray-800">
                                                    {pidx === 0 && (
                                                        <td className="px-4 py-3 border-r border-gray-700 font-bold text-gray-100 align-top" rowSpan={cust.products.length + 1}>
                                                            {cust.partner_name}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 border-r border-gray-700">{prod.product_name}</td>
                                                    <td className="px-4 py-3 border-r border-gray-700 text-xs text-gray-500">{prod.specification || '-'}</td>
                                                    {(basis === 'amount' ? prod.monthly_amount : prod.monthly_qty).map((val, midx) => (
                                                        <td key={midx} className="px-2 py-3 text-right border-r border-gray-800/50 font-mono text-xs">
                                                            {val === 0 ? '-' : val.toLocaleString()}
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-3 text-right font-bold bg-blue-500/5 text-blue-400">
                                                        {(basis === 'amount' ? prod.annual_amount : prod.annual_qty).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs font-semibold text-gray-400">
                                                        {((basis === 'amount' ? prod.annual_amount : prod.annual_qty) / 
                                                          (basis === 'amount' ? annualData.overall_total_amount : annualData.overall_total_qty) * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Customer Total row */}
                                            <tr className="bg-gray-800/20 border-b-2 border-gray-700">
                                                <td className="px-4 py-2 text-right font-bold text-emerald-400" colSpan={2}>
                                                    {cust.partner_name} 소계
                                                </td>
                                                <td className="px-2 py-2 text-center" colSpan={12}>
                                                    <div className="h-px bg-gray-700/50 w-full" />
                                                </td>
                                                <td className="px-4 py-2 text-right font-black text-emerald-400 bg-emerald-500/5">
                                                    {(basis === 'amount' ? cust.customer_total_amount : cust.customer_total_qty).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold text-emerald-500 bg-emerald-500/5">
                                                    {((basis === 'amount' ? cust.customer_total_amount : cust.customer_total_qty) / 
                                                      (basis === 'amount' ? annualData.overall_total_amount : annualData.overall_total_qty) * 100).toFixed(1)}%
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <tr><td colSpan={17} className="px-4 py-20 text-center text-gray-500">데이터가 없습니다.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-blue-600/10 border-t border-blue-500/50 font-bold">
                                <tr>
                                    <td className="px-4 py-4 text-center text-blue-400" colSpan={3}>전체 총계 (Grand Total)</td>
                                    <td className="px-2 py-4 text-center" colSpan={12}>
                                        <div className="flex items-center justify-center gap-2">
                                            <Calendar className="w-3 h-3" />
                                            <span className="text-[10px] uppercase tracking-tighter opacity-50">연간 누적 실적</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right text-lg text-blue-400">
                                        {(basis === 'amount' ? annualData.overall_total_amount : annualData.overall_total_qty).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-4 text-right text-blue-400">100.0%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-xl overflow-hidden min-h-[500px]">
                <div className="overflow-x-auto">
                    <ResizableTable
                        columns={columns}
                        className="text-sm text-left"
                        theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                        thClassName="px-4 py-3"
                    >
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-600">불러오는 중...</td>
                                </tr>
                            ))
                        ) : data.length > 0 ? (
                            data.map((item, idx) => (
                                <tr
                                    key={idx}
                                    className={`hover:bg-gray-800/40 transition-colors border-b border-gray-700 text-gray-300 ${activeTab === 'production' ? 'cursor-pointer select-none' : ''}`}
                                    onDoubleClick={activeTab === 'production' ? () => fetchProdDetail(item) : undefined}
                                    title={activeTab === 'production' ? '더블클릭하면 공정별 비용을 확인할 수 있습니다' : undefined}
                                >
                                    {columns.map(col => {
                                        if (col.key === 'no') {
                                            return <td key={col.key} className="px-4 py-3 text-center text-gray-500 font-mono text-xs">{idx + 1}</td>;
                                        }
                                        return (
                                            <td key={col.key} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                {col.renderCell ? col.renderCell(item[col.key], item) : col.format ? col.format(item[col.key]) : item[col.key] || '-'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-20 text-center text-gray-500">
                                    해당 조건의 데이터가 없습니다.
                                </td>
                            </tr>
                        )}
                    </ResizableTable>
                </div>
            </div>
            )}
        </div>
    );
};

export default SettlementPage;
