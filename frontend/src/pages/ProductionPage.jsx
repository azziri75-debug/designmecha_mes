import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Tabs, Tab, IconButton, Collapse } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, CheckCircle as CheckIcon, Print as PrintIcon } from '@mui/icons-material';
import { X, FileText } from 'lucide-react';
import api from '../lib/api';
import ProductionPlanModal from '../components/ProductionPlanModal';
import ProductionSheetModal from '../components/ProductionSheetModal';
import FileViewerModal from '../components/FileViewerModal';

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

    // Sheet Modal State
    const [sheetModalOpen, setSheetModalOpen] = useState(false);
    const [sheetPlan, setSheetPlan] = useState(null);

    // File viewer modal
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [viewingFileTitle, setViewingFileTitle] = useState('');

    const handlePrintClick = (plan) => {
        setSheetPlan(plan);
        setSheetModalOpen(true);
    };

    const fetchOrders = async () => {
        try {
            const response = await api.get('/sales/orders'); // Fetch all to include PENDING
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        }
    };

    const fetchPlans = async () => {
        try {
            const response = await api.get('/production/plans');
            setPlans(response.data);
        } catch (error) {
            console.error("Failed to fetch plans", error);
        }
    };

    const fetchStockProductions = async () => {
        try {
            const response = await api.get('/inventory/productions?status=PENDING');
            setStockProductions(response.data);
        } catch (error) {
            console.error("Failed to fetch stock productions", error);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchOrders();
        fetchStockProductions();
        fetchPlans();
    }, []);

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

            alert("첨부파일이 삭제되었습니다.");
            fetchPlans(); // Refresh the list
        } catch (e) {
            console.error("Delete attachment failed", e);
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
    const inProgressPlans = plans.filter(p => p.status !== 'COMPLETED' && p.status !== 'CANCELED');
    const completedPlans = plans.filter(p => p.status === 'COMPLETED');

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h4" gutterBottom component="div" sx={{ mb: 4, fontWeight: 'bold', color: '#1a237e' }}>
                생산 관리
            </Typography>

            <Paper sx={{ width: '100%', mb: 2 }}>
                <Tabs value={tabIndex} onChange={handleTabChange} indicatorColor="primary" textColor="primary">
                    <Tab label="생산 대기 수주" />
                    <Tab label="진행 중인 생산 계획" />
                    <Tab label="생산 완료" />
                </Tabs>

                <Box sx={{ p: 3 }}>
                    {tabIndex === 0 && (
                        <UnplannedOrdersTable
                            orders={orders}
                            stockProductions={stockProductions}
                            plans={plans}
                            onCreatePlan={handleCreateClick}
                        />
                    )}
                    {tabIndex === 1 && (
                        <ProductionPlansTable
                            plans={inProgressPlans}
                            orders={orders}
                            onEdit={handleEditClick}
                            onDelete={handleDeletePlan}
                            onComplete={handleCompletePlan}
                            onPrint={handlePrintClick}
                            onDeleteAttachment={handleDeleteAttachment}
                            onOpenFiles={(files, plan) => {
                                setViewingFiles(files);
                                setViewingFileTitle(plan?.order?.order_no || '첨부 파일');
                                setShowFileModal(true);
                            }}
                            readonly={false}
                        />
                    )}
                    {tabIndex === 2 && (
                        <ProductionPlansTable
                            plans={completedPlans}
                            orders={orders}
                            onEdit={handleEditClick}
                            onDelete={handleDeletePlan}
                            onPrint={handlePrintClick}
                            onDeleteAttachment={handleDeleteAttachment}
                            onOpenFiles={(files, plan) => {
                                setViewingFiles(files);
                                setViewingFileTitle(plan?.order?.order_no || '첨부 파일');
                                setShowFileModal(true);
                            }}
                        />
                    )}
                </Box>
            </Paper>

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
                onSave={fetchPlans}
            />

            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => setShowFileModal(false)}
                files={viewingFiles}
                title={viewingFileTitle}
            />
        </Box>
    );
};

