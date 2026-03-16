import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Tabs, Tab, IconButton, Collapse } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, CheckCircle as CheckIcon, Print as PrintIcon, Description as DescIcon } from '@mui/icons-material';
import { X, FileText, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import ProductionPlanModal from '../components/ProductionPlanModal';
import ProductionSheetModal from '../components/ProductionSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';
import ResizableTableCell from '../components/ResizableTableCell';

const ProductionPage = () => {
    const [tabIndex, setTabIndex] = useState(0);
    const [orders, setOrders] = useState([]);
    const [stockProductions, setStockProductions] = useState([]);
    const [plans, setPlans] = useState([]);

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

    const handlePrintClick = (plan, type = 'PRODUCTION') => {
        setSheetPlan(plan);
        setSheetType(type);
        setSheetModalOpen(true);
    };

    const handleViewOrder = (order) => {
        setItemToView(order);
        setViewOrderOpen(true);
    };

    const handleViewStockProduction = (sp) => {
        setItemToView(sp);
        setViewStockOpen(true);
    };

    const fetchOrders = async () => {
        try {
            const response = await api.get('/sales/orders/'); // Fetch all to include PENDING
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
            if (filterPartner !== 'all') {
                if (filterPartner === 'internal') {
                    // How to filter internal plans? 
                    // Backend logic for partner_id: 
                    // if partner_id: stmt = stmt.where(or_(SalesOrder.partner_id == partner_id, StockProduction.partner_id == partner_id))
                    // For 'internal', maybe we need a special check or just 0? 
                    // Let's assume partner_id filter on backend handles IDs.
                } else {
                    params.partner_id = filterPartner;
                }
            }
            if (searchQuery) params.product_name = searchQuery;

            const response = await api.get('/production/plans/', { params });
            setPlans(response.data);
        } catch (error) {
            console.error("Failed to fetch plans", error);
        }
    };


    const fetchStockProductions = async () => {
        try {
            const response = await api.get('/inventory/productions/?status=PENDING');
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

    const fetchPartners = async () => {
        try {
            const response = await api.get('/basics/partners/', { params: { type: 'CUSTOMER' } });
            setPartners(response.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchOrders();
        fetchStockProductions();
        fetchPartners();
        fetchDefects();
    }, []);

    useEffect(() => {
        fetchPlans();
    }, [startDate, endDate, filterPartner, searchQuery]);


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
            if (!window.confirm("생산 완료된 내역입니다. 진행 중 상태로 되돌리시겠습니까?\n\n[주의]\n- 추가된 재고가 차감됩니다.\n- 연계된 자재/외주 발주가 '대기' 상태로 원복됩니다.")) return;
            try {
                await api.patch(`/production/plans/${planId}/status?status=IN_PROGRESS`);
                alert("상태가 '진행 중'으로 변경되었으며 재고 및 발주 내역이 원복되었습니다.");
                fetchPlans();
                fetchOrders();
            } catch (error) {
                console.error("Revert failed", error);
                alert("상태 변경 실패: " + (error.response?.data?.detail || error.message));
            }
            return;
        }

        if (!window.confirm("정말로 이 생산 계획을 삭제하시겠습니까? 관련 수주는 대기 상태로 복원됩니다.")) return;

        // Ask whether to also delete related orders
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

        // Check dependencies
        let hasIncompleteDependencies = false;
        let warningMessage = "";

        if (plan.items) {
            for (const item of plan.items) {
                // Check Purchase Items
                if (item.purchase_items && item.purchase_items.length > 0) {
                    const incompletePurchase = item.purchase_items.some(pi => pi.purchase_order?.status !== 'COMPLETED' && pi.purchase_order?.status !== 'PARTIAL');
                    // Or check received_quantity vs quantity? Status is safer if synced.
                    // Backend PurchaseOrder status: PENDING, ORDERED, PARTIAL, COMPLETED.
                    if (incompletePurchase) {
                        hasIncompleteDependencies = true;
                        warningMessage += `- [구매] ${item.product?.name || '품목'}의 자재 발주가 완료되지 않았습니다.\n`;
                    }
                }
                // Check Outsourcing Items
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
            const files = typeof plan.attachment_file === 'string' ? JSON.parse(plan.attachment_file) : plan.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== idxToRemove);

            await api.put(`/production/plans/${plan.id}`, {
                attachment_file: newFiles
            });

            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("첨부파일이 삭제되었습니다.");
            fetchPlans(); // Refresh the list
        } catch (e) {
            console.error("Delete attachment failed", e);
            alert("첨부파일 삭제 실패");
        }
    };

    const handleDeleteItemAttachment = async (item, idxToRemove) => {
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;

        try {
            const files = typeof item.attachment_file === 'string' ? JSON.parse(item.attachment_file) : item.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== idxToRemove);

            await api.patch(`/production/plan-items/${item.id}`, {
                attachment_file: newFiles
            });

            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("첨부파일이 삭제되었습니다.");
            fetchPlans();
        } catch (e) {
            console.error("Delete item attachment failed", e);
            alert("첨부파일 삭제 실패");
        }
    };



    const handleSuccess = () => {
        fetchOrders();
        fetchStockProductions();
        fetchPlans();
        if (tabIndex === 0) setTabIndex(1);
    };

    const handleTabChange = (event, newValue) => {
        setTabIndex(newValue);
    };

    // Filter plans by status based on tab
    // Filter logic
    const filterData = (p) => {
        // Partner Filter
        if (filterPartner !== 'all') {
            if (filterPartner === 'internal') {
                if (p.order_id) return false;
            } else {
                if (p.order?.partner_id !== parseInt(filterPartner)) return false;
            }
        }

        // Date Filter (Plan Date) - Default to matching if no date set
        if (startDate && p.plan_date < startDate) return false;
        if (endDate && p.plan_date > endDate) return false;

        // Search Query (Order No, Partner, Product Name/Spec)
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const orderNo = (p.order?.order_no || '').toLowerCase();
            const prodNo = (p.stock_production?.production_no || '').toLowerCase();
            const partnerName = (p.order?.partner?.name || '').toLowerCase();

            // Check items for product info
            const hasMatchingProduct = (p.items || []).some(item =>
                (item.product?.name || '').toLowerCase().includes(q) ||
                (item.product?.specification || '').toLowerCase().includes(q)
            );

            if (!orderNo.includes(q) && !prodNo.includes(q) && !partnerName.includes(q) && !hasMatchingProduct) {
                return false;
            }
        }

        return true;
    };

    const inProgressPlans = plans.filter(p => p.status !== 'COMPLETED' && p.status !== 'CANCELED' && filterData(p));
    const completedPlans = plans.filter(p => p.status === 'COMPLETED' && filterData(p));

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h4" gutterBottom component="div" sx={{ mb: 4, fontWeight: 'bold', color: '#1a237e' }}>
                생산 관리
            </Typography>

            <Paper sx={{ width: '100%', mb: 2 }}>
                <Tabs
                    value={tabIndex}
                    onChange={handleTabChange}
                    indicatorColor="primary"
                    textColor="primary"
                    sx={{
                        '& .MuiTab-root': { color: 'rgba(0, 0, 0, 0.7)' },
                        '& .Mui-selected': { color: '#000 !important' },
                    }}
                >
                    <Tab label="생산 대기 수주" />
                    <Tab label="생산현황" />
                    <Tab label="생산 완료" />
                </Tabs>

                <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', bgcolor: '#fcfcfc' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="textSecondary">기간:</Typography>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                        <span>~</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                        <Typography variant="body2" color="textSecondary">거래처:</Typography>
                        <div style={{ flex: 1 }}>
                            <Select
                                isClearable
                                placeholder="전체 거래처"
                                options={[
                                    { value: 'all', label: '전체 거래처' },
                                    { value: 'internal', label: '사내(재고)' },
                                    ...partners.map(p => ({ value: p.id.toString(), label: p.name }))
                                ]}
                                value={filterPartner === 'all' ? { value: 'all', label: '전체 거래처' } :
                                    filterPartner === 'internal' ? { value: 'internal', label: '사내(재고)' } :
                                        partners.find(p => p.id.toString() === filterPartner) ? { value: filterPartner, label: partners.find(p => p.id.toString() === filterPartner).name } : null}
                                onChange={(opt) => setFilterPartner(opt ? opt.value : 'all')}
                                styles={{
                                    control: (base) => ({ ...base, minHeight: '32px', height: '32px', fontSize: '0.875rem' }),
                                    valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                    input: (base) => ({ ...base, margin: '0' }),
                                    indicatorsContainer: (base) => ({ ...base, height: '32px' }),
                                }}
                            />
                        </div>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="textSecondary">품명/품번:</Typography>
                        <input
                            type="text"
                            placeholder="검색어 입력..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px' }}
                        />
                    </Box>
                    <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        onClick={() => {
                            setStartDate('');
                            setEndDate('');
                            setFilterPartner('all');
                            setSearchQuery('');
                        }}
                    >
                        필터 초기화
                    </Button>
                </Box>

                <Box sx={{ p: 3 }}>
                    {tabIndex === 0 && (
                        <UnplannedOrdersTable
                            orders={orders}
                            stockProductions={stockProductions}
                            plans={plans}
                            onCreatePlan={handleCreateClick}
                            searchQuery={searchQuery}
                            filterPartner={filterPartner}
                        />
                    )}
                    {tabIndex === 1 && (
                        <ProductionPlansTable
                            plans={inProgressPlans}
                            orders={orders}
                            defects={defects}
                            onEdit={handleEditClick}
                            onDelete={handleDeletePlan}
                            onComplete={handleCompletePlan}
                            onConfirm={handleConfirmPlan}
                            onPrint={handlePrintClick}
                            onDeleteAttachment={handleDeleteAttachment}
                            onOpenFiles={(files, plan) => {
                                setViewingFiles(files);
                                setViewingFileTitle(plan?.order?.order_no || '첨부 파일');
                                setOnDeleteFile(() => (idx) => handleDeleteAttachment(plan, idx));
                                setShowFileModal(true);
                            }}
                            onOpenProcessFiles={(files, title, onDelete) => {
                                setViewingFiles(files);
                                setViewingFileTitle(title);
                                setOnDeleteFile(() => onDelete);
                                setShowFileModal(true);
                            }}
                            onShowDefects={(d) => {
                                setSelectedDefects(d);
                                setDefectModalOpen(true);
                            }}
                            onRefresh={fetchPlans}
                            readonly={false}
                        />
                    )}
                    {tabIndex === 2 && (
                        <ProductionPlansTable
                            plans={completedPlans}
                            orders={orders}
                            defects={defects}
                            onEdit={handleEditClick}
                            onDelete={handleDeletePlan}
                            onPrint={handlePrintClick}
                            onDeleteAttachment={handleDeleteAttachment}
                            onOpenFiles={(files, plan) => {
                                setViewingFiles(files);
                                setViewingFileTitle(plan?.order?.order_no || '첨부 파일');
                                setOnDeleteFile(() => (idx) => handleDeleteAttachment(plan, idx));
                                setShowFileModal(true);
                            }}
                            onOpenProcessFiles={(files, title, onDelete) => {
                                setViewingFiles(files);
                                setViewingFileTitle(title);
                                setOnDeleteFile(() => onDelete);
                                setShowFileModal(true);
                            }}
                            onShowDefects={(d) => {
                                setSelectedDefects(d);
                                setDefectModalOpen(true);
                            }}
                            onRefresh={fetchPlans}
                        />
                    )}
                </Box>
            </Paper >

            <ProductionPlanModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                order={selectedOrder}
                stockProduction={selectedStockProduction}
                plan={selectedPlan}
            />

            <ProductionSheetModal
                isOpen={sheetModalOpen}
                onClose={() => setSheetModalOpen(false)}
                plan={sheetPlan}
                sheetType={sheetType}
                onSave={fetchPlans}
            />

            {
                showFileModal && (
                    <FileViewerModal
                        isOpen={showFileModal}
                        onClose={() => {
                            setShowFileModal(false);
                            setOnDeleteFile(null);
                        }}
                        files={viewingFiles}
                        title={viewingFileTitle}
                        onDeleteFile={onDeleteFile}
                    />
                )
            }

            {
                viewOrderOpen && (
                    <OrderModal
                        isOpen={viewOrderOpen}
                        onClose={() => setViewOrderOpen(false)}
                        partners={partners}
                        orderToEdit={itemToView}
                        onSuccess={() => { }} // View only, so no success handler needed or just fetchPlans
                    />
                )
            }

            {
                viewStockOpen && (
                    <StockProductionModal
                        isOpen={viewStockOpen}
                        onClose={() => setViewStockOpen(false)}
                        partners={partners}
                        stockProductionToEdit={itemToView}
                        onSuccess={() => { }}
                    />
                )
            }

            <DefectInfoModal
                isOpen={defectModalOpen}
                onClose={() => setDefectModalOpen(false)}
                defects={selectedDefects}
            />
        </Box >
    );
};

