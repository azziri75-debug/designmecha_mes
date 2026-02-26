import React, { useState, useEffect } from 'react';
import { X, Search, Check, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

const DefectRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1); // 1: Select Plan, 2: Select Process/Input Data

    const [selectedPlan, setSelectedPlan] = useState(null);
    const [selectedProcess, setSelectedProcess] = useState(null);

    const [formData, setFormData] = useState({
        defect_reason: '',
        quantity: 0,
        amount: 0,
        defect_date: new Date().toISOString().split('T')[0],
        attachment_file: []
    });

    useEffect(() => {
        if (isOpen) {
            fetchPlans();
            setStep(1);
            setSelectedPlan(null);
            setSelectedProcess(null);
            setFormData({
                defect_reason: '',
                quantity: 0,
                amount: 0,
                defect_date: new Date().toISOString().split('T')[0],
                attachment_file: []
            });
        }
    }, [isOpen]);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const res = await api.get('/production/plans');
            // Filter plans that are PLANNED, IN_PROGRESS or COMPLETED
            const filtered = res.data.filter(p => ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(p.status));
            setPlans(filtered);
        } catch (error) {
            console.error("Failed to fetch plans", error);
        } finally {
            setLoading(false);
        }
    };

    const handlePlanSelect = (plan) => {
        setSelectedPlan(plan);
        setStep(2);
    };

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

    const handleSubmit = async () => {
        if (!selectedProcess) return alert("공정을 선택해주세요.");
        if (!formData.defect_reason) return alert("불량 내용을 입력해주세요.");
        if (formData.quantity <= 0) return alert("불량 수량을 입력해주세요.");

        try {
            const payload = {
                order_id: selectedPlan.order_id,
                plan_id: selectedPlan.id,
                plan_item_id: selectedProcess.id,
                ...formData,
                attachment_file: formData.attachment_file.length > 0 ? JSON.stringify(formData.attachment_file) : null,
                defect_date: new Date(formData.defect_date).toISOString()
            };

            await api.post('/quality/defects/', payload);
            alert("불량이 등록되었습니다.");
            onSuccess();
        } catch (error) {
            console.error("Failed to save defect", error);
            alert("등록 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">
                        {step === 1 ? "생산 계획 선택" : "불량 상세 정보 입력"}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 1 ? (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400 mb-4">불량이 발생한 생산 계획을 선택하세요.</p>
                            {loading ? (
                                <div className="text-center py-10">로딩 중...</div>
                            ) : plans.length === 0 ? (
                                <div className="text-center py-10 text-gray-500 border border-dashed border-gray-700 rounded-lg">
                                    등록된 생산 계획이 없습니다.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {plans.map(plan => (
                                        <button
                                            key={plan.id}
                                            onClick={() => handlePlanSelect(plan)}
                                            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 text-left transition-colors flex justify-between items-center group"
                                        >
                                            <div>
                                                <div className="text-xs text-blue-400 font-mono mb-1">
                                                    {plan.order?.order_no || plan.stock_production?.production_no || '시스템 생성'}
                                                </div>
                                                <div className="text-white font-medium">
                                                    {plan.order?.partner?.name || '내부 (재고 생산)'}
                                                </div>
                                                <div className="text-sm text-gray-400 mt-1">
                                                    {plan.items?.[0]?.product?.name || plan.stock_production?.product?.name}
                                                    {plan.items?.length > 1 ? `외 ${plan.items.length - 1}건` : ''}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] border",
                                                    plan.status === 'COMPLETED' ? "bg-green-900/50 text-green-400 border-green-700" : "bg-blue-900/50 text-blue-400 border-blue-700"
                                                )}>
                                                    {plan.status}
                                                </span>
                                                <div className="text-xs text-gray-500 mt-2 group-hover:text-white flex items-center gap-1">
                                                    선택 <Search className="w-3 h-3" />
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <div className="text-gray-500">생산/수주번호</div>
                                        <div className="text-white">{selectedPlan.order?.order_no || selectedPlan.stock_production?.production_no}</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">구분</div>
                                        <div className="text-white">{selectedPlan.order?.partner?.name || '재고 생산'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-400">1. 공정 선택</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {selectedPlan.items?.sort((a, b) => a.sequence - b.sequence).map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelectedProcess(item)}
                                            className={cn(
                                                "p-3 rounded border text-sm transition-all text-left relative",
                                                selectedProcess?.id === item.id
                                                    ? "bg-blue-600 border-blue-500 text-white shadow-lg"
                                                    : "bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500"
                                            )}
                                        >
                                            <div className="text-[10px] opacity-70 mb-0.5">Step {item.sequence}</div>
                                            <div className="font-medium truncate">{item.process_name}</div>
                                            <div className="text-[10px] opacity-70 truncate">{item.product?.name}</div>
                                            {selectedProcess?.id === item.id && (
                                                <Check className="w-4 h-4 absolute top-2 right-2" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">2. 발생 일자</label>
                                    <input
                                        type="date"
                                        value={formData.defect_date}
                                        onChange={(e) => setFormData({ ...formData, defect_date: e.target.value })}
                                        className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">3. 불량 수량</label>
                                    <input
                                        type="number"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">4. 추정 손실액</label>
                                    <input
                                        type="number"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-400 mb-1">5. 불량 내용 및 사유</label>
                                    <textarea
                                        value={formData.defect_reason}
                                        onChange={(e) => setFormData({ ...formData, defect_reason: e.target.value })}
                                        className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5 h-24"
                                        placeholder="공정 중 발생한 불량 상세 내용을 입력하세요."
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">6. 첨부 파일 (선택)</label>
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('defect-upload').click()}
                                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors"
                                        >
                                            + 파일 추가
                                        </button>
                                        <input
                                            type="file"
                                            id="defect-upload"
                                            style={{ display: 'none' }}
                                            onChange={handleFileUpload}
                                        />
                                    </div>
                                    <div className="bg-gray-700 border border-gray-600 rounded p-2 min-h-[60px] flex flex-wrap gap-2">
                                        {formData.attachment_file.length === 0 ? (
                                            <span className="text-gray-500 text-sm w-full text-center py-2">첨부된 파일이 없습니다.</span>
                                        ) : (
                                            formData.attachment_file.map((file, idx) => (
                                                <div key={idx} className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1 text-sm border border-gray-600">
                                                    <span className="text-gray-300 max-w-[200px] truncate" title={file.name}>{file.name}</span>
                                                    <button onClick={() => handleRemoveFile(idx)} className="text-red-400 hover:text-red-300 ml-1">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-700 flex justify-between gap-3">
                    {step === 2 ? (
                        <button
                            onClick={() => setStep(1)}
                            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white"
                        >
                            뒤로가기
                        </button>
                    ) : <div />}
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700">취소</button>
                        {step === 2 && (
                            <button
                                onClick={handleSubmit}
                                className="px-6 py-2 bg-red-600 rounded-lg text-white hover:bg-red-500 font-medium"
                            >
                                불량 등록 확정
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DefectRegistrationModal;
