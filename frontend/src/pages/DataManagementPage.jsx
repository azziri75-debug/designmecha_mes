import React, { useState, useRef } from 'react';
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
import axios from 'axios';
import Card from '../components/Card';
import { cn } from '../lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const DB_TABLES = [
    { id: 'products', name: '제품 정보 (Products)', icon: Database, isInteractive: true },
    { id: 'partners', name: '거래처 정보 (Clients)', icon: Database },
    { id: 'staff', name: '직원 정보 (Staff)', icon: Database },
    { id: 'equipments', name: '설비 정보 (Equipments)', icon: Database },
];

// --- Mapping Modal Component ---
const MappingModal = ({ isOpen, onClose, data, onConfirm }) => {
    if (!isOpen) return null;

    const [mappings, setMappings] = useState(
        data.rows.map(row => {
            const exactMatch = row.matches.find(m => m.match_type === 'EXACT');
            return {
                ...row,
                mapping_type: exactMatch ? 'EXISTING' : (row.matches.length > 0 ? 'EXISTING' : 'NEW'),
                partner_id: exactMatch ? exactMatch.id : (row.matches[0]?.id || null),
                new_partner_name: row.data.partner_name || '신규 거래처'
            };
        })
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleMappingChange = (index, updates) => {
        const newMappings = [...mappings];
        newMappings[index] = { ...newMappings[index], ...updates };
        setMappings(newMappings);
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        try {
            const formattedItems = mappings.map(m => ({
                row_index: m.row_index,
                data: m.data,
                mapping_type: m.mapping_type,
                partner_id: m.mapping_type === 'EXISTING' ? m.partner_id : null,
                new_partner_name: m.mapping_type === 'NEW' ? m.new_partner_name : null
            }));
            const response = await axios.post(`${API_URL}/db-manager/confirm/products`, formattedItems);
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
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-blue-500" />
                            데이터 검증 및 거래처 매핑
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">업로드 전 거래처 정보를 확인하고 짝을 맞춰주세요.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="sticky top-0 bg-gray-900 z-10 text-gray-500 border-b border-gray-800">
                            <tr>
                                <th className="pb-3 pr-4 font-medium">행</th>
                                <th className="pb-3 pr-4 font-medium">제품명</th>
                                <th className="pb-3 pr-4 font-medium">엑셀 거래처명</th>
                                <th className="pb-3 pr-4 font-medium text-center">검증 결과</th>
                                <th className="pb-3 font-medium">DB 매핑 선택</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                            {mappings.map((m, idx) => (
                                <tr key={idx} className="group hover:bg-white/5 transition-colors">
                                    <td className="py-4 text-gray-500">{m.row_index}</td>
                                    <td className="py-4 font-medium text-white">{m.data.name}</td>
                                    <td className="py-4 text-gray-300">{m.data.partner_name || '-'}</td>
                                    <td className="py-4">
                                        <div className="flex justify-center">
                                            {m.status === 'EXACT' && (
                                                <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded text-xs font-bold border border-green-500/20">자동 매핑</span>
                                            )}
                                            {m.status === 'SIMILAR' && (
                                                <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded text-xs font-bold border border-yellow-500/20">유사 확인</span>
                                            )}
                                            {m.status === 'NONE' && (
                                                <span className="px-2 py-1 bg-red-500/10 text-red-500 rounded text-xs font-bold border border-red-500/20">정보 없음</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex items-center gap-2">
                                            <select
                                                className="bg-gray-800 border-gray-700 text-gray-200 text-xs rounded-md px-2 py-1 flex-1 focus:border-blue-500 outline-none"
                                                value={m.mapping_type === 'NEW' ? 'NEW' : (m.partner_id || '')}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === 'NEW') {
                                                        handleMappingChange(idx, { mapping_type: 'NEW', partner_id: null });
                                                    } else {
                                                        handleMappingChange(idx, { mapping_type: 'EXISTING', partner_id: parseInt(val) });
                                                    }
                                                }}
                                            >
                                                <optgroup label="매핑 옵션">
                                                    <option value="NEW">✨ 신규 거래처로 등록</option>
                                                </optgroup>
                                                {m.matches.length > 0 && (
                                                    <optgroup label="검색된 추천 거래처">
                                                        {m.matches.map(opt => (
                                                            <option key={opt.id} value={opt.id}>🔗 {opt.name}</option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {m.mapping_type === 'EXISTING' && m.partner_id && !m.matches.some(opt => opt.id === m.partner_id) && (
                                                    <option value={m.partner_id}>Selected ID: {m.partner_id}</option>
                                                )}
                                            </select>
                                            {m.mapping_type === 'NEW' && (
                                                <input
                                                    type="text"
                                                    className="bg-gray-800 border-gray-700 text-blue-400 text-xs rounded-md px-2 py-1 w-32 focus:border-blue-500 outline-none"
                                                    value={m.new_partner_name}
                                                    onChange={(e) => handleMappingChange(idx, { new_partner_name: e.target.value })}
                                                />
                                            )}
                                        </div>
                                    </td>
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
            const response = await axios.get(`${API_URL}/db-manager/template/${selectedTable}`, {
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

        if (currentConfig.isInteractive) {
            // 2-Step Interactive Flow for Products
            setLoading(true);
            setResult(null);
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await axios.post(`${API_URL}/db-manager/verify/${selectedTable}`, formData);
                setVerifyData(response.data);
                setIsModalOpen(true);
            } catch (error) {
                alert('데이터 검증 중 오류가 발생했습니다: ' + (error.response?.data?.detail || error.message));
            } finally {
                setLoading(false);
            }
        } else {
            // Standard Flow for others
            setLoading(true);
            setResult(null);
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await axios.post(`${API_URL}/db-manager/upload/${selectedTable}`, formData);
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
                data={verifyData}
                onConfirm={(msg) => {
                    setResult({ success: true, message: msg });
                    setFile(null);
                }}
            />
        </div>
    );
};

export default DataManagementPage;
