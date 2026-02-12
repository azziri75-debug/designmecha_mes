import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Play, FileText, Printer, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';

const ProductionPage = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const res = await api.get('/production/plans/');
            setPlans(res.data);
        } catch (error) {
            console.error("Failed to fetch production plans", error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateWorkOrders = async (planId) => {
        try {
            await api.post(`/production/plans/${planId}/generate-work-orders`);
            fetchPlans(); // Refresh
            alert("작업지시서가 생성되었습니다.");
        } catch (error) {
            console.error("Failed to generate work orders", error);
            alert("작업지시서 생성 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handlePrintPdf = async (planId) => {
        try {
            const res = await api.get(`/production/plans/${planId}/pdf`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `work_order_${planId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Failed to download PDF", error);
            alert("PDF 다운로드 실패");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">생산 관리</h2>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {loading ? (
                    <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : (
                    plans.map((plan) => (
                        <Card key={plan.id} className="border-l-4 border-l-blue-500">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div className="space-y-1">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <span className="font-mono text-blue-400">#{plan.id}</span>
                                        <span className="text-gray-300">
                                            {plan.order ? `Order: ${plan.order.order_no}` : 'No Order'}
                                        </span>
                                    </CardTitle>
                                    <div className="text-sm text-gray-500">
                                        담당: 관리자 | 시작일: {plan.start_date || '-'} | 종료일: {plan.end_date || '-'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "px-3 py-1 rounded-full text-xs font-medium border",
                                        plan.status === 'PLANNED' ? "bg-gray-500/10 text-gray-400 border-gray-500/20" :
                                            plan.status === 'IN_PROGRESS' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                                "bg-green-500/10 text-green-400 border-green-500/20"
                                    )}>
                                        {plan.status}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Work Orders List */}
                                {plan.work_orders && plan.work_orders.length > 0 ? (
                                    <div className="mt-4 space-y-3">
                                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> 작업 지시 목록
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {plan.work_orders.map((wo) => (
                                                <div key={wo.id} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50 flex flex-col gap-2">
                                                    <div className="flex justify-between items-start">
                                                        <span className="font-medium text-gray-200">{wo.process_name}</span>
                                                        <span className="text-xs text-gray-500">#{wo.sequence}</span>
                                                    </div>
                                                    <div className="flex justify-between items-end mt-auto">
                                                        <span className="text-xs text-gray-500 capitalize">{wo.status.toLowerCase()}</span>
                                                        <div className="flex gap-2 text-xs">
                                                            <span className="text-emerald-400">양품: {wo.good_quantity}</span>
                                                            <span className="text-red-400">불량: {wo.bad_quantity}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4 flex justify-end">
                                            <button
                                                onClick={() => handlePrintPdf(plan.id)}
                                                className="flex items-center gap-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 px-3 py-2 rounded-md transition-colors"
                                            >
                                                <Printer className="w-4 h-4" />
                                                <span>작업지시서 출력 (PDF)</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-4 flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 gap-2">
                                        <Clock className="w-8 h-8 opacity-50" />
                                        <p className="text-sm">생성된 작업 지시가 없습니다.</p>
                                        <button
                                            onClick={() => handleGenerateWorkOrders(plan.id)}
                                            className="mt-2 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            <Play className="w-4 h-4" />
                                            <span>작업 지시 생성</span>
                                        </button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

export default ProductionPage;
