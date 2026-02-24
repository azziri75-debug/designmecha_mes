import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Search, Calendar, AlertTriangle, CheckCircle, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Card } from '../components/ui/card';
import DefectRegistrationModal from '../components/DefectRegistrationModal';
import DefectDetailModal from '../components/DefectDetailModal';

const QualityPage = () => {
    const [activeTab, setActiveTab] = useState('occurred'); // occurred, resolved
    const [defects, setDefects] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modals
    const [showRegModal, setShowRegModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedDefect, setSelectedDefect] = useState(null);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        fetchDefects();
    }, [activeTab, startDate, endDate]);

    const fetchDefects = async () => {
        setLoading(true);
        try {
            const status = activeTab === 'occurred' ? 'OCCURRED' : 'RESOLVED';
            const params = { status };
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

            const res = await api.get('/quality/defects/', { params });
            setDefects(res.data);
        } catch (error) {
            console.error("Failed to fetch defects", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("정말로 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/quality/defects/${id}`);
            alert("삭제되었습니다.");
            fetchDefects();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">품질 관리</h1>
                <button
                    onClick={() => setShowRegModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 rounded-lg hover:bg-red-500 text-white font-medium"
                >
                    <Plus className="w-4 h-4" />
                    불량 발생 등록
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700">
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'occurred' ? "text-red-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('occurred')}
                >
                    불량발생현황
                    {activeTab === 'occurred' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400" />
                    )}
                </button>
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'resolved' ? "text-green-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('resolved')}
                >
                    처리된 불량내역
                    {activeTab === 'resolved' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />
                    )}
                </button>
            </div>

            {/* Filters */}
            <Card className="p-4 flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">시작일</label>
                    <input
                        type="date"
                        className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">종료일</label>
                    <input
                        type="date"
                        className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => fetchDefects()}
                    className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm flex items-center gap-2"
                >
                    <Search className="w-4 h-4" />
                    조회
                </button>
            </Card>

            {/* List */}
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="bg-gray-800 text-xs uppercase text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="px-6 py-3">발생일시</th>
                                <th className="px-6 py-3">수주번호</th>
                                <th className="px-6 py-3">품목 / 공정</th>
                                <th className="px-6 py-3">불량내용</th>
                                <th className="px-6 py-3 text-right">수량</th>
                                <th className="px-6 py-3 text-right">금액</th>
                                {activeTab === 'resolved' && <th className="px-6 py-3">처리일시</th>}
                                <th className="px-6 py-3">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                <tr><td colSpan="8" className="px-6 py-10 text-center">로딩 중...</td></tr>
                            ) : defects.length === 0 ? (
                                <tr><td colSpan="8" className="px-6 py-10 text-center">데이터가 없습니다.</td></tr>
                            ) : (
                                defects.map(defect => (
                                    <tr
                                        key={defect.id}
                                        className="hover:bg-gray-700/50 cursor-pointer transition-colors"
                                        onClick={() => {
                                            setSelectedDefect(defect);
                                            setShowDetailModal(true);
                                        }}
                                    >
                                        <td className="px-6 py-4">{new Date(defect.defect_date).toLocaleString()}</td>
                                        <td className="px-6 py-4 font-mono text-xs">{defect.order?.order_no}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-white font-medium">{defect.plan_item?.product?.name}</div>
                                            <div className="text-xs text-gray-500">{defect.plan_item?.process_name}</div>
                                        </td>
                                        <td className="px-6 py-4 truncate max-w-[200px]">{defect.defect_reason}</td>
                                        <td className="px-6 py-4 text-right text-red-400 font-medium">{defect.quantity.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right">{defect.amount.toLocaleString()} 원</td>
                                        {activeTab === 'resolved' && (
                                            <td className="px-6 py-4 text-xs">
                                                {defect.resolution_date ? new Date(defect.resolution_date).toLocaleString() : '-'}
                                            </td>
                                        )}
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        setSelectedDefect(defect);
                                                        setShowDetailModal(true);
                                                    }}
                                                    className="p-1 text-blue-400 hover:bg-blue-900/20 rounded"
                                                    title="상세보기/수정"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(defect.id)}
                                                    className="p-1 text-red-400 hover:bg-red-900/20 rounded"
                                                    title="삭제"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <DefectRegistrationModal
                isOpen={showRegModal}
                onClose={() => setShowRegModal(false)}
                onSuccess={() => {
                    setShowRegModal(false);
                    fetchDefects();
                }}
            />

            <DefectDetailModal
                isOpen={showDetailModal}
                onClose={() => {
                    setShowDetailModal(false);
                    setSelectedDefect(null);
                }}
                defect={selectedDefect}
                onSuccess={() => {
                    setShowDetailModal(false);
                    setSelectedDefect(null);
                    fetchDefects();
                }}
            />
        </div>
    );
};

export default QualityPage;
