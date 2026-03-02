import React, { useState } from 'react';
import {
    Download,
    Upload,
    Database,
    AlertCircle,
    CheckCircle2,
    Loader2,
    FileSpreadsheet,
    Info
} from 'lucide-react';
import axios from 'axios';
import Card from '../components/Card';
import { cn } from '../lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const DB_TABLES = [
    { id: 'products', name: '제품 정보 (Products)', icon: Database },
    { id: 'partners', name: '거래처 정보 (Clients)', icon: Database },
    { id: 'staff', name: '직원 정보 (Staff)', icon: Database },
    { id: 'equipments', name: '설비 정보 (Equipments)', icon: Database },
];

const DataManagementPage = () => {
    const [selectedTable, setSelectedTable] = useState(DB_TABLES[0].id);
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // { success: bool, message: str, errors: [] }

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

    const handleUpload = async () => {
        if (!file) {
            alert('파일을 선택해주세요.');
            return;
        }

        setLoading(true);
        setResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(`${API_URL}/db-manager/upload/${selectedTable}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
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
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Selection and Download */}
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
                                * 선택한 대상에 맞는 업로드용 빈 양식을 다운로드합니다. 헤더(첫 줄)를 수정하지 마세요.
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Upload Area */}
                <Card className="md:col-span-2 border-gray-800 bg-gray-900/50">
                    <div className="p-6 space-y-6">
                        <div className="flex items-center gap-2 text-blue-400">
                            <Upload className="w-5 h-5" />
                            <h3 className="font-semibold text-lg">엑셀 업로드</h3>
                        </div>

                        <div
                            className={cn(
                                "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center transition-all",
                                file ? "border-blue-500 bg-blue-500/5" : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
                            )}
                        >
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                className="hidden"
                                id="excel-upload"
                            />
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
                                onClick={handleUpload}
                                disabled={!file || loading}
                                className={cn(
                                    "px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition-all",
                                    !file || loading
                                        ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                                        : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/25"
                                )}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>처리 중...</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-5 h-5" />
                                        <span>DB에 데이터 반영하기</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Result Display */}
                        {result && (
                            <div className={cn(
                                "rounded-xl p-6 border animate-in fade-in slide-in-from-top-4 duration-300",
                                result.success ? "bg-green-500/10 border-green-500/50" : "bg-red-500/10 border-red-500/50"
                            )}>
                                <div className="flex items-start gap-4">
                                    {result.success ? (
                                        <CheckCircle2 className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-6 h-6 text-red-500 mt-1 flex-shrink-0" />
                                    )}
                                    <div className="space-y-4 w-full">
                                        <div>
                                            <h4 className={cn("font-bold text-lg", result.success ? "text-green-400" : "text-red-400")}>
                                                {result.success ? '업로드 성공' : '업로드 실패 - 전체 롤백됨'}
                                            </h4>
                                            <p className="text-gray-300 mt-1">{result.message}</p>
                                        </div>

                                        {!result.success && result.errors?.length > 0 && (
                                            <div className="bg-black/40 rounded-lg p-4 overflow-hidden">
                                                <div className="flex items-center gap-2 text-xs font-bold text-red-400 mb-2 uppercase tracking-wider">
                                                    <Info className="w-3 h-3" />
                                                    상세 오류 목록
                                                </div>
                                                <div className="max-h-60 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                                                    {result.errors.map((err, i) => (
                                                        <div key={i} className="text-sm text-gray-400 py-1 border-b border-gray-800 last:border-0">
                                                            • {err}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex gap-3 items-start">
                            <Info className="w-5 h-5 text-blue-400 mt-0.5" />
                            <div className="text-sm text-gray-400 leading-relaxed">
                                <p className="text-blue-300 font-medium mb-1">주의사항</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>엑셀 파일의 첫 줄(헤더)은 반드시 양식과 동일해야 합니다.</li>
                                    <li>데이터 중 하나라도 오류가 발생하면 **전체 데이터가 반영되지 않습니다 (Transaction Rollback)**.</li>
                                    <li>대량의 데이터를 업로드할 때는 잠시 로딩이 길어질 수 있으니 창을 닫지 마세요.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default DataManagementPage;