const DefectInfoModal = ({ isOpen, onClose, defects }) => {
    if (!defects || defects.length === 0) return null;
    return (
        <FileViewerModal
            isOpen={isOpen}
            onClose={onClose}
            title="불량 발생 내역"
            files={[]} // Not used but required by FileViewerModal structural similarity if I were to use it, but better use a simple Box/Paper
        >
            <Box sx={{ p: 2, minWidth: 400 }}>
                <Typography variant="h6" color="error" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AlertCircle /> 불량 내역 ({defects.length}건)
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#fff5f5', '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
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
                                    <TableCell align="right" sx={{ color: '#d32f2f' }}>{d.amount.toLocaleString()} 원</TableCell>
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

const UnplannedOrdersTable = ({ orders, stockProductions, plans, onCreatePlan, searchQuery, filterPartner }) => {
    const planOrderIds = plans.map(p => p.order_id);
    const planStockProdIds = plans.map(p => p.stock_production_id);

    // Filter out planned orders AND filter by status (PENDING or CONFIRMED)
    let unplannedOrders = orders.filter(o =>
        !planOrderIds.includes(o.id) &&
        (o.status === 'PENDING' || o.status === 'CONFIRMED')
    );

    let unplannedStockProductions = stockProductions.filter(sp =>
        !planStockProdIds.includes(sp.id)
    );

    // Apply Client-side Filtering
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        unplannedOrders = unplannedOrders.filter(o =>
            o.order_no?.toLowerCase().includes(query) ||
            o.partner?.name?.toLowerCase().includes(query) ||
            o.items?.some(it => it.product?.name?.toLowerCase().includes(query) || it.product?.specification?.toLowerCase().includes(query))
        );
        unplannedStockProductions = unplannedStockProductions.filter(sp =>
            sp.production_no?.toLowerCase().includes(query) ||
            sp.product?.name?.toLowerCase().includes(query) ||
            sp.product?.specification?.toLowerCase().includes(query)
        );
    }

    if (filterPartner !== 'all') {
        if (filterPartner === 'internal') {
            unplannedOrders = []; // Stock productions are 'internal'
        } else {
            unplannedOrders = unplannedOrders.filter(o => o.partner_id === parseInt(filterPartner));
            unplannedStockProductions = []; // No partner links for stock production usually
        }
    }

    return (
        <TableContainer>
            <Table>
                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                    <TableRow>
                        <TableCell>수주번호</TableCell>
                        <TableCell>거래처</TableCell>
                        <TableCell>수주일</TableCell>
                        <TableCell>납기일</TableCell>
                        <TableCell>금액</TableCell>
                        <TableCell>작업</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {unplannedOrders.length === 0 && unplannedStockProductions.length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center">생산 대기 중인 항목이 없습니다.</TableCell></TableRow>
                    ) : (
                        <>
                            {unplannedOrders.map((order) => (
                                <UnplannedOrderRow key={`order-${order.id}`} order={order} onCreatePlan={onCreatePlan} />
                            ))}
                            {unplannedStockProductions.map((sp) => (
                                <UnplannedStockProductionRow key={`sp-${sp.id}`} stockProduction={sp} onCreatePlan={onCreatePlan} />
                            ))}
                        </>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const UnplannedOrderRow = ({ order, onCreatePlan }) => {
    const [open, setOpen] = useState(false);

    return (
        <React.Fragment>
            <TableRow
                sx={{ '& > *': { borderBottom: 'unset' }, cursor: 'pointer', '&:hover': { backgroundColor: '#f5f5f5' } }}
                onClick={() => setOpen(!open)}
                onDoubleClick={() => onCreatePlan(order)}
            >
                <TableCell>
                    <Chip label="수주" size="small" variant="outlined" sx={{ mr: 1 }} />
                    {order.order_no}
                </TableCell>
                <TableCell>{order.partner?.name}</TableCell>
                <TableCell>{order.order_date}</TableCell>
                <TableCell>{order.delivery_date}</TableCell>
                <TableCell>{order.total_amount?.toLocaleString()}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => onCreatePlan(order)}>
                        계획 수립
                    </Button>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                수주 품목 목록
                            </Typography>
                            <Table size="small" aria-label="purchases">
                                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                    <TableRow>
                                        <TableCell>품명</TableCell>
                                        <TableCell>규격</TableCell>
                                        <TableCell>단위</TableCell>
                                        <TableCell>수량</TableCell>
                                        <TableCell>비고</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {order.items?.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.product?.name}</TableCell>
                                            <TableCell>{item.product?.specification}</TableCell>
                                            <TableCell>{item.product?.unit}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{item.note}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

const UnplannedStockProductionRow = ({ stockProduction, onCreatePlan }) => {
    const [open, setOpen] = useState(false);

    return (
        <React.Fragment>
            <TableRow
                sx={{ '& > *': { borderBottom: 'unset' }, cursor: 'pointer', '&:hover': { backgroundColor: '#f5f5f5' } }}
                onClick={() => setOpen(!open)}
                onDoubleClick={() => onCreatePlan(null, stockProduction)}
            >
                <TableCell>
                    <Chip label="재고생산" size="small" sx={{ mr: 1, bgcolor: '#e8f5e9', color: '#2e7d32' }} />
                    {stockProduction.production_no}
                </TableCell>
                <TableCell>사내 (자체 생산)</TableCell>
                <TableCell>{stockProduction.request_date}</TableCell>
                <TableCell>{stockProduction.target_date || '-'}</TableCell>
                <TableCell sx={{ color: '#666', fontStyle: 'italic' }}>-</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="outlined"
                        color="success"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => onCreatePlan(null, stockProduction)}
                    >
                        계획 수립
                    </Button>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                재고 생산 품목 상세
                            </Typography>
                            <Table size="small">
                                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                    <TableRow>
                                        <TableCell>품명</TableCell>
                                        <TableCell>규격</TableCell>
                                        <TableCell>단위</TableCell>
                                        <TableCell>수량</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>{stockProduction.product?.name}</TableCell>
                                        <TableCell>{stockProduction.product?.specification}</TableCell>
                                        <TableCell>{stockProduction.product?.unit}</TableCell>
                                        <TableCell>{stockProduction.quantity}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

const ProductionPlansTable = ({ plans, defects, onEdit, onDelete, onComplete, onPrint, onDeleteAttachment, onOpenFiles, onOpenProcessFiles, onShowDefects, onShowOrder, onShowStock, onRefresh }) => {
    return (
        <TableContainer sx={{ boxShadow: 'none' }}>
            <Table sx={{ tableLayout: 'fixed' }}>
                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
                    <TableRow>
                        <TableCell style={{ width: '40px' }} />
                        <TableCell style={{ width: '150px' }}>수주/재고번호</TableCell>
                        <TableCell style={{ width: '150px' }}>거래처</TableCell>
                        <TableCell style={{ width: '100px' }}>납기일</TableCell>
                        <TableCell style={{ width: '100px' }}>금액</TableCell>
                        <TableCell style={{ width: '100px' }}>상태</TableCell>
                        <TableCell style={{ width: '50px' }}>불량</TableCell>
                        <TableCell style={{ width: '70px' }}>공정수</TableCell>
                        <TableCell style={{ width: '120px' }}>총 공정 비용</TableCell>
                        <TableCell style={{ width: '80px' }}>첨부파일</TableCell>
                        <TableCell style={{ width: '120px' }}>관리</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {plans.length === 0 ? (
                        <TableRow><TableCell colSpan={11} align="center">데이터가 없습니다.</TableCell></TableRow>
                    ) : (
                        plans.map((plan) => (
                            <Row
                                key={plan.id}
                                plan={plan}
                                defects={defects?.filter(d => d.plan_id === plan.id)}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onComplete={onComplete}
                                onPrint={onPrint}
                                onDeleteAttachment={onDeleteAttachment}
                                onOpenFiles={onOpenFiles}
                                onOpenProcessFiles={onOpenProcessFiles}
                                onShowDefects={onShowDefects}
                                onShowOrder={onShowOrder}
                                onShowStock={onShowStock}
                                onRefresh={onRefresh}
                            />
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const Row = ({ plan, defects, onEdit, onDelete, onComplete, onPrint, onOpenFiles, onOpenProcessFiles, onShowDefects, onShowOrder, onShowStock, readonly, onRefresh }) => {
    const [open, setOpen] = useState(false);
    const [colWidths, setColWidths] = useState({
        seq: 50,
        process: 150,
        type: 80,
        partner: 120,
        equip: 120,
        note: 150,
        period: 150,
        progress: 100,
        cost: 100,
        status: 100,
        attach: 60
    });

    const handleResize = (colKey) => (newWidth) => {
        setColWidths(prev => ({ ...prev, [colKey]: newWidth }));
    };

    const order = plan.order;
    const sp = plan.stock_production;

    // Group items by product
    const groupedItems = plan.items?.reduce((acc, item) => {
        if (!acc[item.product_id]) {
            acc[item.product_id] = {
                product_name: item.product?.name || item.product_id,
                product_spec: item.product?.specification || "",
                product_unit: item.product?.unit || "EA",
                items: []
            };
        }
        acc[item.product_id].items.push(item);
        return acc;
    }, {}) || {};

    const typeMap = {
        'INTERNAL': '사내',
        'PURCHASE': '구매',
        'OUTSOURCING': '외주'
    };

    return (
        <React.Fragment>
            <TableRow
                sx={{ '& > *': { borderBottom: 'unset' }, cursor: 'pointer' }}
                onClick={() => setOpen(!open)}
                onDoubleClick={() => onEdit(plan)}
                hover
            >
                <TableCell>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                        {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </TableCell>
                <TableCell>
                    {order ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip label="수주" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#e3f2fd', color: '#1976d2', border: 'none' }} />
                            <Typography
                                variant="body2"
                                color="primary"
                            >
                                {order.order_no}
                            </Typography>
                        </Box>
                    ) : sp ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip label="재고" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#f3e5f5', color: '#7b1fa2', border: 'none' }} />
                            <Typography
                                variant="body2"
                                color="secondary"
                            >
                                {sp.production_no || `Stock-${sp.id}`}
                            </Typography>
                        </Box>
                    ) : '-'}
                </TableCell>
                <TableCell>
                    {plan.order?.partner?.name || plan.stock_production?.partner?.name || '사내 생산(재고)'}
                </TableCell>
                <TableCell>{order?.delivery_date || '-'}</TableCell>
                <TableCell>{order?.total_amount?.toLocaleString() || '0'}</TableCell>
                <TableCell>
                    <Chip
                        label={plan.status}
                        color={plan.status === 'COMPLETED' ? "success" : plan.status === 'CONFIRMED' ? "secondary" : "primary"}
                        variant={plan.status === 'CONFIRMED' ? "filled" : "outlined"}
                    />
                </TableCell>
                <TableCell>{defects && defects.length > 0 && (
                    <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => { e.stopPropagation(); onShowDefects(defects); }}
                        title="불량 내역 보기"
                    >
                        <AlertCircle className="w-5 h-5" />
                    </IconButton>
                )}
                </TableCell>
                <TableCell>{plan.items?.length || 0}</TableCell>
                <TableCell>
                    {(() => {
                        const totalCost = plan.items?.reduce((sum, item) => {
                            // If external, count sum of PO/OO items? Or wait for backend field.
                            // For now, let's use the field 'cost' if it exists.
                            return sum + (item.cost || 0);
                        }, 0) || 0;

                        const defectCost = defects?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;

                        return (
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#1b5e20' }}>
                                    {totalCost.toLocaleString()} 원
                                </Typography>
                            </Box>
                        );
                    })()}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    {(() => {
                        let files = [];
                        try {
                            if (plan.attachment_file) {
                                files = typeof plan.attachment_file === 'string' ? JSON.parse(plan.attachment_file) : plan.attachment_file;
                            }
                        } catch {
                            files = [];
                        }
                        const fileList = Array.isArray(files) ? files : [files].filter(Boolean);
                        if (fileList.length > 0) {
                            return (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenFiles(fileList, plan);
                                    }}
                                    className="flex items-center gap-1.5 text-blue-500 hover:text-blue-400 text-xs px-2 py-1 rounded bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/40 transition-colors"
                                    title="첨부파일 보기/다운로드"
                                >
                                    <FileText className="w-3 h-3" />
                                    {fileList.length}개
                                </button>
                            );
                        }
                        return <span className="text-gray-500 text-xs">-</span>;
                    })()}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    {!readonly && (
                        <>
                            {plan.status !== 'COMPLETED' ? (
                                <>
                                    <IconButton size="small" color="primary" onClick={() => onPrint(plan, 'PRODUCTION')} title="생산관리시트출력">
                                        <PrintIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="primary" onClick={() => onEdit(plan)} title="수정">
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => onDelete(plan.id)} title="삭제">
                                        <DeleteIcon />
                                    </IconButton>
                                    {plan.status === 'PLANNED' && (
                                        <IconButton size="small" color="secondary" onClick={() => onConfirm(plan.id)} title="계획 확정 (MRP 실행)">
                                            <CheckIcon />
                                        </IconButton>
                                    )}
                                    <IconButton size="small" color="success" onClick={() => onComplete(plan.id)} title="생산 완료">
                                        <CheckIcon />
                                    </IconButton>
                                </>
                            ) : (
                                <IconButton size="small" color="error" onClick={() => onDelete(plan.id)} title="생산 완료 취소 (삭제)">
                                    <DeleteIcon />
                                </IconButton>
                            )}
                        </>
                    )}
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={9}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                생산 공정 상세
                            </Typography>

                            {Object.entries(groupedItems).map(([productId, group]) => (
                                <Paper key={productId} variant="outlined" sx={{ mb: 2, p: 2, backgroundColor: '#fafafa' }}>
                                    <Box sx={{ mb: 1 }}>
                                        <Typography variant="subtitle1" fontWeight="bold" display="inline" sx={{ mr: 2, color: '#1565c0' }}>
                                            품명: {group.product_name}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                            규격: {group.product_spec || '-'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                            수량: {group.items.length > 0 ? group.items[0].quantity : 0} {group.product_unit}
                                        </Typography>
                                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#c62828', bgcolor: '#ffebee', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block', mr: 2 }}>
                                            총 공정 비용: {group.items.reduce((sum, item) => sum + (item.cost || 0), 0).toLocaleString()} 원
                                        </Typography>
                                        {(() => {
                                            const groupItemIds = group.items.map(i => i.id);
                                            const groupDefectCost = defects?.filter(d => groupItemIds.includes(d.plan_item_id)).reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
                                            if (groupDefectCost > 0) {
                                                return (
                                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#d32f2f', display: 'inline-block' }}>
                                                        - {groupDefectCost.toLocaleString()} 원 (불량)
                                                    </Typography>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </Box>

                                    <Table size="small" aria-label="process-list" sx={{ tableLayout: 'fixed' }}>
                                        <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                            <TableRow>
                                                <ResizableTableCell width={colWidths.seq} onResize={handleResize('seq')}>순번</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.process} onResize={handleResize('process')}>공정명</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.type} onResize={handleResize('type')}>구분</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.partner} onResize={handleResize('partner')}>외주/구매/작업자</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.equip} onResize={handleResize('equip')}>배정 장비</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.note} onResize={handleResize('note')}>작업내용</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.period} onResize={handleResize('period')}>작업기간</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.progress} onResize={handleResize('progress')}>진행상황</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.cost} onResize={handleResize('cost')}>공정비용</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.status} onResize={handleResize('status')}>상태</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.attach} onResize={handleResize('attach')}>첨부</ResizableTableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {group.items.sort((a, b) => a.sequence - b.sequence).map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.sequence}</TableCell>
                                                    <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {item.process_name}
                                                        {defects?.some(d => d.plan_item_id === item.id) && (
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onShowDefects(defects.filter(d => d.plan_item_id === item.id));
                                                                }}
                                                            >
                                                                <AlertCircle className="w-4 h-4" />
                                                            </IconButton>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={typeMap[item.course_type] || item.course_type}
                                                            size="small"
                                                            color={item.course_type === 'INTERNAL' ? 'default' : 'info'}
                                                            variant={item.course_type === 'INTERNAL' ? 'outlined' : 'filled'}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.course_type === 'INTERNAL' ? (
                                                            item.worker?.name || <span className="text-gray-400 italic">미배정</span>
                                                        ) : (
                                                            item.partner_name || '-'
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.course_type === 'INTERNAL' ? (
                                                            item.equipment?.name || <span className="text-gray-400 italic">미배정</span>
                                                        ) : (
                                                            <span className="text-gray-500 font-light">사외</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{item.note}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem' }}>
                                                        {item.start_date || '-'} ~ {item.end_date || '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                                {item.completed_quantity || 0}
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'textSecondary' }}>
                                                                / {item.quantity}
                                                            </Typography>
                                                            <Box sx={{ ml: 1, flex: 1, height: 4, bgcolor: '#eee', borderRadius: 2, overflow: 'hidden' }}>
                                                                <Box sx={{
                                                                    width: `${Math.min(100, ((item.completed_quantity || 0) / item.quantity) * 100)}%`,
                                                                    height: '100%',
                                                                    bgcolor: item.status === 'COMPLETED' ? '#4caf50' : '#2196f3'
                                                                }} />
                                                            </Box>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                                            {(item.cost || 0).toLocaleString()}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <select
                                                            value={item.status}
                                                            onChange={async (e) => {
                                                                const newStatus = e.target.value;
                                                                if (newStatus === 'COMPLETED' && (item.course_type === 'PURCHASE' || item.course_type === 'OUTSOURCING')) {
                                                                    if (!window.confirm(`'${item.process_name}' 공정을 완료 처리하시겠습니까?\n이 작업과 연결된 발주/외주 발주가 함께 '처리완료' 상태로 변경될 수 있습니다.`)) {
                                                                        return;
                                                                    }
                                                                }
                                                                try {
                                                                    await api.patch(`/production/plan-items/${item.id}`, { status: newStatus });
                                                                    if (onRefresh) onRefresh();
                                                                } catch (err) {
                                                                    console.error("Status update error", err);
                                                                    // Only alert if it's truly an error (axios throws on non-2xx)
                                                                    alert("상태 변경 중 오류가 발생했습니다.");
                                                                }
                                                            }}
                                                            style={{
                                                                padding: '2px 4px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.75rem',
                                                                border: '1px solid ' + (item.status === 'COMPLETED' ? '#4caf50' : '#ccc'),
                                                                backgroundColor: item.status === 'COMPLETED' ? '#e8f5e9' : 'white',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <option value="PLANNED">계획</option>
                                                            <option value="IN_PROGRESS">진행중</option>
                                                            <option value="COMPLETED">완료</option>
                                                        </select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            {(() => {
                                                                // 1. Parse item's own locally attached files
                                                                let localFiles = [];
                                                                try {
                                                                    if (item.attachment_file) {
                                                                        const parsed = typeof item.attachment_file === 'string' ? JSON.parse(item.attachment_file) : item.attachment_file;
                                                                        localFiles = Array.isArray(parsed) ? parsed : [parsed];
                                                                    }
                                                                } catch {
                                                                    localFiles = item.attachment_file ? [{ name: 'file', url: item.attachment_file }] : [];
                                                                }
                                                                localFiles = localFiles.filter(f => f && (typeof f === 'object' || (typeof f === 'string' && f.trim() !== ''))).map(f => typeof f === 'string' ? { name: f.split?.('/')?.pop() || '파일', url: f } : f);

                                                                // 2. Parse external order's files (Read-only)
                                                                let externalFiles = [];
                                                                if (item.course_type === 'PURCHASE' && item.purchase_items?.length > 0 && item.purchase_items[0].purchase_order?.attachment_file) {
                                                                    try {
                                                                        let poFiles = item.purchase_items[0].purchase_order.attachment_file;
                                                                        poFiles = typeof poFiles === 'string' ? JSON.parse(poFiles) : poFiles;
                                                                        if (!Array.isArray(poFiles)) poFiles = [poFiles];
                                                                        externalFiles = poFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split?.('/')?.pop() || '파일' } : f), name: `[구매] ${(typeof f === 'string' ? f.split?.('/')?.pop() || '파일' : f.name)}`, isExternal: true }));
                                                                    } catch (e) { }
                                                                } else if (item.course_type === 'OUTSOURCING' && item.outsourcing_items?.length > 0 && item.outsourcing_items[0].outsourcing_order?.attachment_file) {
                                                                    try {
                                                                        let outFiles = item.outsourcing_items[0].outsourcing_order.attachment_file;
                                                                        outFiles = typeof outFiles === 'string' ? JSON.parse(outFiles) : outFiles;
                                                                        if (!Array.isArray(outFiles)) outFiles = [outFiles];
                                                                        externalFiles = outFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split?.('/')?.pop() || '파일' } : f), name: `[외주] ${(typeof f === 'string' ? f.split?.('/')?.pop() || '파일' : f.name)}`, isExternal: true }));
                                                                    } catch (e) { }
                                                                }

                                                                const allFiles = [...externalFiles, ...localFiles];

                                                                return (
                                                                    <>
                                                                        {allFiles.length > 0 && (
                                                                            <IconButton
                                                                                size="small"
                                                                                color="primary"
                                                                                onClick={() => {
                                                                                    const onDelete = (idx) => {
                                                                                        const targetFile = allFiles[idx];
                                                                                        if (targetFile.isExternal) {
                                                                                            alert("외부(발주/외주) 문서에 첨부된 파일은 해당 문서에서만 삭제 가능합니다.");
                                                                                            return;
                                                                                        }
                                                                                        const targetIdxInLocal = localFiles.findIndex(f => f.url === targetFile.url && f.name === targetFile.name);
                                                                                        if (targetIdxInLocal !== -1) {
                                                                                            handleDeleteItemAttachment(item, targetIdxInLocal);
                                                                                        }
                                                                                    };
                                                                                    if (onOpenProcessFiles) {
                                                                                        onOpenProcessFiles(allFiles, `${item.process_name} 첨부 파일`, onDelete);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <FileText className="w-4 h-4" />
                                                                            </IconButton>
                                                                        )}
                                                                        <input
                                                                            type="file"
                                                                            id={`file-item-${item.id}`}
                                                                            style={{ display: 'none' }}
                                                                            onChange={async (e) => {
                                                                                const file = e.target.files[0];
                                                                                if (!file) return;
                                                                                const formData = new FormData();
                                                                                formData.append('file', file);
                                                                                try {
                                                                                    const uploadRes = await api.post('/upload', formData, {
                                                                                        headers: { 'Content-Type': 'multipart/form-data' }
                                                                                    });
                                                                                    const newFile = { name: uploadRes.data.filename, url: uploadRes.data.url };
                                                                                    const updatedLocalFiles = [...localFiles, newFile]; // Only save locally added files
                                                                                    await api.patch(`/production/plan-items/${item.id}`, { attachment_file: updatedLocalFiles });
                                                                                    if (onRefresh) onRefresh();
                                                                                } catch (err) {
                                                                                    console.error("Upload failed", err);
                                                                                    alert("파일 업로드 실패");
                                                                                } finally {
                                                                                    e.target.value = null;
                                                                                }
                                                                            }}
                                                                        />
                                                                        <IconButton size="small" onClick={() => document.getElementById(`file-item-${item.id}`).click()}>
                                                                            <AddIcon sx={{ fontSize: 18 }} />
                                                                        </IconButton>
                                                                    </>
                                                                );
                                                            })()}
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Paper>
                            ))}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    )
}

export default ProductionPage;
