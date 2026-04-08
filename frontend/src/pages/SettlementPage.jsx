import React, { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { 
    FileText, 
    Download, 
    Calendar, 
    Layers, 
    Search,
    ChevronRight,
    Filter,
    ArrowUpDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import ResizableTable from '../components/ResizableTable';

const SettlementPage = () => {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [majorGroupId, setMajorGroupId] = useState("");
    const [activeTab, setActiveTab] = useState("orders");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [groups, setGroups] = useState([]);

    const tabs = [
        { id: "orders", label: "수주내역" },
        { id: "sales", label: "매출내역" },
        { id: "purchases", label: "매입내역" },
        { id: "production", label: "생산내역" },
        { id: "defects", label: "불량내역" },
        { id: "complaints", label: "고객불만" },
    ];

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                const res = await api.get('/product/groups/');
                setGroups(res.data.filter(g => g.type === 'MAJOR') || []);
            } catch (e) { console.error(e); }
        };
        fetchGroups();
    }, []);

    useEffect(() => {
        fetchData();
    }, [year, month, majorGroupId, activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = { year, month };
            if (majorGroupId) params.major_group_id = majorGroupId;
            const res = await api.get(`/settlement/${activeTab}`, { params });
            setData(res.data || []);
        } catch (e) {
            console.error(e);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const fmtWon = (val) => new Intl.NumberFormat('ko-KR').format(val || 0) + '원';
    const fmtNum = (val) => new Intl.NumberFormat('ko-KR').format(val || 0);

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
                    { key: "unit_price", label: "단가", align: "right", format: fmtWon, width: 120 },
                    { key: "total_price", label: "합계", align: "right", format: fmtWon, width: 140 },
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
                    { key: "unit_price", label: "단가", align: "right", format: fmtWon, width: 120 },
                    { key: "total_price", label: "합계", align: "right", format: fmtWon, width: 140 },
                ];
            case "purchases":
                return [
                    noCol,
                    { key: "category", label: "구분", width: 100 },
                    { key: "partner_name", label: "공급사", width: 140 },
                    { key: "product_name", label: "품명", width: 200 },
                    { key: "specification", label: "규격", width: 150 },
                    { key: "quantity", label: "수량", align: "right", width: 80 },
                    { key: "unit_price", label: "단가", align: "right", format: fmtWon, width: 120 },
                    { key: "total_price", label: "합계", align: "right", format: fmtWon, width: 140 },
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
                    { key: "process_cost", label: "공정비용", align: "right", format: fmtWon, width: 120 },
                    { key: "total_cost", label: "합계", align: "right", format: fmtWon, width: 140 },
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
            default: return [];
        }
    };

    const totalSum = useMemo(() => {
        const sumKey = {
            orders: "total_price",
            sales: "total_price",
            purchases: "total_price",
            production: "total_cost",
            defects: "amount"
        }[activeTab];
        
        if (!sumKey) return null;
        return data.reduce((acc, curr) => acc + (curr[sumKey] || 0), 0);
    }, [data, activeTab]);

    const handleDownloadExcel = () => {
        if (!data || data.length === 0) {
            alert("다운로드할 데이터가 없습니다.");
            return;
        }

        const columns = getColumns();
        const tabLabel = tabs.find(t => t.id === activeTab)?.label || "";
        const groupName = majorGroupId ? (groups.find(g => g.id === parseInt(majorGroupId))?.name || "") : "전체";
        const dateStr = format(new Date(), 'yyyy-MM-dd');
        const fileName = `${tabLabel}-${groupName}-${year}${String(month).padStart(2, '0')}-${dateStr.replace(/-/g, '')}.xlsx`;

        // 1. Prepare HeaderRows (for standard formatting)
        const header1 = [`${year}년 ${month}월 ${tabLabel} 결산`];
        const header2 = [`사업부: ${groupName}`, `기준연월: ${year}년 ${month}월`, `작성일: ${dateStr}`];
        const header3 = columns.map(c => c.label);

        // 2. Prepare Data Body
        const body = data.map(item => columns.map(col => {
            const val = item[col.key];
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

    return (
        <div className="space-y-6">
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
                            {years.map(y => <option key={y} value={y}>{y}년</option>)}
                        </select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs text-gray-500 font-medium">조회 월</label>
                    <select 
                        value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
                        className="bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-24 appearance-none"
                    >
                        {months.map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                </div>

                <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-500 font-medium">사업부(대그룹)</label>
                    <div className="relative">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <select 
                            value={majorGroupId} onChange={(e) => setMajorGroupId(e.target.value)}
                            className="bg-gray-900 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full appearance-none"
                        >
                            <option value="">전체 사업부</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                </div>

                <button 
                    onClick={handleDownloadExcel}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-emerald-500/20 h-[38px]"
                >
                    <Download className="w-4 h-4" />
                    <span>엑셀 다운로드</span>
                </button>
            </div>

            {/* Tabs & Total Sum */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 gap-4">
                <nav className="flex gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-3 text-sm font-medium transition-all relative ${
                                activeTab === tab.id 
                                ? "text-blue-500" 
                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                            }`}
                        >
                            {tab.label}
                            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
                        </button>
                    ))}
                </nav>

                {totalSum !== null && (
                    <div className="bg-blue-500/10 border border-blue-500/30 px-6 py-2 rounded-full mb-2 md:mb-0 animate-in fade-in slide-in-from-right-4 duration-500">
                        <span className="text-gray-400 text-xs mr-3 font-medium uppercase tracking-wider">Total Sum</span>
                        <span className="text-blue-400 font-bold text-lg">{fmtWon(totalSum)}</span>
                    </div>
                )}
            </div>

            {/* Table Container */}
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
                                <tr key={idx} className="hover:bg-gray-800/40 transition-colors border-b border-gray-700 text-gray-300">
                                    {columns.map(col => {
                                        if (col.key === 'no') {
                                            return <td key={col.key} className="px-4 py-3 text-center text-gray-500 font-mono text-xs">{idx + 1}</td>;
                                        }
                                        return (
                                            <td key={col.key} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                {col.format ? col.format(item[col.key]) : item[col.key] || '-'}
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
        </div>
    );
};

export default SettlementPage;
