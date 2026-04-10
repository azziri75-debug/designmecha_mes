import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Tabs, Tab, IconButton, Collapse, CircularProgress } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, CheckCircle as CheckIcon, Print as PrintIcon, Description as DescIcon } from '@mui/icons-material';
import { X, FileText, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';
import ProductionPlanModal from '../components/ProductionPlanModal';
import ProductionSheetModal from '../components/ProductionSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';
import ResizableTable from '../components/ResizableTable';
import { formatCurrency } from '../utils/currency';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);

const UNPLANNED_COLS = [
    { key: 'no', label: '수주/재고번호', width: 150 },
    { key: 'partner', label: '거래처', width: 150 },
    { key: 'product', label: '품명', width: 250 },
    { key: 'date', label: '등록일', width: 120 },
    { key: 'delivery', label: '납기일', width: 120 },
    { key: 'note', label: '비고', width: 150 },
    { key: 'amount', label: '금액', width: 120 },
    { key: 'action', label: '작업', width: 120, noResize: true },
];

const PLAN_COLS = [
    { key: 'arrow', label: '', width: 50, noResize: true },
    { key: 'no', label: '수주/재고번호', width: 200 },
    { key: 'partner', label: '거래처', width: 130 },
    { key: 'product', label: '품명', width: 250 },
    { key: 'delivery', label: '납기일', width: 100 },
    { key: 'end_date', label: '생산완료일', width: 110 },
    { key: 'amount', label: '금액', width: 100 },
    { key: 'note', label: '비고', width: 150 },
    { key: 'status', label: '상태', width: 100 },
    { key: 'defect', label: '불량', width: 50 },
    { key: 'processCount', label: '공정수', width: 70 },
    { key: 'cost', label: '총 공정 비용', width: 110 },
    { key: 'attach', label: '첨부파일', width: 70 },
    { key: 'manage', label: '관리', width: 180, noResize: true },
];

