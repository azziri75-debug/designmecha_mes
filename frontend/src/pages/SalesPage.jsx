import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Plus, Search, FileText, Calendar, DollarSign, User, Package, Save, Download, FileSpreadsheet, Printer, X } from 'lucide-react';
import { cn, getImageUrl } from '../lib/utils';
import FileViewerModal from '../components/FileViewerModal';
import EstimateModal from '../components/EstimateModal';
import OrderModal from '../components/OrderModal';
import EstimateSheetModal from '../components/EstimateSheetModal';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);

const SalesPage = () => {
    const [activeTab, setActiveTab] = useState('estimates'); // 'estimates' | 'orders'
    const [estimates, setEstimates] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [partners, setPartners] = useState([]); // For filters

    // Modal States
    const [showEstimateModal, setShowEstimateModal] = useState(false);
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [editingEstimate, setEditingEstimate] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);

    // Sheet Modal
    const [showSheetModal, setShowSheetModal] = useState(false);
    const [sheetEstimate, setSheetEstimate] = useState(null);

    // Expand States
    const [expandedEstimates, setExpandedEstimates] = useState(new Set());
    const [expandedOrders, setExpandedOrders] = useState(new Set());

    const toggleEstimate = (id) => {
        const newSet = new Set(expandedEstimates);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedEstimates(newSet);
    };

    const toggleOrder = (id) => {
        const newSet = new Set(expandedOrders);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedOrders(newSet);
    };

    // File Viewer
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [viewingTargetId, setViewingTargetId] = useState(null); // Track ID for deletion

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    useEffect(() => {
        fetchPartners();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (activeTab === 'estimates') {
            fetchEstimates();
        } else {
            fetchOrders();
        }
    }, [activeTab, startDate, endDate, statusFilter]);
    // Note: Re-fetching on filter change

    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/');
            setPartners(res.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    const fetchEstimates = async () => {
        setLoading(true);
        try {
            const res = await api.get('/sales/estimates/');
            setEstimates(res.data);
        } catch (error) {
            console.error("Failed to fetch estimates", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (statusFilter) params.status = statusFilter;

            const res = await api.get('/sales/orders/', { params });
            setOrders(res.data);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (estimate) => {
        setEditingEstimate(estimate);
        setShowEstimateModal(true);
    };

    const handleDelete = async (estimateId) => {
        if (!window.confirm("정말로 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/sales/estimates/${estimateId}`);
            alert("삭제되었습니다.");
            fetchEstimates();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패");
        }
    };

    const handleEditOrder = (order) => {
        setEditingOrder(order);
        setShowOrderModal(true);
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm("정말로 삭제하시겠습니까? 관련 생산 계획도 함께 삭제됩니다.")) return;
        try {
            await api.delete(`/sales/orders/${orderId}`);
            alert("삭제되었습니다.");
            fetchOrders();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패");
        }
    };

    const handleExcelExport = async (estimateId) => {
        try {
            // Trigger Excel Generation
            const res = await api.post(`/sales/estimates/${estimateId}/export_excel`);
            const updatedEstimate = res.data;

            // Refresh list to show new attachment
            setEstimates(prev => prev.map(e => e.id === estimateId ? updatedEstimate : e));

            alert("엑셀 파일이 생성되어 첨부파일에 저장되었습니다.");
        } catch (error) {
            console.error("Excel export failed", error);
            alert("엑셀 생성 실패");
        }
    };

    const handleDeleteEstimateAttachment = async (estimateId, indexToRemove) => {
        if (!estimateId) return;
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;

        try {
            const est = estimates.find(e => e.id === estimateId);
            if (!est) return;

            const files = typeof est.attachment_file === 'string' ? JSON.parse(est.attachment_file) : est.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== indexToRemove);

            const res = await api.put(`/sales/estimates/${estimateId}`, {
                attachment_file: newFiles
            });

            const updatedEstimate = res.data;
            setEstimates(prev => prev.map(e => e.id === estimateId ? updatedEstimate : e));

            // Still update viewingFiles if modal is open just in case
            if (viewingTargetId === estimateId) {
                setViewingFiles(newFiles);
                if (newFiles.length === 0) setShowFileModal(false);
            }

            alert("첨부파일이 삭제되었습니다.");
        } catch (error) {
            console.error("Failed to delete attachment", error);
            alert("첨부파일 삭제 실패");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">영업 관리</h1>
                <button
                    onClick={() => activeTab === 'estimates' ? setShowEstimateModal(true) : setShowOrderModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500 text-white font-medium"
                >
                    <Plus className="w-4 h-4" />
                    {activeTab === 'estimates' ? '신규 견적 등록' : '신규 수주 등록'}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700">
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'estimates' ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('estimates')}
                >
                    견적 관리
                    {activeTab === 'estimates' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                    )}
                </button>
                <button
                    className={cn(
                        "px-4 py-2 text-sm font-medium transition-colors relative",
                        activeTab === 'orders' ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                    )}
                    onClick={() => setActiveTab('orders')}
                >
                    수주 관리
                    {activeTab === 'orders' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                    )}
                </button>
            </div>

            {/* Content & Filters */}
            {activeTab === 'orders' && (
                <Card className="p-4 flex flex-wrap gap-4 items-end mb-4">
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
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">상태</label>
                        <select
                            className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">전체 (Status)</option>
                            <option value="PENDING">대기</option>
                            <option value="CONFIRMED">확정</option>
                            <option value="PRODUCTION_COMPLETED">생산 완료</option>
                            <option value="DELIVERY_COMPLETED">납품 완료</option>
                            <option value="CANCELLED">취소</option>
                        </select>
                    </div>
                </Card>
            )}

            <Card className="p-0 overflow-hidden min-h-[500px]">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">로딩 중...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-900/50 text-gray-200 uppercase font-medium">
                                <tr>
                                    <th className="px-6 py-3 w-4"></th> {/* Helper for expansion */}
                                    {activeTab === 'estimates' ? (
                                        <>
                                            <th className="px-6 py-3">견적일자</th>
                                            <th className="px-6 py-3">거래처</th>
                                            <th className="px-6 py-3">총 금액</th>
                                            <th className="px-6 py-3">품목 수</th>
                                            <th className="px-6 py-3">첨부파일 / 엑셀</th>
                                            <th className="px-6 py-3">비고</th>
                                            <th className="px-6 py-3">관리</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-6 py-3">수주번호</th>
                                            <th className="px-6 py-3">수주일자</th>
                                            <th className="px-6 py-3">납기일자</th>
                                            <th className="px-6 py-3">거래처</th>
                                            <th className="px-6 py-3">상태</th>
                                            <th className="px-6 py-3">총 금액</th>
                                            <th className="px-6 py-3">품목 수</th>
                                            <th className="px-6 py-3">비고</th>
                                            <th className="px-6 py-3">관리</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {activeTab === 'estimates' ? (
                                    estimates.map((est) => (
                                        <React.Fragment key={est.id}>
                                            <tr
                                                className="hover:bg-gray-700/50 transition-colors cursor-pointer"
                                                onClick={() => toggleEstimate(est.id)}
                                            >
                                                <td className="px-6 py-4 text-center">
                                                    {expandedEstimates.has(est.id) ? '▼' : '▶'}
                                                </td>
                                                <td className="px-6 py-4">{est.estimate_date}</td>
                                                <td className="px-6 py-4 font-medium text-white">{est.partner?.name}</td>
                                                <td className="px-6 py-4">{est.total_amount?.toLocaleString()} 원</td>
                                                <td className="px-6 py-4">{est.items?.length || 0} 건</td>
                                                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center gap-2">
                                                        {(() => {
                                                            let files = [];
                                                            try {
                                                                if (est.attachment_file) {
                                                                    files = typeof est.attachment_file === 'string' ? JSON.parse(est.attachment_file) : est.attachment_file;
                                                                }
                                                            } catch { files = [] }

                                                            if (Array.isArray(files) && files.length > 0) {
                                                                return (
                                                                    <div className="flex flex-col gap-1">
                                                                        {files.map((file, idx) => (
                                                                            <div key={idx} className="flex items-center gap-2">
                                                                                <a
                                                                                    href={getImageUrl(file.url)}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    download={file.name}
                                                                                    className="text-blue-400 hover:text-blue-300 hover:underline block text-xs truncate max-w-[150px]"
                                                                                    title={`${file.name} - 클릭하여 다운로드`}
                                                                                >
                                                                                    {file.name}
                                                                                </a>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleDeleteEstimateAttachment(est.id, idx);
                                                                                    }}
                                                                                    className="text-red-500 hover:text-red-400 bg-red-900/20 rounded-full p-0.5"
                                                                                    title="파일 삭제"
                                                                                >
                                                                                    <X className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            }
                                                            return <span className="text-gray-600">-</span>;
                                                        })()}

                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleExcelExport(est.id);
                                                            }}
                                                            className="p-1 text-green-500 hover:text-green-400 hover:bg-green-900/20 rounded"
                                                            title="엑셀 생성 및 저장"
                                                        >
                                                            <FileSpreadsheet className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 truncate max-w-[200px]">{est.note}</td>
                                                <td className="px-6 py-4 flex items-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => {
                                                            setSheetEstimate(est);
                                                            setShowSheetModal(true);
                                                        }}
                                                        className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded mr-2"
                                                        title="견적서 인쇄/미리보기"
                                                    >
                                                        <Printer className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEdit(est)}
                                                        className="text-blue-400 hover:underline text-xs mr-3"
                                                    >
                                                        수정
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(est.id)}
                                                        className="text-red-400 hover:underline text-xs"
                                                    >
                                                        삭제
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedEstimates.has(est.id) && (
                                                <tr className="bg-gray-800/50">
                                                    <td colSpan="9" className="px-6 py-4">
                                                        <div className="ml-8 p-4 bg-gray-900 rounded-lg border border-gray-700">
                                                            <h4 className="text-sm font-semibold mb-2 text-gray-300">견적 품목 상세</h4>
                                                            <table className="w-full text-sm text-gray-400">
                                                                <thead>
                                                                    <tr className="border-b border-gray-700">
                                                                        <th className="py-2 text-left">품목명</th>
                                                                        <th className="py-2 text-right">수량</th>
                                                                        <th className="py-2 text-right">단가</th>
                                                                        <th className="py-2 text-right">공급가액</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-800">
                                                                    {est.items?.map((item, idx) => (
                                                                        <tr key={idx}>
                                                                            <td className="py-2">{item.product?.name || item.product_name || item.name}</td>
                                                                            <td className="py-2 text-right">{item.quantity}</td>
                                                                            <td className="py-2 text-right">{item.unit_price?.toLocaleString()}</td>
                                                                            <td className="py-2 text-right">{(item.quantity * item.unit_price)?.toLocaleString()}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                ) : (
                                    orders.map((ord) => (
                                        <React.Fragment key={ord.id}>
                                            <tr
                                                className="hover:bg-gray-700/50 transition-colors cursor-pointer"
                                                onClick={() => toggleOrder(ord.id)}
                                            >
                                                <td className="px-6 py-4 text-center">
                                                    {expandedOrders.has(ord.id) ? '▼' : '▶'}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-xs text-gray-300">{ord.order_no}</td>
                                                <td className="px-6 py-4">{ord.order_date}</td>
                                                <td className="px-6 py-4 text-orange-400">{ord.delivery_date || '-'}</td>
                                                <td className="px-6 py-4 font-medium text-white">{ord.partner?.name}</td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-xs font-medium",
                                                        ord.status === 'PENDING' ? "bg-yellow-900/50 text-yellow-400 border border-yellow-700" :
                                                            ord.status === 'CONFIRMED' ? "bg-blue-900/50 text-blue-400 border border-blue-700" :
                                                                "bg-gray-800 text-gray-400"
                                                    )}>
                                                        {ord.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">{ord.total_amount?.toLocaleString()} 원</td>
                                                <td className="px-6 py-4">{ord.items?.length || 0} 건</td>
                                                <td className="px-6 py-4 truncate max-w-[200px]">{ord.note}</td>
                                                <td className="px-6 py-4 flex items-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleEditOrder(ord)}
                                                        className="text-blue-400 hover:underline text-xs mr-3"
                                                    >
                                                        수정
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteOrder(ord.id)}
                                                        className="text-red-400 hover:underline text-xs"
                                                    >
                                                        삭제
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedOrders.has(ord.id) && (
                                                <tr className="bg-gray-800/50">
                                                    <td colSpan="10" className="px-6 py-4">
                                                        <div className="ml-8 p-4 bg-gray-900 rounded-lg border border-gray-700">
                                                            <h4 className="text-sm font-semibold mb-2 text-gray-300">수주 품목 상세</h4>
                                                            <table className="w-full text-sm text-gray-400">
                                                                <thead>
                                                                    <tr className="border-b border-gray-700">
                                                                        <th className="py-2 text-left">품목명</th>
                                                                        <th className="py-2 text-right">수량</th>
                                                                        <th className="py-2 text-right">단가</th>
                                                                        <th className="py-2 text-right">공급가액</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-800">
                                                                    {ord.items?.map((item, idx) => (
                                                                        <tr key={idx}>
                                                                            <td className="py-2">{item.product?.name || item.product_name || item.name}</td>
                                                                            <td className="py-2 text-right">{item.quantity}</td>
                                                                            <td className="py-2 text-right">{item.unit_price?.toLocaleString()}</td>
                                                                            <td className="py-2 text-right">{(item.quantity * item.unit_price)?.toLocaleString()}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                                {(!loading && ((activeTab === 'estimates' && estimates.length === 0) || (activeTab === 'orders' && orders.length === 0))) && (
                                    <tr>
                                        <td colSpan="10" className="px-6 py-12 text-center text-gray-500">
                                            데이터가 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => {
                    setShowFileModal(false);
                    setViewingTargetId(null);
                }}
                files={viewingFiles}
                onDeleteFile={handleDeleteEstimateAttachment}
            />

            <EstimateModal
                isOpen={showEstimateModal}
                onClose={() => {
                    setShowEstimateModal(false);
                    setEditingEstimate(null);
                }}
                onSuccess={fetchEstimates}
                partners={partners}
                estimateToEdit={editingEstimate}
            />

            <OrderModal
                isOpen={showOrderModal}
                onClose={() => {
                    setShowOrderModal(false);
                    setEditingOrder(null);
                }}
                onSuccess={fetchOrders}
                partners={partners}
                orderToEdit={editingOrder}
            />

            <EstimateSheetModal
                isOpen={showSheetModal}
                onClose={() => {
                    setShowSheetModal(false);
                    setSheetEstimate(null);
                }}
                estimate={sheetEstimate}
                onSave={fetchEstimates}
            />
        </div>
    );
};

export default SalesPage;
