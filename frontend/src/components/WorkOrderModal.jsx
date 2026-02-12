import React, { useState, useRef } from 'react';
import { X, Upload, Camera, Save, CheckCircle } from 'lucide-react';
import api from '../lib/api';

const WorkOrderModal = ({ workOrder, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        status: workOrder.status,
        good_quantity: workOrder.good_quantity,
        bad_quantity: workOrder.bad_quantity,
    });
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setUploading(true);
        try {
            // 1. Update Work Order Data
            await api.put(`/production/work-orders/${workOrder.id}`, formData);

            // 2. Upload File if selected
            if (file) {
                const formDataObj = new FormData();
                formDataObj.append('related_type', 'WORK'); // or QUALITY
                formDataObj.append('related_id', workOrder.id);
                formDataObj.append('file', file);

                await api.post('/quality/upload/', formDataObj, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to update work order", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-700 bg-gray-900/50">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            작업 실적 등록
                            <span className="text-xs font-mono font-normal text-gray-400 bg-gray-800 px-2 py-1 rounded">#{workOrder.id}</span>
                        </h3>
                        <p className="text-sm text-blue-400 mt-1">{workOrder.process_name}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Status Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">진행 상태</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, status }))}
                                    className={`text-sm py-2 px-3 rounded-lg border transition-all ${formData.status === status
                                            ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/20'
                                            : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-700'
                                        }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Quantities */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-emerald-500 uppercase tracking-wide">양품 수량</label>
                            <input
                                type="number"
                                name="good_quantity"
                                value={formData.good_quantity}
                                onChange={handleInputChange}
                                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 outline-none text-right font-mono text-lg"
                                min="0"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-red-500 uppercase tracking-wide">불량 수량</label>
                            <input
                                type="number"
                                name="bad_quantity"
                                value={formData.bad_quantity}
                                onChange={handleInputChange}
                                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none text-right font-mono text-lg"
                                min="0"
                            />
                        </div>
                    </div>

                    {/* File Upload */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">사진 / 파일 첨부</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-700 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-gray-500 hover:bg-gray-700/30 transition-all text-gray-400 gap-2"
                        >
                            {file ? (
                                <div className="flex items-center gap-2 text-blue-400">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                                </div>
                            ) : (
                                <>
                                    <Camera className="w-6 h-6 mb-1" />
                                    <span className="text-xs">클릭하여 사진 업로드</span>
                                </>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept="image/*,.pdf"
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={uploading}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <span className="animate-pulse">저장 중...</span>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" /> 저장 완료
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default WorkOrderModal;