const ProductionPage = () => {
    const [tabIndex, setTabIndex] = useState(0);
    const [orders, setOrders] = useState([]);
    const [stockProductions, setStockProductions] = useState([]);
    const [plans, setPlans] = useState([]);
    const [allPlannedIds, setAllPlannedIds] = useState(null);

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedStockProduction, setSelectedStockProduction] = useState(null);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [partners, setPartners] = useState([]);

    // Filters
    const [filterPartner, setFilterPartner] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMajorGroupId, setSelectedMajorGroupId] = useState('');
    const [groups, setGroups] = useState([]);
    const [defects, setDefects] = useState([]);

    // Defect Modal
    const [defectModalOpen, setDefectModalOpen] = useState(false);
    const [selectedDefects, setSelectedDefects] = useState([]);

    // Sheet Modal State
    const [sheetModalOpen, setSheetModalOpen] = useState(false);
    const [sheetPlan, setSheetPlan] = useState(null);
    const [sheetType, setSheetType] = useState('PRODUCTION');

    // File viewer modal
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [viewingFileTitle, setViewingFileTitle] = useState('');
    const [onDeleteFile, setOnDeleteFile] = useState(null);

    // View Item Modals
    const [viewOrderOpen, setViewOrderOpen] = useState(false);
    const [viewStockOpen, setViewStockOpen] = useState(false);
    const [itemToView, setItemToView] = useState(null);

    const fetchOrders = async () => {
        try {
            const params = {};
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;
            const response = await api.get('/sales/orders/', { params });
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        }
    };

    const fetchPlans = async () => {
        try {
            const params = {};
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;
            if (filterPartner !== 'all' && filterPartner !== 'internal') {
                params.partner_id = filterPartner;
            }
            if (searchQuery) params.product_name = searchQuery;
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;

            const response = await api.get('/production/plans/', { params });
            setPlans(response.data);

            if (!selectedMajorGroupId && !searchQuery && !startDate && !endDate && filterPartner === 'all') {
                setAllPlannedIds({
                    orders: response.data.map(p => p.order_id).filter(id => id != null),
                    stocks: response.data.map(p => p.stock_production_id).filter(id => id != null)
                });
            }
        } catch (error) {
            console.error("Failed to fetch plans", error);
        }
    };

    const fetchAllPlannedIds = async () => {
        try {
            const response = await api.get('/production/plans/', { params: { limit: 2000 } });
            setAllPlannedIds({
                orders: response.data.map(p => p.order_id).filter(id => id != null),
                stocks: response.data.map(p => p.stock_production_id).filter(id => id != null)
            });
        } catch (error) {
            console.error("Failed to fetch all planned IDs", error);
        }
    };

    const fetchStockProductions = async () => {
        try {
            const params = { status: 'PENDING' };
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;
            const response = await api.get('/inventory/productions', { params });
            setStockProductions(response.data);
        } catch (error) {
            console.error("Failed to fetch stock productions", error);
        }
    };

    const fetchDefects = async () => {
        try {
            const response = await api.get('/quality/defects/');
            setDefects(response.data);
        } catch (error) {
            console.error("Failed to fetch defects", error);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await api.get('/product/groups/');
            setGroups(res.data || []);
        } catch (error) {
            console.error("Failed to fetch groups", error);
        }
    };

    const fetchPartners = async () => {
        try {
            const response = await api.get('/basics/partners/', { params: { type: 'CUSTOMER' } });
            setPartners(response.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchStockProductions();
        fetchPartners();
        fetchDefects();
        fetchGroups();
        fetchAllPlannedIds();
    }, []);

    useEffect(() => {
        fetchPlans();
        fetchOrders();
        fetchStockProductions();
    }, [startDate, endDate, filterPartner, searchQuery, selectedMajorGroupId]);

    const handleCreateClick = (order, stockProd = null) => {
        setSelectedOrder(order);
        setSelectedStockProduction(stockProd);
        setSelectedPlan(null);
        setModalOpen(true);
    };

    const handleEditClick = (plan) => {
        setSelectedPlan(plan);
        setSelectedOrder(null);
        setSelectedStockProduction(null);
        setModalOpen(true);
    };

    const handleDeletePlan = async (planId) => {
        const plan = plans.find(p => p.id === planId);
        if (plan && plan.status === 'COMPLETED') {
            if (!window.confirm("생산 완료된 내역입니다. 삭제 시 완제품 재고가 차감되고 연계 발주가 '대기'로 복원됩니다. 계속하시겠습니까?")) return;
        } else {
            if (!window.confirm("정말로 이 생산 계획을 삭제하시겠습니까? 관련 수주는 대기 상태로 복원됩니다.")) return;
        }

        const deleteRelated = window.confirm(
            "연관된 자재발주/외주발주 내역이 있을 수 있습니다.\n\n" +
            "[확인] → 연관 발주 내역도 함께 삭제\n" +
            "[취소] → 생산 계획만 삭제 (발주 내역 유지)"
        );

        try {
            await api.delete(`/production/plans/${planId}?delete_related_orders=${deleteRelated}`);
            alert("삭제되었습니다.");
            fetchPlans();
            fetchOrders();
            fetchAllPlannedIds();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleConfirmPlan = async (planId) => {
        if (!window.confirm("생산 계획을 확정하시겠습니까? 확정 시 자동으로 자재 소요량(MRP)이 산출되고 미발주 목록에 등록됩니다.")) return;
        try {
            await api.patch(`/production/plans/${planId}/status?status=CONFIRMED`);
            alert("계획이 확정되었습니다. 자재구매관리에서 MRP 리스트를 확인해 주세요.");
            fetchPlans();
        } catch (error) {
            console.error("Confirm failed", error);
            alert("확정 처리 실패");
        }
    };

    const handleCompletePlan = async (planId) => {
        const plan = plans.find(p => p.id === planId);
        if (!plan) return;

        let hasIncompleteDependencies = false;
        let warningMessage = "";

        if (plan.items) {
            for (const item of plan.items) {
                if (item.purchase_items && item.purchase_items.length > 0) {
                    const incompletePurchase = item.purchase_items.some(pi => pi.purchase_order?.status !== 'COMPLETED' && pi.purchase_order?.status !== 'PARTIAL');
                    if (incompletePurchase) {
                        hasIncompleteDependencies = true;
                        warningMessage += `- [구매] ${item.product?.name || '품목'}의 자재 발주가 완료되지 않았습니다.\n`;
                    }
                }
                if (item.outsourcing_items && item.outsourcing_items.length > 0) {
                    const incompleteOutsourcing = item.outsourcing_items.some(oi => oi.outsourcing_order?.status !== 'COMPLETED');
                    if (incompleteOutsourcing) {
                        hasIncompleteDependencies = true;
                        warningMessage += `- [외주] ${item.product?.name || '품목'}의 외주 발주가 완료되지 않았습니다.\n`;
                    }
                }
            }
        }

        let confirmMessage = "이 계획을 '완료' 처리하시겠습니까?";
        if (hasIncompleteDependencies) {
            confirmMessage = "다음 항목의 발주/외주가 완료되지 않았습니다:\n\n" + warningMessage + "\n그래도 완료하시겠습니까?";
        }

        if (!window.confirm(confirmMessage)) return;

        try {
            await api.patch(`/production/plans/${planId}/status?status=COMPLETED`);
            alert("완료 처리되었습니다.");
            fetchPlans();
        } catch (error) {
            console.error("Complete failed", error);
            alert("완료 처리 실패");
        }
    };

    const handleDeleteAttachment = async (plan, idxToRemove) => {
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;
        try {
            const files = safeParseJSON(plan.attachment_file, []);
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== idxToRemove);
            await api.put(`/production/plans/${plan.id}`, { attachment_file: newFiles });
            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);
            alert("첨부파일이 삭제되었습니다.");
            fetchPlans();
        } catch (e) {
            console.error("Delete attachment failed", e);
            alert("첨부파일 삭제 실패");
        }
    };

    const handlePrintClick = (plan, type = 'PRODUCTION') => {
        setSheetPlan(plan);
        setSheetType(type);
        setSheetModalOpen(true);
    };

    const handleSuccess = () => {
        fetchOrders();
        fetchStockProductions();
        fetchPlans();
        fetchAllPlannedIds();
        if (tabIndex === 0) setTabIndex(1);
    };

    const handleTabChange = (event, newValue) => {
        setTabIndex(newValue);
    };

    const filterData = (p) => {
        if (filterPartner !== 'all') {
            if (filterPartner === 'internal') {
                if (p.order_id) return false;
            } else {
                if (p.order?.partner_id !== parseInt(filterPartner)) return false;
            }
        }
        if (startDate && p.plan_date < startDate) return false;
        if (endDate && p.plan_date > endDate) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const orderNo = (p.order?.order_no || '').toLowerCase();
            const prodNo = (p.stock_production?.production_no || '').toLowerCase();
            const partnerName = (p.order?.partner?.name || '').toLowerCase();
            const hasMatchingProduct = (p.items || []).some(item =>
                (item.product?.name || '').toLowerCase().includes(q) ||
                (item.product?.specification || '').toLowerCase().includes(q)
            );
            if (!orderNo.includes(q) && !prodNo.includes(q) && !partnerName.includes(q) && !hasMatchingProduct) return false;
        }
        return true;
    };

    const inProgressPlans = plans.filter(p => p.status !== 'COMPLETED' && p.status !== 'CANCELED' && filterData(p));
    const completedPlans = plans.filter(p => p.status === 'COMPLETED' && filterData(p));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center no-print">
                <h1 className="text-2xl font-bold text-white">생산 관리</h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700 print-safe-area">
                {['생산 대기 수주', '생산현황', '생산 완료'].map((label, index) => (
                    <button
                        key={index}
                        className={cn(
                            "px-4 py-2 text-sm font-medium transition-colors relative",
                            tabIndex === index ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                        )}
                        onClick={() => handleTabChange(null, index)}
                    >
                        {label}
                        {tabIndex === index && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                        )}
                    </button>
                ))}
            </div>

            {/* Content & Filters */}
            <Card className="p-4 flex flex-wrap gap-4 items-end mb-4 print-safe-area">
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">시작일</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]" />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">종료일</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]" />
                </div>
                
                <div className="flex-1 min-w-[150px] space-y-1">
                    <label className="text-xs text-gray-400">사업부</label>
                    <Select
                        isClearable
                        placeholder="전체 사업부"
                        options={groups.filter(g => g.type === 'MAJOR').map(g => ({ value: g.id.toString(), label: g.name }))}
                        value={groups.find(g => g.id.toString() === selectedMajorGroupId) ? { value: selectedMajorGroupId, label: groups.find(g => g.id.toString() === selectedMajorGroupId).name } : null}
                        onChange={(opt) => setSelectedMajorGroupId(opt ? opt.value : '')}
                        styles={{
                            control: (base) => ({ ...base, backgroundColor: '#374151', borderColor: '#4b5563', color: 'white', fontSize: '0.875rem' }),
                            input: (base) => ({ ...base, color: 'white' }),
                            placeholder: (base) => ({ ...base, color: '#9ca3af' }),
                            menu: (base) => ({ ...base, backgroundColor: '#1f2937', color: 'white', zIndex: 99 }),
                            option: (base, state) => ({ ...base, backgroundColor: state.isFocused ? '#374151' : 'transparent', color: 'white' }),
                            singleValue: (base) => ({ ...base, color: 'white' })
                        }}
                    />
                </div>

                <div className="flex-1 min-w-[200px] space-y-1">
                    <label className="text-xs text-gray-400">거래처</label>
                    <Select
                        isClearable
                        placeholder="전체 거래처"
                        options={[
                            { value: 'all', label: '전체 거래처' },
                            { value: 'internal', label: '사내(재고)' },
                            ...partners.map(p => ({ value: p.id.toString(), label: p.name }))
                        ]}
                        value={filterPartner === 'all' ? { value: 'all', label: '전체 거래처' } : filterPartner === 'internal' ? { value: 'internal', label: '사내(재고)' } : partners.find(p => p.id.toString() === filterPartner) ? { value: filterPartner, label: partners.find(p => p.id.toString() === filterPartner).name } : null}
                        onChange={(opt) => setFilterPartner(opt ? opt.value : 'all')}
                        styles={{
                            control: (base) => ({ ...base, backgroundColor: '#374151', borderColor: '#4b5563', color: 'white', fontSize: '0.875rem' }),
                            input: (base) => ({ ...base, color: 'white' }),
                            placeholder: (base) => ({ ...base, color: '#9ca3af' }),
                            menu: (base) => ({ ...base, backgroundColor: '#1f2937', color: 'white', zIndex: 99 }),
                            option: (base, state) => ({ ...base, backgroundColor: state.isFocused ? '#374151' : 'transparent', color: 'white' }),
                            singleValue: (base) => ({ ...base, color: 'white' })
                        }}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-400">품명/품번</label>
                    <div className="relative">
                        <input type="text" placeholder="검색어 입력..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-[200px] bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]" />
                    </div>
                </div>

                <button
                    onClick={() => { setStartDate(''); setEndDate(''); setFilterPartner('all'); setSearchQuery(''); setSelectedMajorGroupId(''); }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm h-[38px] transition-colors font-medium border border-gray-600"
                >
                    초기화
                </button>
            </Card>

            <Card className="p-0 overflow-hidden min-h-[500px]">
                <div className="overflow-x-auto">
                    {tabIndex === 0 && (
                        <UnplannedOrdersTable
                            orders={orders}
                            stockProductions={stockProductions}
                            plannedIds={allPlannedIds}
                            onCreatePlan={handleCreateClick}
                            searchQuery={searchQuery}
                            filterPartner={filterPartner}
                        />
                    )}
                    {tabIndex === 1 && (
                        <ProductionPlansTable
                            plans={inProgressPlans}
                            defects={defects}
                            onEdit={handleEditClick}
                            onDelete={handleDeletePlan}
                            onComplete={handleCompletePlan}
                            onConfirm={handleConfirmPlan}
                            onPrint={handlePrintClick}
                            onOpenFiles={(files, plan) => {
                                setViewingFiles(files);
                                setViewingFileTitle(plan?.order?.order_no || '첨부 파일');
                                setOnDeleteFile(() => (idx) => handleDeleteAttachment(plan, idx));
                                setShowFileModal(true);
                            }}
                            onOpenProcessFiles={(files, title) => {
                                setViewingFiles(files);
                                setViewingFileTitle(title);
                                setOnDeleteFile(null);
                                setShowFileModal(true);
                            }}
                            onShowDefects={(d) => {
                                setSelectedDefects(d);
                                setDefectModalOpen(true);
                            }}
                            onRefresh={fetchPlans}
                        />
                    )}
                    {tabIndex === 2 && (
                        <ProductionPlansTable
                            plans={completedPlans}
                            defects={defects}
                            onEdit={handleEditClick}
                            onDelete={handleDeletePlan}
                            onPrint={handlePrintClick}
                            onOpenFiles={(files, plan) => {
                                setViewingFiles(files);
                                setViewingFileTitle(plan?.order?.order_no || '첨부 파일');
                                setOnDeleteFile(() => (idx) => handleDeleteAttachment(plan, idx));
                                setShowFileModal(true);
                            }}
                            onOpenProcessFiles={(files, title) => {
                                setViewingFiles(files);
                                setViewingFileTitle(title);
                                setOnDeleteFile(null);
                                setShowFileModal(true);
                            }}
                            onShowDefects={(d) => {
                                setSelectedDefects(d);
                                setDefectModalOpen(true);
                            }}
                            onRefresh={fetchPlans}
                            readonly={true}
                        />
                    )}
                </div>
            </Card>

            <ProductionPlanModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSuccess={handleSuccess} order={selectedOrder} stockProduction={selectedStockProduction} plan={selectedPlan} />
            <ProductionSheetModal isOpen={sheetModalOpen} onClose={() => setSheetModalOpen(false)} plan={sheetPlan} sheetType={sheetType} onSave={fetchPlans} />
            <FileViewerModal isOpen={showFileModal} onClose={() => setShowFileModal(false)} files={viewingFiles} title={viewingFileTitle} onDeleteFile={onDeleteFile} />
            <DefectInfoModal isOpen={defectModalOpen} onClose={() => setDefectModalOpen(false)} defects={selectedDefects} />
        </div>
    );
};

