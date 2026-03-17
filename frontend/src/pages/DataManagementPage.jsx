import React, { useState, useRef, useEffect } from 'react';
import {
    Download,
    Upload,
    Database,
    AlertCircle,
    CheckCircle2,
    Loader2,
    FileSpreadsheet,
    Info,
    X,
    ChevronRight,
    Search,
    UserPlus,
    Check
} from 'lucide-react';
import api from '../lib/api';
import Card from '../components/Card';
import { cn } from '../lib/utils';

// API_URL 제거 (api 인스턴스의 baseURL 사용)

const DB_TABLES = [
    { id: 'orders', name: '수주 정보 (Orders)', icon: Database, isInteractive: true },
    { id: 'products', name: '제품 정보 (Products)', icon: Database, isInteractive: true },
    { id: 'partners', name: '거래처 정보 (Clients)', icon: Database },
    { id: 'staff', name: '직원 정보 (Staff)', icon: Database },
    { id: 'equipments', name: '설비 정보 (Equipments)', icon: Database },
];

// --- Mapping Modal Component ---
const MappingModal = ({ isOpen, onClose, verifyData, type, onConfirm }) => {
    const [mappings, setMappings] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && verifyData) {
            const initial = verifyData.rows.map(row => {
                if (type === 'products') {
                    const exactMatch = row.matches.find(m => m.match_type === 'EXACT');
                    return {
                        ...row,
                        mapping_type: exactMatch ? 'EXISTING' : (row.matches.length > 0 ? 'EXISTING' : 'NEW'),
                        partner_id: exactMatch ? exactMatch.id : (row.matches[0]?.id || null),
                        new_partner_name: row.data.partner_name || ''
                    };
                } else {
                    // orders
                    const exactPartner = row.partner_matches.find(m => m.match_type === 'EXACT');
                    const exactProduct = row.product_matches.find(m => m.match_type === 'EXACT');
                    return {
                        ...row,
                        partner_mapping_type: exactPartner ? 'EXISTING' : (row.partner_matches.length > 0 ? 'EXISTING' : 'NEW'),
                        partner_id: exactPartner ? exactPartner.id : (row.partner_matches[0]?.id || null),
                        new_partner_name: row.data.partner_name || '',
                        product_mapping_type: 'EXISTING',
                        product_id: exactProduct ? exactProduct.id : (row.product_matches[0]?.id || null)
                    };
                }
            });
            setMappings(initial);
        }
    }, [isOpen, verifyData, type]);

    if (!isOpen || mappings.length === 0) return null;

    const handleMappingChange = (index, updates) => {
        const newMappings = [...mappings];
        newMappings[index] = { ...newMappings[index], ...updates };
        setMappings(newMappings);
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        try {
            const response = await api.post(`/db-manager/confirm/${type}`, payload);
            onConfirm(response.data.message);
            onClose();
        } catch (error) {
            alert('최종 등록 중 오류가 발생했습니다: ' + (error.response?.data?.detail || error.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-blue-500" />
                            데이터 검증 및 매핑 ({type === 'products' ? '제품' : '수주'})
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">업로드 전 DB 정보와 매핑하여 데이터 정합성을 확인하세요.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="sticky top-0 bg-gray-900 z-10 text-gray-500 border-b border-gray-800">
                            <tr>
                                <th className="pb-3 pr-4 font-medium w-12">행</th>
                                <th className="pb-3 pr-4 font-medium">{type === 'products' ? '제품명' : '제품/규격'}</th>
                                <th className="pb-3 pr-4 font-medium">거래처 매핑</th>
                                {type === 'orders' && <th className="pb-3 pr-4 font-medium">제품 매핑</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                            {mappings.map((m, idx) => (
                                <tr key={idx} className="group hover:bg-white/5 transition-colors">
                                    <td className="py-4 text-gray-500">{m.row_index}</td>
                                    <td className="py-4">
                                        <div className="font-medium text-white">
                                            {type === 'products' ? m.data.name : `${m.data.product_name} / ${m.data.specification || '-'}`}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                            {type === 'orders' && `수량: ${m.data.quantity} / 단가: ${m.data.unit_price}`}
                                        </div>
                                    </td>

                                    {/* Partner Mapping Column */}
                                    <td className="py-4 pr-4">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 text-[10px] shrink-0 w-16">엑셀: {m.data.partner_name || '-'}</span>
                                                {m.partner_status === 'EXACT' || m.status === 'EXACT' ? (
                                                    <Check className="w-3 h-3 text-green-500" />
                                                ) : (
                                                    <AlertCircle className="w-3 h-3 text-yellow-500" />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    className="bg-gray-800 border border-gray-700 text-gray-200 text-[11px] rounded px-2 py-1 flex-1 outline-none focus:border-blue-500"
                                                    value={(type === 'products' ? m.mapping_type : m.partner_mapping_type) === 'NEW' ? 'NEW' : (m.partner_id || '')}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const updates = type === 'products'
                                                            ? { mapping_type: val === 'NEW' ? 'NEW' : 'EXISTING', partner_id: val === 'NEW' ? null : parseInt(val) }
                                                            : { partner_mapping_type: val === 'NEW' ? 'NEW' : 'EXISTING', partner_id: val === 'NEW' ? null : parseInt(val) };
                                                        handleMappingChange(idx, updates);
                                                    }}
                                                >
                                                    <option value="NEW">✨ 신규 거래처 등록</option>
                                                    <optgroup label="추천 검색 결과">
                                                        {(m.partner_matches || m.matches || []).map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                                {(type === 'products' ? m.mapping_type : m.partner_mapping_type) === 'NEW' && (
                                                    <input
                                                        type="text"
                                                        className="bg-gray-800 border border-gray-700 text-blue-400 text-[11px] rounded px-2 py-1 w-24 outline-none focus:border-blue-500"
                                                        value={m.new_partner_name}
                                                        onChange={(e) => handleMappingChange(idx, { new_partner_name: e.target.value })}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Product Mapping Column (Orders Only) */}
                                    {type === 'orders' && (
                                        <td className="py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-400 text-[10px] shrink-0 w-16">매칭 상태:</span>
                                                    {m.product_status === 'EXACT' ? (
                                                        <span className="text-green-500 font-bold">EXACT</span>
                                                    ) : (
                                                        <span className="text-red-400 font-bold">선택 필요</span>
                                                    )}
                                                </div>
                                                <select
                                                    className="bg-gray-800 border border-gray-700 text-gray-200 text-[11px] rounded px-2 py-1 w-full outline-none focus:border-blue-500"
                                                    value={m.product_id || ''}
                                                    onChange={(e) => handleMappingChange(idx, { product_id: parseInt(e.target.value) })}
                                                >
                                                    <option value="">-- 제품 선택 --</option>
                                                    {m.product_matches.map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} ({p.specification || '규격없음'}) {p.partner_id === m.partner_id ? '✅' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 border-t border-gray-800 flex justify-end gap-3 bg-gray-900/50">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors font-medium"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleFinalSubmit}
                        disabled={isSubmitting}
                        className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all font-bold shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        최종 등록 완료
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Main Page Component ---
const DataManagementPage = () => {
    const [selectedTable, setSelectedTable] = useState(DB_TABLES[0].id);
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [verifyData, setVerifyData] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleDownloadTemplate = async () => {
        try {
            const response = await api.get(`/db-manager/template/${selectedTable}`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `template_${selectedTable}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            alert('양식 다운로드 중 오류가 발생했습니다.');
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleProcess = async () => {
        if (!file) {
            alert('파일을 선택해주세요.');
            return;
        }

        const currentConfig = DB_TABLES.find(t => t.id === selectedTable);
        const formData = new FormData();
        formData.append('file', file);

        if (currentConfig.isInteractive) {
            setLoading(true);
            setResult(null);
            try {
                const response = await api.post(`/db-manager/verify/${selectedTable}/`, formData);
                setVerifyData(response.data);
                setIsModalOpen(true);
            } catch (error) {
                alert('데이터 검증 중 오류가 발생했습니다: ' + (error.response?.data?.detail || error.message));
            } finally {
                setLoading(false);
            }
        } else {
            setLoading(true);
            setResult(null);
            try {
                const response = await api.post(`/db-manager/upload/${selectedTable}/`, formData);
                setResult({
                    success: true,
                    message: response.data.message
                });
                setFile(null);
            } catch (error) {
                const errorData = error.response?.data;
                setResult({
                    success: false,
                    message: errorData?.message || '업로드 중 오류가 발생했습니다.',
                    errors: errorData?.errors || []
                });
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 border-gray-800 bg-gray-900/50">
                    <div className="p-6 space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">데이터 대상 선택</label>
                            <div className="grid grid-cols-1 gap-2">
                                {DB_TABLES.map((table) => (
                                    <button
                                        key={table.id}
                                        onClick={() => {
                                            setSelectedTable(table.id);
                                            setResult(null);
                                            setFile(null);
                                        }}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left",
                                            selectedTable === table.id
                                                ? "bg-blue-600/10 border-blue-500 text-blue-400 shadow-lg shadow-blue-500/10"
                                                : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600 hover:bg-gray-800"
                                        )}
                                    >
                                        <table.icon className="w-5 h-5" />
                                        <span className="font-medium">{table.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-800">
                            <button
                                onClick={handleDownloadTemplate}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors border border-gray-700"
                            >
                                <Download className="w-4 h-4" />
                                <span>엑셀 양식 다운로드</span>
                            </button>
                            <p className="mt-3 text-xs text-gray-500 leading-relaxed italic">
                                * 선택한 대상에 맞는 업로드용 빈 양식을 다운로드합니다.
                            </p>
                        </div>
                    </div>
                </Card>

                <Card className="md:col-span-2 border-gray-800 bg-gray-900/50">
                    <div className="p-6 space-y-6">
                        <div className="flex items-center gap-2 text-blue-400">
                            <Upload className="w-5 h-5" />
                            <h3 className="font-semibold text-lg">엑셀 업로드 및 처리</h3>
                        </div>

                        <div className={cn(
                            "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center transition-all",
                            file ? "border-blue-500 bg-blue-500/5" : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
                        )}>
                            <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" id="excel-upload" />
                            <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center">
                                <FileSpreadsheet className={cn("w-16 h-16 mb-4", file ? "text-blue-500" : "text-gray-600")} />
                                <span className="text-gray-300 font-medium text-center">
                                    {file ? file.name : '클릭하거나 파일을 드래그하여 업로드'}
                                </span>
                                <span className="text-gray-500 text-sm mt-1">Excel (.xlsx, .xls)</span>
                            </label>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-800">
                            <button
                                onClick={handleProcess}
                                disabled={!file || loading}
                                className={cn(
                                    "px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition-all",
                                    !file || loading ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/25"
                                )}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>데이터 분석 중...</span>
                                    </>
                                ) : (
                                    <>
                                        <ChevronRight className="w-5 h-5" />
                                        <span>{DB_TABLES.find(t => t.id === selectedTable).isInteractive ? '검증 단계 진행' : '즉시 반영하기'}</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {result && (
                            <div className={cn("rounded-xl p-6 border animate-in fade-in slide-in-from-top-4", result.success ? "bg-green-500/10 border-green-500/50" : "bg-red-500/10 border-red-500/50")}>
                                <div className="flex items-start gap-4">
                                    {result.success ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <AlertCircle className="w-6 h-6 text-red-500" />}
                                    <div>
                                        <h4 className={cn("font-bold text-lg", result.success ? "text-green-400" : "text-red-400")}>{result.success ? '완료' : '오류'}</h4>
                                        <p className="text-gray-300">{result.message}</p>
                                        {!result.success && result.errors?.length > 0 && (
                                            <div className="mt-4 bg-black/40 rounded-lg p-4 max-h-40 overflow-auto">
                                                {result.errors.map((err, i) => <div key={i} className="text-sm text-gray-400 py-1">• {err}</div>)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <MappingModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                verifyData={verifyData}
                type={selectedTable}
                onConfirm={(msg) => {
                    setResult({ success: true, message: msg });
                    setFile(null);
                }}
            />
        </div>
    );
};

export default DataManagementPage;
