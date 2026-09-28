import React, { useState } from 'react';
import {
    Download, Upload, Database, FileSpreadsheet, FileText,
    AlertCircle, CheckCircle2, Loader2, ChevronDown, Calendar,
    Package, Users, ShoppingCart, ClipboardList, Boxes, Wrench, BarChart3
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

// ────────────────────────────────────────────────────────────────────────────
// 내보내기 대상 설정
// ────────────────────────────────────────────────────────────────────────────
const EXPORT_TARGETS = [
    {
        id: 'all',
        label: '전체 백업',
        desc: '모든 테이블을 시트별로 묶어 Excel 1파일로 저장 (15개 시트)',
        icon: Database,
        color: 'text-purple-400',
        border: 'border-purple-500/50',
        bg: 'bg-purple-500/10',
        hasDateFilter: true,
        endpoint: '/db-manager/export/all',
        filename: (d) => `MES_전체백업_${d}.xlsx`,
    },
    {
        id: 'partners',
        label: '거래처 목록',
        desc: '업체명, 구분, 사업자번호, 담당자 등',
        icon: Users,
        color: 'text-blue-400',
        border: 'border-blue-500/40',
        bg: 'bg-blue-500/5',
        hasDateFilter: false,
        endpoint: '/db-manager/export/partners',
        filename: (d) => `거래처_${d}`,
    },
    {
        id: 'products',
        label: '생산제품 목록',
        desc: '품명, 규격, 공정수, 단가 등',
        icon: Package,
        color: 'text-emerald-400',
        border: 'border-emerald-500/40',
        bg: 'bg-emerald-500/5',
        hasDateFilter: false,
        endpoint: '/db-manager/export/products',
        extraParam: 'item_type=PRODUCED',
        filename: (d) => `생산제품_${d}`,
    },
    {
        id: 'parts',
        label: '부품/소모품 목록',
        desc: '부품, 소모품 품목 정보',
        icon: Wrench,
        color: 'text-orange-400',
        border: 'border-orange-500/40',
        bg: 'bg-orange-500/5',
        hasDateFilter: false,
        endpoint: '/db-manager/export/products',
        extraParam: 'item_type=PART,CONSUMABLE',
        filename: (d) => `부품소모품_${d}`,
    },
    {
        id: 'sales-orders',
        label: '수주 이력',
        desc: '수주번호, 거래처, 제품, 수량, 금액, 진행상태',
        icon: ShoppingCart,
        color: 'text-sky-400',
        border: 'border-sky-500/40',
        bg: 'bg-sky-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/sales-orders',
        filename: (d) => `수주이력_${d}`,
    },
    {
        id: 'estimates',
        label: '견적 이력',
        desc: '견적일자, 거래처, 제품, 단가, 유효기간',
        icon: ClipboardList,
        color: 'text-indigo-400',
        border: 'border-indigo-500/40',
        bg: 'bg-indigo-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/estimates',
        filename: (d) => `견적이력_${d}`,
    },
    {
        id: 'delivery-history',
        label: '납품 이력',
        desc: '납품번호, 납품일자, 거래처, 제품, 수량, 금액',
        icon: ShoppingCart,
        color: 'text-cyan-400',
        border: 'border-cyan-500/40',
        bg: 'bg-cyan-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/delivery-history',
        filename: (d) => `납품이력_${d}`,
    },
    {
        id: 'purchase-orders',
        label: '구매발주 이력',
        desc: '발주번호, 거래처, 품목, 입고 현황',
        icon: BarChart3,
        color: 'text-yellow-400',
        border: 'border-yellow-500/40',
        bg: 'bg-yellow-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/purchase-orders',
        filename: (d) => `구매발주_${d}`,
    },
    {
        id: 'outsourcing-orders',
        label: '외주발주 이력',
        desc: '외주발주번호, 외주처, 품목, 수량, 금액, 상태',
        icon: BarChart3,
        color: 'text-rose-400',
        border: 'border-rose-500/40',
        bg: 'bg-rose-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/outsourcing-orders',
        filename: (d) => `외주발주_${d}`,
    },
    {
        id: 'inventory',
        label: '재고 현황',
        desc: '제품별 현재고, 생산중수량, 재고금액',
        icon: Boxes,
        color: 'text-teal-400',
        border: 'border-teal-500/40',
        bg: 'bg-teal-500/5',
        hasDateFilter: false,
        endpoint: '/db-manager/export/inventory',
        filename: (d) => `재고현황_${d}`,
    },
    {
        id: 'stock-transactions',
        label: '재고 수불 이력',
        desc: '입고/출고/조정 이력 (수불부)',
        icon: Boxes,
        color: 'text-lime-400',
        border: 'border-lime-500/40',
        bg: 'bg-lime-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/stock-transactions',
        filename: (d) => `재고수불이력_${d}`,
    },
    {
        id: 'stock-productions',
        label: '재고생산 이력',
        desc: '수주 없는 재고보충 생산 이력',
        icon: Boxes,
        color: 'text-green-400',
        border: 'border-green-500/40',
        bg: 'bg-green-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/stock-productions',
        filename: (d) => `재고생산이력_${d}`,
    },
    {
        id: 'work-logs',
        label: '작업일지',
        desc: '일별 작업자 실적 (공정, 양품/불량수량)',
        icon: ClipboardList,
        color: 'text-amber-400',
        border: 'border-amber-500/40',
        bg: 'bg-amber-500/5',
        hasDateFilter: true,
        endpoint: '/db-manager/export/work-logs',
        filename: (d) => `작업일지_${d}`,
    },
    {
        id: 'staff',
        label: '직원 목록',
        desc: '성명, 직책, 부서, 전화',
        icon: Users,
        color: 'text-pink-400',
        border: 'border-pink-500/40',
        bg: 'bg-pink-500/5',
        hasDateFilter: false,
        endpoint: '/db-manager/export/staff',
        filename: (d) => `직원목록_${d}`,
    },
    {
        id: 'equipments',
        label: '설비 목록',
        desc: '장비명, 코드, 사양, 위치',
        icon: Wrench,
        color: 'text-slate-400',
        border: 'border-slate-500/40',
        bg: 'bg-slate-500/5',
        hasDateFilter: false,
        endpoint: '/db-manager/export/equipments',
        filename: (d) => `설비목록_${d}`,
    },
    {
        id: 'measuring-instruments',
        label: '측정기 목록',
        desc: '측정기명, 코드, 교정주기, 차기교정일',
        icon: Wrench,
        color: 'text-violet-400',
        border: 'border-violet-500/40',
        bg: 'bg-violet-500/5',
        hasDateFilter: false,
        endpoint: '/db-manager/export/measuring-instruments',
        filename: (d) => `측정기_${d}`,
    },
];


// ────────────────────────────────────────────────────────────────────────────
// 내보내기 탭
// ────────────────────────────────────────────────────────────────────────────
const ExportTab = () => {
    const [selected, setSelected] = useState(EXPORT_TARGETS[0]);
    const [fmt, setFmt] = useState('xlsx');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const handleDownload = async () => {
        setLoading(true);
        setResult(null);
        try {
            let url = selected.endpoint + '?fmt=' + fmt;
            if (selected.extraParam) url += '&' + selected.extraParam;
            if (selected.hasDateFilter && startDate) url += '&start_date=' + startDate;
            if (selected.hasDateFilter && endDate)   url += '&end_date=' + endDate;

            const res = await api.get(url, { responseType: 'blob' });
            const blob = new Blob([res.data]);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const base = selected.filename(today);
            link.download = fmt === 'xlsx' ? (base.endsWith('.xlsx') ? base : base + '.xlsx')
                                           : (base.endsWith('.csv')  ? base : base + '.csv');
            link.click();
            setResult({ success: true, message: `'${link.download}' 다운로드 완료` });
        } catch (e) {
            setResult({ success: false, message: '다운로드 실패: ' + (e.response?.data?.detail || e.message) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 왼쪽: 대상 선택 */}
            <div className="lg:col-span-1 space-y-2">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">내보낼 데이터 선택</p>
                {EXPORT_TARGETS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => { setSelected(t); setResult(null); }}
                        className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                            selected.id === t.id
                                ? `${t.bg} ${t.border} border shadow-lg`
                                : 'bg-gray-800/40 border-gray-700/60 hover:border-gray-600 hover:bg-gray-800/70'
                        )}
                    >
                        <t.icon className={cn('w-4 h-4 shrink-0', selected.id === t.id ? t.color : 'text-gray-500')} />
                        <span className={cn('font-medium text-sm', selected.id === t.id ? 'text-white' : 'text-gray-400')}>
                            {t.label}
                        </span>
                    </button>
                ))}
            </div>

            {/* 오른쪽: 설정 + 다운로드 */}
            <div className="lg:col-span-2 space-y-4">
                {/* 선택된 대상 정보 */}
                <div className={cn('rounded-xl p-5 border', selected.bg, selected.border)}>
                    <div className="flex items-center gap-3 mb-2">
                        <selected.icon className={cn('w-5 h-5', selected.color)} />
                        <h3 className="font-bold text-white text-lg">{selected.label}</h3>
                    </div>
                    <p className="text-sm text-gray-400">{selected.desc}</p>
                </div>

                {/* 날짜 필터 */}
                {selected.hasDateFilter && (
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
                            <Calendar className="w-4 h-4" />
                            <span>기간 필터 <span className="text-gray-600">(선택사항 — 비우면 전체 기간)</span></span>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                            />
                            <span className="text-gray-600">~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                )}

                {/* 파일 형식 */}
                <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-4">
                    <p className="text-sm text-gray-400 font-medium mb-3">파일 형식</p>
                    <div className="flex gap-3">
                        {[
                            { id: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet, desc: '서식 포함 — 추천' },
                            { id: 'csv',  label: 'CSV (.csv)',    icon: FileText,        desc: '범용, 다른 시스템 연동' },
                        ].map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setFmt(f.id)}
                                className={cn(
                                    'flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border transition-all',
                                    fmt === f.id
                                        ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                                        : 'bg-gray-900/50 border-gray-700 text-gray-500 hover:border-gray-600'
                                )}
                            >
                                <f.icon className="w-5 h-5" />
                                <span className="font-semibold text-xs">{f.label}</span>
                                <span className="text-[10px] opacity-70">{f.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 다운로드 버튼 */}
                <button
                    onClick={handleDownload}
                    disabled={loading}
                    className={cn(
                        'w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-base transition-all',
                        loading
                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                    )}
                >
                    {loading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /><span>다운로드 중...</span></>
                    ) : (
                        <><Download className="w-5 h-5" /><span>{selected.label} 다운로드</span></>
                    )}
                </button>

                {/* 결과 */}
                {result && (
                    <div className={cn(
                        'rounded-xl p-4 border flex items-center gap-3',
                        result.success ? 'bg-green-500/10 border-green-500/40' : 'bg-red-500/10 border-red-500/40'
                    )}>
                        {result.success
                            ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                            : <AlertCircle  className="w-5 h-5 text-red-400   shrink-0" />}
                        <span className={cn('text-sm', result.success ? 'text-green-300' : 'text-red-300')}>
                            {result.message}
                        </span>
                    </div>
                )}

                {/* Access 안내 */}
                <div className="bg-gray-900/40 rounded-xl border border-gray-700/40 p-4 text-xs text-gray-500 leading-relaxed">
                    <p className="font-semibold text-gray-400 mb-1">💡 Access DB 사용자 안내</p>
                    <p>기존 Access DB를 업로드하려면: Access → 해당 테이블 선택 → <span className="text-gray-300">외부 데이터 → Excel로 내보내기</span></p>
                    <p className="mt-1">내보낸 .xlsx 파일을 <span className="text-gray-300">[데이터 가져오기]</span> 탭에서 업로드하면 MES DB로 이관됩니다.</p>
                </div>
            </div>
        </div>
    );
};