const DefectInfoModal = ({ isOpen, onClose, defects }) => {
    if (!defects || defects.length === 0) return null;
    return (
        <FileViewerModal isOpen={isOpen} onClose={onClose} title="불량 발생 내역" files={[]}>
            <Box sx={{ p: 2, minWidth: 400 }}>
                <Typography variant="h6" color="error" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AlertCircle /> 불량 내역 ({defects.length}건)
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#fff5f5', '& th': { fontWeight: 'bold' } }}>
                            <TableRow>
                                <TableCell>발생일</TableCell>
                                <TableCell>사유</TableCell>
                                <TableCell align="right">수량</TableCell>
                                <TableCell align="right">손실 비용</TableCell>
                                <TableCell>상태</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {defects.map(d => (
                                <TableRow key={d.id}>
                                    <TableCell>{new Date(d.defect_date).toLocaleDateString()}</TableCell>
                                    <TableCell>{d.defect_reason}</TableCell>
                                    <TableCell align="right">{d.quantity} EA</TableCell>
                                    <TableCell align="right" sx={{ color: '#d32f2f' }}>{formatCurrency(d.amount, 'KRW')}</TableCell>
                                    <TableCell><Chip label={d.status} size="small" color={d.status === 'RESOLVED' ? 'success' : 'error'} variant="outlined" /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose} variant="outlined">닫기</Button>
                </Box>
            </Box>
        </FileViewerModal>
    );
};

const UnplannedOrdersTable = ({ orders, stockProductions, plannedIds, onCreatePlan, searchQuery, filterPartner }) => {
    const planOrderIds = plannedIds?.orders || [];
    const planStockProdIds = plannedIds?.stocks || [];

    let unplannedOrders = orders.filter(o => !planOrderIds.includes(o.id) && (o.status === 'PENDING' || o.status === 'CONFIRMED'));
    let unplannedStockProductions = stockProductions.filter(sp => !planStockProdIds.includes(sp.id));

    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        unplannedOrders = unplannedOrders.filter(o => o.order_no?.toLowerCase().includes(query) || o.partner?.name?.toLowerCase().includes(query) || o.items?.some(it => it.product?.name?.toLowerCase().includes(query)));
        unplannedStockProductions = unplannedStockProductions.filter(sp => sp.production_no?.toLowerCase().includes(query) || sp.product?.name?.toLowerCase().includes(query));
    }

    if (filterPartner !== 'all') {
        if (filterPartner === 'internal') { unplannedOrders = []; }
        else { unplannedOrders = unplannedOrders.filter(o => o.partner_id === parseInt(filterPartner)); unplannedStockProductions = []; }
    }

    if (!plannedIds) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}><CircularProgress /></Box>;

    return (
        <ResizableTable columns={UNPLANNED_COLS} className="w-full text-left text-sm" theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700" thClassName="px-4 py-3">
            {unplannedOrders.length === 0 && unplannedStockProductions.length === 0 ? (
                <tr><td colSpan={UNPLANNED_COLS.length} className="px-4 py-8 text-center text-gray-500">데이터가 없습니다.</td></tr>
            ) : (
                <>
                    {unplannedOrders.map(order => <UnplannedOrderRow key={`order-${order.id}`} order={order} onCreatePlan={onCreatePlan} />)}
                    {unplannedStockProductions.map(sp => <UnplannedStockProductionRow key={`sp-${sp.id}`} stockProduction={sp} onCreatePlan={onCreatePlan} />)}
                </>
            )}
        </ResizableTable>
    );
};