const UnplannedOrdersTable = ({ orders, stockProductions, plans, onCreatePlan }) => {
    const planOrderIds = plans.map(p => p.order_id);
    const planStockProdIds = plans.map(p => p.stock_production_id);

    // Filter out planned orders AND filter by status (PENDING or CONFIRMED)
    const unplannedOrders = orders.filter(o =>
        !planOrderIds.includes(o.id) &&
        (o.status === 'PENDING' || o.status === 'CONFIRMED')
    );

    const unplannedStockProductions = stockProductions.filter(sp =>
        !planStockProdIds.includes(sp.id)
    );

    return (
        <TableContainer>
            <Table>
                <TableHead>
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
                                <TableHead>
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
                                <TableHead>
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

const ProductionPlansTable = ({ plans, onEdit, onDelete, onComplete, onPrint, onDeleteAttachment, onOpenFiles, readonly }) => {
    return (
        <TableContainer>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>계획일</TableCell>
                        <TableCell>수주번호</TableCell>
                        <TableCell>거래처</TableCell>
                        <TableCell>수주일</TableCell>
                        <TableCell>납기일</TableCell>
                        <TableCell>금액</TableCell>
                        <TableCell>상태</TableCell>
                        <TableCell>공정 수</TableCell>
                        <TableCell>첨부파일</TableCell>
                        <TableCell>관리</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {plans.length === 0 ? (
                        <TableRow><TableCell colSpan={10} align="center">데이터가 없습니다.</TableCell></TableRow>
                    ) : (
                        plans.map((plan) => (
                            <Row
                                key={plan.id}
                                plan={plan}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onComplete={onComplete}
                                onPrint={onPrint}
                                onDeleteAttachment={onDeleteAttachment}
                                onOpenFiles={onOpenFiles}
                                readonly={readonly}
                            />
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const Row = ({ plan, onEdit, onDelete, onComplete, onPrint, onOpenFiles, readonly }) => {
    const [open, setOpen] = useState(false);
    const order = plan.order; // Used order from plan (eager loaded)

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
                hover
            >
                <TableCell>{plan.plan_date}</TableCell>
                <TableCell>
                    {plan.order ? (
                        <><Chip label="수주" size="small" variant="outlined" sx={{ mr: 0.5, fontSize: '0.7rem', height: 20 }} /> {plan.order.order_no}</>
                    ) : plan.stock_production ? (
                        <><Chip label="재고" size="small" variant="outlined" color="success" sx={{ mr: 0.5, fontSize: '0.7rem', height: 20 }} /> {plan.stock_production.production_no}</>
                    ) : plan.order_id || plan.stock_production_id}
                </TableCell>
                <TableCell>{plan.order?.partner?.name || '사내 생산(재고)'}</TableCell>
                <TableCell>{order?.order_date || '-'}</TableCell>
                <TableCell>{order?.delivery_date || '-'}</TableCell>
                <TableCell>{order?.total_amount?.toLocaleString() || '0'}</TableCell>
                <TableCell><Chip label={plan.status} color={plan.status === 'COMPLETED' ? "success" : "primary"} variant="outlined" /></TableCell>
                <TableCell>{plan.items?.length || 0}</TableCell>
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
                                    <IconButton size="small" color="primary" onClick={() => onPrint(plan)} title="생산관리시트출력">
                                        <PrintIcon />
                                    </IconButton>
                                    <IconButton size="small" color="primary" onClick={() => onEdit(plan)} title="수정">
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => onDelete(plan.id)} title="삭제">
                                        <DeleteIcon />
                                    </IconButton>
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
                                        <Typography variant="body2" color="textSecondary" display="inline">
                                            수량: {group.items.length > 0 ? group.items[0].quantity : 0} {group.product_unit}
                                        </Typography>
                                    </Box>

                                    <Table size="small" aria-label="process-list">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell width="5%">순번</TableCell>
                                                <TableCell width="15%">공정명</TableCell>
                                                <TableCell width="10%">구분</TableCell>
                                                <TableCell width="15%">외주/구매/작업자</TableCell>
                                                <TableCell width="15%">배정 장비</TableCell>
                                                <TableCell width="15%">작업내용</TableCell>
                                                <TableCell width="10%">예상시간</TableCell>
                                                <TableCell width="10%">상태</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {group.items.sort((a, b) => a.sequence - b.sequence).map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{item.sequence}</TableCell>
                                                    <TableCell>{item.process_name}</TableCell>
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
                                                    <TableCell>{item.estimated_time}</TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={item.status}
                                                            size="small"
                                                            variant="outlined"
                                                            color={item.status === 'COMPLETED' ? 'success' : 'default'}
                                                        />
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