// ────────────────────────────────────────────────────────────────────────────
// 가져오기 탭 (기존 기능, 향후 개선 예정)
// ────────────────────────────────────────────────────────────────────────────
const IMPORT_TABLES = [
    { id: 'partners',   label: '거래처',      desc: '업체명, 구분, 사업자번호 등' },
    { id: 'products',   label: '생산제품',    desc: '품명, 규격, 단가 등 (Export 파일 그대로 업로드 가능)' },
    { id: 'parts',      label: '부품/소모품', desc: '유형, 품명, 규격, 단가 등 (Export 파일 그대로 업로드 가능)' },
    { id: 'staff',      label: '직원',        desc: '성명, 직책, 주업무 등' },
    { id: 'equipments', label: '설비',        desc: '장비명, 코드, 사양, 위치' },
    { id: 'orders',     label: '수주 이력',   desc: '수주일자, 거래처, 제품, 수량, 단가 등' },
];

const ImportTab = () => {
    const [selected, setSelected] = useState(IMPORT_TABLES[0]);
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const handleTemplateDownload = async () => {
        try {
            const res = await api.get(`/db-manager/template/${selected.id}`, { responseType: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([res.data]));
            link.download = `양식_${selected.label}.xlsx`;
            link.click();
        } catch { alert('양식 다운로드 실패'); }
    };

    const handleUpload = async () => {
        if (!file) { alert('파일을 선택해주세요.'); return; }
        setLoading(true); setResult(null);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post(`/db-manager/upload/${selected.id}/`, formData);
            setResult({ success: true, message: res.data.message });
            setFile(null);
        } catch (e) {
            const d = e.response?.data;
            setResult({ success: false, message: d?.message || '업로드 실패', errors: d?.errors || [] });
        } finally { setLoading(false); }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 왼쪽: 대상 선택 + 양식 */}
            <div className="lg:col-span-1 space-y-3">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">업로드 대상 선택</p>
                {IMPORT_TABLES.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => { setSelected(t); setResult(null); setFile(null); }}
                        className={cn(
                            'w-full flex flex-col gap-0.5 px-4 py-3 rounded-xl border text-left transition-all',
                            selected.id === t.id
                                ? 'bg-blue-600/10 border-blue-500 shadow-lg'
                                : 'bg-gray-800/40 border-gray-700/60 hover:border-gray-600'
                        )}
                    >
                        <span className={cn('font-medium text-sm', selected.id === t.id ? 'text-blue-300' : 'text-gray-400')}>
                            {t.label}
                        </span>
                        <span className="text-[11px] text-gray-600">{t.desc}</span>
                    </button>
                ))}

                <div className="pt-3 border-t border-gray-800">
                    <button
                        onClick={handleTemplateDownload}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl border border-gray-700 text-sm transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        엑셀 양식 다운로드
                    </button>
                    <p className="mt-2 text-[11px] text-gray-600 leading-relaxed">
                        * 양식에 맞게 데이터를 입력 후 업로드하세요.
                    </p>
                </div>
            </div>

            {/* 오른쪽: 업로드 */}
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-gray-900/40 rounded-xl border border-yellow-500/30 p-4 text-xs text-yellow-400/80 leading-relaxed">
                    <p className="font-semibold mb-1">⚠️ 업로드 전 주의사항</p>
                    <p>• 거래처 먼저, 그 다음 제품 순서로 업로드 권장</p>
                    <p>• Access DB → <span className="text-yellow-300">Excel로 내보내기</span> 후 양식에 맞게 정리 후 업로드</p>
                    <p>• 중복 데이터는 새로 추가되므로, 가져오기 전 현재 데이터를 먼저 확인하세요.</p>
                </div>

                <div
                    className={cn(
                        'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all',
                        file ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 bg-gray-800/20 hover:border-gray-600'
                    )}
                    onClick={() => document.getElementById('import-file-input').click()}
                >
                    <input
                        id="import-file-input"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); setResult(null); } }}
                    />
                    <FileSpreadsheet className={cn('w-12 h-12 mb-3', file ? 'text-blue-400' : 'text-gray-600')} />
                    <p className={cn('font-medium text-sm text-center', file ? 'text-blue-300' : 'text-gray-400')}>
                        {file ? file.name : '클릭하여 파일 선택'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Excel (.xlsx, .xls) / CSV (.csv)</p>
                </div>

                <button
                    onClick={handleUpload}
                    disabled={!file || loading}
                    className={cn(
                        'w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-base transition-all',
                        !file || loading
                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                    )}
                >
                    {loading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /><span>업로드 중...</span></>
                    ) : (
                        <><Upload className="w-5 h-5" /><span>{selected.label} 업로드</span></>
                    )}
                </button>

                {result && (
                    <div className={cn(
                        'rounded-xl p-4 border',
                        result.success ? 'bg-green-500/10 border-green-500/40' : 'bg-red-500/10 border-red-500/40'
                    )}>
                        <div className="flex items-center gap-3 mb-1">
                            {result.success
                                ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                                : <AlertCircle  className="w-5 h-5 text-red-400   shrink-0" />}
                            <span className={cn('font-medium', result.success ? 'text-green-300' : 'text-red-300')}>
                                {result.message}
                            </span>
                        </div>
                        {result.errors?.length > 0 && (
                            <div className="mt-2 bg-black/30 rounded-lg p-3 max-h-36 overflow-auto text-xs text-gray-400 space-y-1">
                                {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ────────────────────────────────────────────────────────────────────────────
// 메인 페이지
// ────────────────────────────────────────────────────────────────────────────
const DataManagementPage = () => {
    const [activeTab, setActiveTab] = useState('export');

    const tabs = [
        { id: 'export', label: '📤 데이터 내보내기', desc: '현재 MES DB → Excel/CSV 다운로드' },
        { id: 'import', label: '📥 데이터 가져오기', desc: '구 시스템 자료 → MES DB 업로드' },
    ];

    return (
        <div className="space-y-6">
            {/* 헤더 */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                    <Database className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-white">DB 관리</h2>
                    <p className="text-xs text-gray-500">데이터 가져오기 / 내보내기 (Access DB ↔ MES)</p>
                </div>
            </div>

            {/* 탭 */}
            <div className="flex gap-2 p-1 bg-gray-900/60 rounded-xl border border-gray-800">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={cn(
                            'flex-1 flex flex-col items-center py-3 px-4 rounded-lg transition-all',
                            activeTab === t.id
                                ? 'bg-gray-800 shadow text-white'
                                : 'text-gray-500 hover:text-gray-400'
                        )}
                    >
                        <span className="font-semibold text-sm">{t.label}</span>
                        <span className="text-[11px] opacity-70 mt-0.5">{t.desc}</span>
                    </button>
                ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="bg-gray-900/40 rounded-2xl border border-gray-800 p-6">
                {activeTab === 'export' ? <ExportTab /> : <ImportTab />}
            </div>
        </div>
    );
};

export default DataManagementPage;
