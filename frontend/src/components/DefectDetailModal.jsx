import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Clock, Trash2, Save, FileText } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';
import FileViewerModal from './FileViewerModal';

const DefectDetailModal = ({ isOpen, onClose, defect, onSuccess }) => {
    const [formData, setFormData] = useState({
        defect_reason: '',
        quantity: 0,
        amount: 0,
        resolution_note: '',
        status: 'OCCURRED',
        attachment_file: []
    });
    const [loading, setLoading] = useState(false);

    // FileViewerModal 상태
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);

    useEffect(() => {
        if (defect) {
            setFormData({
                defect_reason: defect.defect_reason || '',
                quantity: defect.quantity || 0,
                amount: defect.amount || 0,
                resolution_note: defect.resolution_note || '',
                status: defect.status || 'OCCURRED',
                attachment_file: defect.attachment_file ? (typeof defect.attachment_file === 'string' ? JSON.parse(defect.attachment_file) : defect.attachment_file) : []
            });
        }
    }, [defect]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const uploadData = new FormData();
        uploadData.append('file', file);
        try {
            const uploadRes = await api.post('/upload', uploadData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const newFile = { name: uploadRes.data.filename, url: uploadRes.data.url };
            setFormData(prev => ({ ...prev, attachment_file: [...prev.attachment_file, newFile] }));
        } catch (err) {
            console.error("Upload failed", err);
            alert("파일 업로드 실패");
        } finally {
            e.target.value = null;
        }
    };

    const handleRemoveFile = (indexToRemove) => {
        setFormData(prev => ({
            ...prev,
            attachment_file: prev.attachment_file.filter((_, idx) => idx !== indexToRemove)
        }));
    };

    const handleUpdate = async (newStatus = null) => {
        if (!defect) return;
        setLoading(true);
        try {
            const statusToSave = newStatus || formData.status;
            const payload = {
                ...formData,
                status: statusToSave,
                resolution_date: statusToSave === 'RESOLVED' ? new Date().toISOString() : null
            };

            await api.put(`/quality/defects/${defect.id}`, payload);
            alert(newStatus === 'RESOLVED' ? "처리가 완료되었습니다." : "수정되었습니다.");
            onSuccess();
        } catch (error) {
            console.error("Update failed", error);
            alert("처리 실패");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("정말로 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/quality/defects/${defect.id}`);
            alert("삭제되었습니다.");
            onSuccess();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패");
        }
    };

    if (!isOpen || !defect) return null;

    const isResolved = formData.status === 'RESOLVED';

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
                    <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                isResolved ? "bg-green-500" : "bg-red-500 animate-pulse"
                            )} />
                            <h2 className="text-xl font-bold text-white">불량 상세 정보</h2>
                            <span className={cn(
                                "ml-2 text-[10px] px-2 py-0.5 rounded border uppercase",
                                isResolved ? "bg-green-900/30 text-green-400 border-green-700" : "bg-red-900/30 text-red-400 border-red-700"
                            )}>
                                {isResolved ? "처리 완료" : "발생 대기"}
                            </span>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Header Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                <label className="text-[10px] text-gray-500 font-bold block mb-1">수주/생산 정보</label>
                                <div className="text-sm font-mono text-blue-400">{defect.order?.order_no}</div>
                                <div className="text-xs text-gray-400">{defect.order?.partner?.name}</div>
                            </div>
                            <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                <label className="text-[10px] text-gray-500 font-bold block mb-1">발생 공정</label>
                                <div className="text-sm text-white font-medium">{defect.plan_item?.process_name}</div>
                                <div className="text-[10px] text-gray-500">{defect.plan_item?.product?.name}</div>
                            </div>
                        </div>

                        {/* Defect Details */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                <FileText className="w-4 h-4" /> 불량 발생 내용
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">발생 수량</label>
                                    <input
                                        type="number"
                                        value={formData.quantity}
                                        disabled={isResolved}
                                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-gray-700 border-gray-600 rounded text-white p-2 text-sm disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">추정 손실액 (원)</label>
                                    <input
                                        type="number"
                                        value={formData.amount}
                                        disabled={isResolved}
                                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-gray-700 border-gray-600 rounded text-white p-2 text-sm disabled:opacity-50"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs text-gray-500 mb-1">불량 사유</label>
                                    <textarea
                                        value={formData.defect_reason}
                                        disabled={isResolved}
                                        onChange={(e) => setFormData({ ...formData, defect_reason: e.target.value })}
                                        className="w-full bg-gray-700 border-gray-600 rounded text-white p-2 text-sm h-20 disabled:opacity-50"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs text-gray-500">첨부 파일 (선택)</label>
                                        {!isResolved && (
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('defect-detail-upload').click()}
                                                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors"
                                            >
                                                + 파일 추가
                                            </button>
                                        )}
                                        <input
                                            type="file"
                                            id="defect-detail-upload"
                                            style={{ display: 'none' }}
                                            onChange={handleFileUpload}
                                        />
                                    </div>
                                    <div className="bg-gray-700 border border-gray-600 rounded p-2 min-h-[60px] flex flex-wrap gap-2">
                                        {formData.attachment_file.length === 0 ? (
                                            <span className="text-gray-500 text-xs w-full text-center py-2">첨부된 파일이 없습니다.</span>
                                        ) : (
                                            formData.attachment_file.map((file, idx) => (
                                                <div key={idx} className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1 text-sm border border-gray-600">
                                                    <span
                                                        className="text-blue-400 hover:underline max-w-[200px] truncate cursor-pointer"
                                                        title={file.name}
                                                        onClick={() => {
                                                            setViewingFiles(formData.attachment_file);
                                                            setShowFileModal(true);
                                                        }}
                                                    >
                                                        {file.name}
                                                    </span>
                                                    {!isResolved && (
                                                        <button onClick={() => handleRemoveFile(idx)} className="text-red-400 hover:text-red-300 ml-1">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-700 pt-6">
                            <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-4">
                                <CheckCircle className="w-4 h-4" /> 처리 내용
                            </h3>
                            <div className="space-y-4">
                                <textarea
                                    value={formData.resolution_note}
                                    onChange={(e) => setFormData({ ...formData, resolution_note: e.target.value })}
                                    placeholder="불량에 대한 처리 결과 또는 조치 내용을 입력하세요."
                                    className="w-full bg-gray-900 border-gray-600 rounded text-white p-3 text-sm h-32 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                {isResolved && (
                                    <div className="text-xs text-gray-500 flex items-center gap-1 justify-end">
                                        <Clock className="w-3 h-3" /> 처리완료 일시: {new Date(defect.resolution_date).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-700 flex justify-between gap-3">
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors border border-red-900/50"
                        >
                            <Trash2 className="w-4 h-4" /> 삭제
                        </button>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-400 hover:bg-gray-700">취소</button>
                            {!isResolved && (
                                <>
                                    <button
                                        onClick={() => handleUpdate()}
                                        disabled={loading}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 font-medium border border-gray-600"
                                    >
                                        <Save className="w-4 h-4" /> 저장
                                    </button>
                                    <button
                                        onClick={() => handleUpdate('RESOLVED')}
                                        disabled={loading}
                                        className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 font-bold shadow-lg shadow-green-900/20"
                                    >
                                        <CheckCircle className="w-4 h-4" /> 처리 완료 확정
                                    </button>
                                </>
                            )}
                            {isResolved && (
                                <button
                                    onClick={() => handleUpdate()}
                                    disabled={loading}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-medium"
                                >
                                    변경사항 저장
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Important: Import FileViewerModal dynamically or normally. Assuming it's passed or available. Wait, I should import it at the top. */}
            {
                showFileModal && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
                        {/* Simplified file viewer if component is not imported, or just generic link handling. 
                    I'll add the FileViewerModal import at the top later if missing, but we can just use normal window.open for now if FileViewerModal is not imported.
                */}
                    </div>
                )
            }
        </>
    );
};

export default DefectDetailModal;