const UnplannedOrderRow = ({ order, onCreatePlan }) => {
    const [open, setOpen] = useState(false);
    return (
        <React.Fragment>
            <tr className="hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300" onClick={() => setOpen(!open)} onDoubleClick={() => onCreatePlan(order)}>
                <td className="px-4 py-4 truncate"><Chip label="수주" size="small" variant="outlined" sx={{ mr: 1, height: 20 }} />{order.order_no}</td>
                <td className="px-4 py-4 truncate">{order.partner?.name}</td>
                <td className="px-4 py-4 truncate">{order.items?.[0]?.product?.name}{order.items?.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}</td>
                <td className="px-4 py-4 whitespace-nowrap">{order.order_date}</td>
                <td className="px-4 py-4 whitespace-nowrap text-orange-600">{order.delivery_date}</td>
                <td className="px-4 py-4 truncate">{order.note || '-'}</td>
                <td className="px-4 py-4 whitespace-nowrap text-right">{formatCurrency(order.total_amount, order.items?.[0]?.currency || 'KRW')}</td>
                <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}><Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => onCreatePlan(order)}>계획</Button></td>
            </tr>
            {open && (
                <tr className="bg-gray-800/50">
                    <td colSpan={UNPLANNED_COLS.length} className="p-0 border-none">
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 mx-4 my-2">
                                <h4 className="text-sm font-semibold mb-2 text-gray-300">수주 품목 목록</h4>
                                <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded-md">
                                    <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                        <tr><th className="px-4 py-2">품명</th><th className="px-4 py-2">규격</th><th className="px-4 py-2 text-right">수량</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {order.items?.map(it => <tr key={it.id} className="hover:bg-gray-800/40"><td className="px-4 py-2">{it.product?.name}</td><td className="px-4 py-2">{it.product?.specification}</td><td className="px-4 py-2 text-right">{it.quantity}</td></tr>)}
                                    </tbody>
                                </table>
                            </div>
                        </Collapse>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

const UnplannedStockProductionRow = ({ stockProduction, onCreatePlan }) => {
    const [open, setOpen] = useState(false);
    return (
        <React.Fragment>
            <tr className="hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300" onClick={() => setOpen(!open)} onDoubleClick={() => onCreatePlan(null, stockProduction)}>
                <td className="px-4 py-4 truncate"><Chip label="재고" size="small" sx={{ mr: 1, height: 20, bgcolor: '#fff3e0', color: '#e65100', fontWeight: 'bold' }} />{stockProduction.production_no}</td>
                <td className="px-4 py-4 truncate">{stockProduction.partner?.name || '사내'}</td>
                <td className="px-4 py-4 truncate">{stockProduction.product?.name}</td>
                <td className="px-4 py-4 whitespace-nowrap">{stockProduction.request_date}</td>
                <td className="px-4 py-4 whitespace-nowrap text-orange-600">{stockProduction.target_date || '-'}</td>
                <td className="px-4 py-4 truncate">{stockProduction.note || '-'}</td>
                <td className="px-4 py-4 text-right">-</td>
                <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}><Button variant="outlined" color="success" size="small" startIcon={<AddIcon />} onClick={() => onCreatePlan(null, stockProduction)}>계획</Button></td>
            </tr>
            {open && (
                <tr className="bg-gray-800/50">
                    <td colSpan={UNPLANNED_COLS.length} className="p-0 border-none">
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 mx-4 my-2">
                                <h4 className="text-sm font-semibold mb-2 text-gray-300">재고 생산 제품 상세</h4>
                                <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded-md">
                                    <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                        <tr><th className="px-4 py-2">품명</th><th className="px-4 py-2">규격</th><th className="px-4 py-2 text-right">수량</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        <tr className="hover:bg-gray-800/40">
                                            <td className="px-4 py-2">{stockProduction.product?.name}</td>
                                            <td className="px-4 py-2">{stockProduction.product?.specification}</td>
                                            <td className="px-4 py-2 text-right">{stockProduction.quantity}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </Collapse>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

const ProductionPlansTable = ({ plans, defects, onEdit, onDelete, onComplete, onConfirm, onPrint, onOpenFiles, onOpenProcessFiles, onShowDefects, onRefresh, readonly }) => {
    const [managedCols, setManagedCols] = useState(PLAN_COLS);
    return (
        <ResizableTable columns={managedCols} className="w-full text-left text-sm" theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700" thClassName="px-4 py-3" onResizeEnd={({ leftKey, newLeft, rightKey, newRight }) => {
            setManagedCols(prev => prev.map(col => { if (col.key === leftKey) return { ...col, width: newLeft }; if (col.key === rightKey) return { ...col, width: newRight }; return col; }));
        }}>
            {plans.length === 0 ? (
                <tr><td colSpan={PLAN_COLS.length} className="px-4 py-12 text-center text-gray-500">데이터가 없습니다.</td></tr>
            ) : (
                plans.map(plan => (
                    <Row key={plan.id} plan={plan} defects={defects?.filter(d => d.plan_id === plan.id)} onEdit={onEdit} onDelete={onDelete} onComplete={onComplete} onConfirm={onConfirm} onPrint={onPrint} onOpenFiles={onOpenFiles} onOpenProcessFiles={onOpenProcessFiles} onShowDefects={onShowDefects} onRefresh={onRefresh} readonly={readonly} />
                ))
            )}
        </ResizableTable>
    );
};

const Row = ({ plan, defects, onEdit, onDelete, onComplete, onConfirm, onPrint, onOpenFiles, onOpenProcessFiles, onShowDefects, onRefresh, readonly }) => {
    const [open, setOpen] = useState(false);
    const order = plan.order;
    const sp = plan.stock_production;

    const groupedItems = plan.items?.reduce((acc, item) => {
        if (!acc[item.product_id]) {
            acc[item.product_id] = { product_name: item.product?.name || item.product_id, product_spec: item.product?.specification || "", product_unit: item.product?.unit || "EA", items: [] };
        }
        acc[item.product_id].items.push(item);
        return acc;
    }, {}) || {};

    const typeMap = { 'INTERNAL': '사내', 'PURCHASE': '구매', 'OUTSOURCING': '외주' };

    return (
        <React.Fragment>
            <tr className={cn("hover:bg-gray-800/40 transition-colors select-none divide-x divide-gray-700/30 text-gray-300 cursor-pointer", open && "bg-gray-800/30")} onClick={() => setOpen(!open)} onDoubleClick={() => onEdit(plan)}>
                <td className="px-4 py-4 text-center"><IconButton size="small" sx={{ color: 'text.secondary' }} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? <KeyboardArrowUp sx={{ fontSize: 18 }} /> : <KeyboardArrowDown sx={{ fontSize: 18 }} />}</IconButton></td>
                <td className="px-4 py-4 truncate">
                    {order ? <div className="flex items-center gap-1"><Chip label="수주" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#e3f2fd' }} />{order.order_no}</div> :
                        sp ? <div className="flex items-center gap-1"><Chip label="재고" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#fff3e0', color: '#e65100', fontWeight: 'bold' }} />{sp.production_no || `Stock-${sp.id}`}</div> : '-'}
                </td>
                <td className="px-4 py-4 truncate">{plan.order?.partner?.name || plan.stock_production?.partner?.name || '사내'}</td>
                <td className="px-4 py-4 truncate">
                    {(() => {
                        const names = [...new Set(plan.items?.map(it => it.product?.name || it.product_name))];
                        return names.length > 1 ? `${names[0]} 외 ${names.length - 1}건` : names[0] || '';
                    })()}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-orange-600 font-medium">{order?.delivery_date || '-'}</td>
                <td className="px-4 py-4 whitespace-nowrap">
                    {plan.status === 'COMPLETED' ? (
                        plan.actual_completion_date
                            ? <span className="text-emerald-400">{plan.actual_completion_date}</span>
                            : plan.updated_at
                                ? <span className="text-gray-400 text-xs" title="수정일 기준(완료일 미기록)">{plan.updated_at.split('T')[0]}*</span>
                                : <span className="text-gray-600">-</span>
                    ) : '-'}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-right">{formatCurrency(order?.total_amount || 0, (() => { const cur = order?.items?.find(it => it.currency && it.currency !== 'KRW')?.currency; return cur || order?.items?.[0]?.currency || 'KRW'; })())}</td>
                <td className="px-4 py-4 truncate max-w-[150px]">{order?.note || sp?.note || '-'}</td>
                <td className="px-4 py-4 text-center"><Chip label={plan.status} size="small" color={plan.status === 'COMPLETED' ? "success" : plan.status === 'CONFIRMED' ? "secondary" : "primary"} /></td>
                <td className="px-4 py-4 text-center">{defects?.length > 0 && <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onShowDefects(defects); }}><AlertCircle className="w-5 h-5" /></IconButton>}</td>
                <td className="px-4 py-4 text-center">{plan.items?.length || 0}</td>
                <td className="px-4 py-4 text-right font-bold text-emerald-400">{formatCurrency(plan.items?.reduce((sum, item) => sum + (item.cost || 0), 0) || 0, 'KRW')}</td>
                <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    {safeParseJSON(plan.attachment_file, []).length > 0 && <IconButton size="small" color="primary" onClick={() => onOpenFiles(safeParseJSON(plan.attachment_file, []), plan)}><FileText className="w-4 h-4" /></IconButton>}
                </td>
                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                        {plan.status !== 'COMPLETED' && !readonly ? (
                            <>
                                <IconButton size="small" color="info" onClick={() => onPrint(plan, 'PRODUCTION')}><PrintIcon fontSize="small" /></IconButton>
                                <IconButton size="small" color="primary" onClick={() => onEdit(plan)}><EditIcon fontSize="small" /></IconButton>
                                <IconButton size="small" color="error" onClick={() => onDelete(plan.id)}><DeleteIcon fontSize="small" /></IconButton>
                                {plan.status === 'PLANNED' && <IconButton size="small" color="secondary" onClick={() => onConfirm(plan.id)}><CheckIcon fontSize="small" /></IconButton>}
                                <IconButton size="small" color="success" onClick={() => onComplete(plan.id)}><CheckIcon fontSize="small" /></IconButton>
                            </>
                        ) : (
                            <IconButton size="small" color="error" onClick={() => onDelete(plan.id)}><DeleteIcon fontSize="small" /></IconButton>
                        )}
                    </div>
                </td>
            </tr>
            {open && (
                <tr className="bg-gray-800/50">
                    <td colSpan={PLAN_COLS.length} className="p-0 border-none">
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <div className="p-4 mx-4 my-2">
                                {Object.entries(groupedItems).map(([productId, group]) => (
                                    <div key={productId} className="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                                        <div className="mb-3 flex flex-wrap gap-4 items-center font-bold text-xs text-blue-400">
                                            <span>품명: {group.product_name}</span><span>수량: {group.items[0]?.quantity}</span>
                                        </div>
                                        <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded-md">
                                            <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                                <tr>
                                                    <th className="px-3 py-2">순번</th>
                                                    <th className="px-3 py-2">공정명</th>
                                                    <th className="px-3 py-2">구분</th>
                                                    <th className="px-3 py-2">담당</th>
                                                    <th className="px-3 py-2">배정 장비</th>
                                                    <th className="px-3 py-2">작업내용</th>
                                                    <th className="px-3 py-2">시작일</th>
                                                    <th className="px-3 py-2">종료일</th>
                                                    <th className="px-3 py-2 text-right">공정비용</th>
                                                    <th className="px-3 py-2 text-right">수량</th>
                                                    <th className="px-3 py-2">상태</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800">
                                                {group.items.sort((a, b) => a.sequence - b.sequence).map(item => (
                                                    <ProcessRow key={item.id} item={item} defects={defects} typeMap={typeMap} onShowDefects={onShowDefects} onRefresh={onRefresh} onOpenProcessFiles={onOpenProcessFiles} />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        </Collapse>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

const ProcessRow = ({ item, defects, typeMap, onShowDefects, onRefresh, onOpenProcessFiles }) => {
    const [open, setOpen] = useState(false);
    return (
        <React.Fragment>
            <tr className="hover:bg-gray-800/40 transition-colors select-none text-gray-300 cursor-pointer" onClick={() => setOpen(!open)}>
                <td className="px-3 py-3 text-center text-gray-400">{item.sequence}</td>
                <td className="px-3 py-3 font-medium">{item.process_name}</td>
                <td className="px-3 py-3">
                    {item.course_type === 'INTERNAL' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">사내</span>
                    )}
                    {item.course_type === 'OUTSOURCING' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">외주</span>
                    )}
                    {item.course_type === 'PURCHASE' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">구매</span>
                    )}
                    {!['INTERNAL','OUTSOURCING','PURCHASE'].includes(item.course_type) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-600/40 text-gray-300 border border-gray-500/40">{item.course_type}</span>
                    )}
                </td>
                <td className="px-3 py-3 text-gray-400">{item.course_type === 'INTERNAL' ? (item.worker?.name || '-') : (item.partner_name || '-')}</td>
                <td className="px-3 py-3 text-gray-400">{item.equipment?.name || '-'}</td>
                <td className="px-3 py-3 text-gray-400 max-w-[120px] truncate">{item.note || '-'}</td>
                <td className="px-3 py-3 text-gray-400 whitespace-nowrap">{item.start_date || '-'}</td>
                <td className="px-3 py-3 text-gray-400 whitespace-nowrap">{item.end_date || '-'}</td>
                <td className="px-3 py-3 text-right font-bold text-emerald-400">{item.cost ? item.cost.toLocaleString() + '원' : '-'}</td>
                <td className="px-3 py-3 text-right">{item.quantity ?? '-'}</td>
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <select value={item.status} onChange={async (e) => {
                        try { await api.patch(`/production/plan-items/${item.id}`, { status: e.target.value }); onRefresh(); } catch (err) { alert("오류 발생"); }
                    }} className="text-xs p-1 border border-gray-700 bg-gray-800 text-gray-200 rounded">
                        <option value="PLANNED">계획</option><option value="IN_PROGRESS">진행중</option><option value="COMPLETED">완료</option>
                    </select>
                </td>
            </tr>
            {open && (
                <tr className="bg-gray-900/50">
                    <td colSpan={11} className="p-0 border-none">
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <div className="p-3 mx-4 my-2 border border-gray-700 bg-gray-800 rounded-md">
                                <h4 className="text-[11px] font-semibold mb-2 text-gray-400">작업 로그</h4>
                                <table className="w-full text-[10px] text-gray-300 border border-gray-700 rounded-md overflow-hidden bg-gray-900">
                                    <tbody className="divide-y divide-gray-800">
                                        {item.work_log_items?.length > 0 ? (
                                            item.work_log_items.map(log => 
                                                <tr key={log.id} className="hover:bg-gray-800/40">
                                                    <td className="px-2 py-1">{log.work_log?.work_date}</td>
                                                    <td className="px-2 py-1">{log.worker?.name}</td>
                                                    <td className="px-2 py-1 text-right">{log.good_quantity} EA</td>
                                                    <td className="px-2 py-1">{log.note}</td>
                                                </tr>
                                            )
                                        ) : (
                                            <tr><td colSpan={4} className="px-2 py-2 text-center text-gray-500">로그가 없습니다.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Collapse>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

export default ProductionPage;
