import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Tabs, Tab, IconButton, Collapse } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, CheckCircle as CheckIcon, Print as PrintIcon, Description as DescIcon } from '@mui/icons-material';
import { X, FileText, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import ProductionPlanModal from '../components/ProductionPlanModal';
import ProductionSheetModal from '../components/ProductionSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';

// Resizable Table Cell Component
const ResizableTableCell = ({ width, minWidth = 50, onResize, children, ...props }) => {
    const [isResizing, setIsResizing] = useState(false);
    const cellRef = React.useRef(null);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);

        const startX = e.pageX;
        const startWidth = cellRef.current.offsetWidth;

        const handleMouseMove = (mouseMoveEvent) => {
            const newWidth = Math.max(minWidth, startWidth + (mouseMoveEvent.pageX - startX));
            if (onResize) onResize(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [minWidth, onResize]);

    return (
        <TableCell
            ref={cellRef}
            {...props}
            style={{ ...props.style, width, position: 'relative' }}
        >
            {children}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '5px',
                    cursor: 'col-resize',
                    backgroundColor: isResizing ? '#2196f3' : 'transparent',
                    zIndex: 1,
                }}
                onMouseEnter={(e) => {
                    if (!isResizing) e.target.style.backgroundColor = 'rgba(33, 150, 243, 0.2)';
                }}
                onMouseLeave={(e) => {
                    if (!isResizing) e.target.style.backgroundColor = 'transparent';
                }}
            />
        </TableCell>
    );
};

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
        fetchPlans();
        fetchPartners();
        fetchDefects();
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
            if (!window.confirm("?앹궛 ?꾨즺???댁뿭?낅땲?? 吏꾪뻾 以??곹깭濡??섎룎由ъ떆寃좎뒿?덇퉴?\n\n[二쇱쓽]\n- 異붽????ш퀬媛 李④컧?⑸땲??\n- ?곌퀎???먯옱/?몄＜ 諛쒖＜媛 '?湲? ?곹깭濡??먮났?⑸땲??")) return;
            try {
                await api.patch(`/production/plans/${planId}/status?status=IN_PROGRESS`);
                alert("?곹깭媛 '吏꾪뻾 以??쇰줈 蹂寃쎈릺?덉쑝硫??ш퀬 諛?諛쒖＜ ?댁뿭???먮났?섏뿀?듬땲??");
                fetchPlans();
                fetchOrders();
            } catch (error) {
                console.error("Revert failed", error);
                alert("?곹깭 蹂寃??ㅽ뙣: " + (error.response?.data?.detail || error.message));
            }
            return;
        }

        if (!window.confirm("?뺣쭚濡????앹궛 怨꾪쉷????젣?섏떆寃좎뒿?덇퉴? 愿???섏＜???湲??곹깭濡?蹂듭썝?⑸땲??")) return;

        // Ask whether to also delete related orders
        const deleteRelated = window.confirm(
            "?곌????먯옱諛쒖＜/?몄＜諛쒖＜ ?댁뿭???덉쓣 ???덉뒿?덈떎.\n\n" +
            "[?뺤씤] ???곌? 諛쒖＜ ?댁뿭???④퍡 ??젣\n" +
            "[痍⑥냼] ???앹궛 怨꾪쉷留???젣 (諛쒖＜ ?댁뿭 ?좎?)"
        );

        try {
            await api.delete(`/production/plans/${planId}?delete_related_orders=${deleteRelated}`);
            alert("??젣?섏뿀?듬땲??");
            fetchPlans();
            fetchOrders();
        } catch (error) {
            console.error("Delete failed", error);
            alert("??젣 ?ㅽ뙣: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleConfirmPlan = async (planId) => {
        if (!window.confirm("?앹궛 怨꾪쉷???뺤젙?섏떆寃좎뒿?덇퉴? ?뺤젙 ???먮룞?쇰줈 ?먯옱 ?뚯슂??MRP)???곗텧?섍퀬 誘몃컻二?紐⑸줉???깅줉?⑸땲??")) return;
        try {
            await api.patch(`/production/plans/${planId}/status?status=CONFIRMED`);
            alert("怨꾪쉷???뺤젙?섏뿀?듬땲?? ?먯옱援щℓ愿由ъ뿉??MRP 由ъ뒪?몃? ?뺤씤??二쇱꽭??");
            fetchPlans();
        } catch (error) {
            console.error("Confirm failed", error);
            alert("?뺤젙 泥섎━ ?ㅽ뙣");
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
                        warningMessage += `- [援щℓ] ${item.product?.name || '?덈ぉ'}???먯옱 諛쒖＜媛 ?꾨즺?섏? ?딆븯?듬땲??\n`;
                    }
                }
                // Check Outsourcing Items
                if (item.outsourcing_items && item.outsourcing_items.length > 0) {
                    const incompleteOutsourcing = item.outsourcing_items.some(oi => oi.outsourcing_order?.status !== 'COMPLETED');
                    if (incompleteOutsourcing) {
                        hasIncompleteDependencies = true;
                        warningMessage += `- [?몄＜] ${item.product?.name || '?덈ぉ'}???몄＜ 諛쒖＜媛 ?꾨즺?섏? ?딆븯?듬땲??\n`;
                    }
                }
            }
        }

        let confirmMessage = "??怨꾪쉷??'?꾨즺' 泥섎━?섏떆寃좎뒿?덇퉴?";
        if (hasIncompleteDependencies) {
            confirmMessage = "?ㅼ쓬 ??ぉ??諛쒖＜/?몄＜媛 ?꾨즺?섏? ?딆븯?듬땲??\n\n" + warningMessage + "\n洹몃옒???꾨즺?섏떆寃좎뒿?덇퉴?";
        }

        if (!window.confirm(confirmMessage)) return;

        try {
            await api.patch(`/production/plans/${planId}/status?status=COMPLETED`);
            alert("?꾨즺 泥섎━?섏뿀?듬땲??");
            fetchPlans();
        } catch (error) {
            console.error("Complete failed", error);
            alert("?꾨즺 泥섎━ ?ㅽ뙣");
        }
    };

    const handleDeleteAttachment = async (plan, idxToRemove) => {
        if (!window.confirm("?뺣쭚濡???泥⑤??뚯씪????젣?섏떆寃좎뒿?덇퉴? (???묒뾽? ?섎룎由????놁뒿?덈떎)")) return;

        try {
            const files = typeof plan.attachment_file === 'string' ? JSON.parse(plan.attachment_file) : plan.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== idxToRemove);

            await api.put(`/production/plans/${plan.id}`, {
                attachment_file: newFiles
            });

            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("泥⑤??뚯씪????젣?섏뿀?듬땲??");
            fetchPlans(); // Refresh the list
        } catch (e) {
            console.error("Delete attachment failed", e);
            alert("泥⑤??뚯씪 ??젣 ?ㅽ뙣");
        }
    };

    const handleDeleteItemAttachment = async (item, idxToRemove) => {
        if (!window.confirm("?뺣쭚濡???泥⑤??뚯씪????젣?섏떆寃좎뒿?덇퉴? (???묒뾽? ?섎룎由????놁뒿?덈떎)")) return;

        try {
            const files = typeof item.attachment_file === 'string' ? JSON.parse(item.attachment_file) : item.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== idxToRemove);

            await api.patch(`/production/plan-items/${item.id}`, {
                attachment_file: newFiles
            });

            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("泥⑤??뚯씪????젣?섏뿀?듬땲??");
            fetchPlans();
        } catch (e) {
            console.error("Delete item attachment failed", e);
            alert("泥⑤??뚯씪 ??젣 ?ㅽ뙣");
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
    const completedPlans = plans.filter(p => {
        if (p.status !== 'COMPLETED') return false;

        // Partner Filter
        if (filterPartner !== 'all') {
            if (filterPartner === 'internal') {
                if (p.order_id) return false;
            } else {
                if (p.order?.partner_id !== parseInt(filterPartner)) return false;
            }
        }

        // Date Filter (Plan Date)
        if (startDate && p.plan_date < startDate) return false;
        if (endDate && p.plan_date > endDate) return false;

        return true;
    });

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h4" gutterBottom component="div" sx={{ mb: 4, fontWeight: 'bold', color: '#1a237e' }}>
                ?앹궛 愿由?
            </Typography>

            <Paper sx={{ width: '100%', mb: 2 }}>
                <Tabs
                    value={tabIndex}
                    onChange={handleTabChange}
                    indicatorColor="primary"
                    textColor="primary"
                    sx={{
                        '& .MuiTab-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .Mui-selected': { color: '#fff !important' },
                    }}
                >
                    <Tab label="?앹궛 ?湲??섏＜" />
                    <Tab label="?앹궛?꾪솴" />
                    <Tab label="?앹궛 ?꾨즺" />
                </Tabs>

                {tabIndex === 2 && (
                    <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', gap: 2, alignItems: 'center', bgcolor: '#fcfcfc' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="textSecondary">湲곌컙:</Typography>
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="textSecondary">嫄곕옒泥?</Typography>
                            <select
                                value={filterPartner}
                                onChange={(e) => setFilterPartner(e.target.value)}
                                style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '120px' }}
                            >
                                <option value="all">?꾩껜 嫄곕옒泥?/option>
                                <option value="internal">?щ궡(?ш퀬)</option>
                                {partners.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </Box>
                        <Button
                            size="small"
                            variant="outlined"
                            color="inherit"
                            onClick={() => {
                                setStartDate('');
                                setEndDate('');
                                setFilterPartner('all');
                            }}
                        >
                            ?꾪꽣 珥덇린??
                        </Button>
                    </Box>
                )}

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
                            defects={defects}
                            onEdit={handleEditClick}
                            onDelete={handleDeletePlan}
                            onComplete={handleCompletePlan}
                            onConfirm={handleConfirmPlan}
                            onPrint={handlePrintClick}
                            onDeleteAttachment={handleDeleteAttachment}
                            onOpenFiles={(files, plan) => {
                                setViewingFiles(files);
                                setViewingFileTitle(plan?.order?.order_no || '泥⑤? ?뚯씪');
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
                                setViewingFileTitle(plan?.order?.order_no || '泥⑤? ?뚯씪');
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
                sheetType={sheetType}
                onSave={fetchPlans}
            />

            {showFileModal && (
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
            )}

            {viewOrderOpen && (
                <OrderModal
                    isOpen={viewOrderOpen}
                    onClose={() => setViewOrderOpen(false)}
                    partners={partners}
                    orderToEdit={itemToView}
                    onSuccess={() => { }} // View only, so no success handler needed or just fetchPlans
                />
            )}

            {viewStockOpen && (
                <StockProductionModal
                    isOpen={viewStockOpen}
                    onClose={() => setViewStockOpen(false)}
                    partners={partners}
                    stockProductionToEdit={itemToView}
                    onSuccess={() => { }}
                />
            )}

            <DefectInfoModal
                isOpen={defectModalOpen}
                onClose={() => setDefectModalOpen(false)}
                defects={selectedDefects}
            />
        </Box>
    );
};

const DefectInfoModal = ({ isOpen, onClose, defects }) => {
    if (!defects || defects.length === 0) return null;
    return (
        <FileViewerModal
            isOpen={isOpen}
            onClose={onClose}
            title="遺덈웾 諛쒖깮 ?댁뿭"
            files={[]} // Not used but required by FileViewerModal structural similarity if I were to use it, but better use a simple Box/Paper
        >
            <Box sx={{ p: 2, minWidth: 400 }}>
                <Typography variant="h6" color="error" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AlertCircle /> 遺덈웾 ?댁뿭 ({defects.length}嫄?
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#fff5f5', '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                            <TableRow>
                                <TableCell>諛쒖깮??/TableCell>
                                <TableCell>?ъ쑀</TableCell>
                                <TableCell align="right">?섎웾</TableCell>
                                <TableCell align="right">?먯떎 鍮꾩슜</TableCell>
                                <TableCell>?곹깭</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {defects.map(d => (
                                <TableRow key={d.id}>
                                    <TableCell>{new Date(d.defect_date).toLocaleDateString()}</TableCell>
                                    <TableCell>{d.defect_reason}</TableCell>
                                    <TableCell align="right">{d.quantity} EA</TableCell>
                                    <TableCell align="right" sx={{ color: '#d32f2f' }}>{d.amount.toLocaleString()} ??/TableCell>
                                    <TableCell><Chip label={d.status} size="small" color={d.status === 'RESOLVED' ? 'success' : 'error'} variant="outlined" /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose} variant="outlined">?リ린</Button>
                </Box>
            </Box>
        </FileViewerModal>
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
                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                    <TableRow>
                        <TableCell>?섏＜踰덊샇</TableCell>
                        <TableCell>嫄곕옒泥?/TableCell>
                        <TableCell>?섏＜??/TableCell>
                        <TableCell>?⑷린??/TableCell>
                        <TableCell>湲덉븸</TableCell>
                        <TableCell>?묒뾽</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {unplannedOrders.length === 0 && unplannedStockProductions.length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center">?앹궛 ?湲?以묒씤 ??ぉ???놁뒿?덈떎.</TableCell></TableRow>
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
                    <Chip label="?섏＜" size="small" variant="outlined" sx={{ mr: 1 }} />
                    {order.order_no}
                </TableCell>
                <TableCell>{order.partner?.name}</TableCell>
                <TableCell>{order.order_date}</TableCell>
                <TableCell>{order.delivery_date}</TableCell>
                <TableCell>{order.total_amount?.toLocaleString()}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => onCreatePlan(order)}>
                        怨꾪쉷 ?섎┰
                    </Button>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                ?섏＜ ?덈ぉ 紐⑸줉
                            </Typography>
                            <Table size="small" aria-label="purchases">
                                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                    <TableRow>
                                        <TableCell>?덈챸</TableCell>
                                        <TableCell>洹쒓꺽</TableCell>
                                        <TableCell>?⑥쐞</TableCell>
                                        <TableCell>?섎웾</TableCell>
                                        <TableCell>鍮꾧퀬</TableCell>
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
                    <Chip label="?ш퀬?앹궛" size="small" sx={{ mr: 1, bgcolor: '#e8f5e9', color: '#2e7d32' }} />
                    {stockProduction.production_no}
                </TableCell>
                <TableCell>?щ궡 (?먯껜 ?앹궛)</TableCell>
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
                        怨꾪쉷 ?섎┰
                    </Button>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                ?ш퀬 ?앹궛 ?덈ぉ ?곸꽭
                            </Typography>
                            <Table size="small">
                                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                    <TableRow>
                                        <TableCell>?덈챸</TableCell>
                                        <TableCell>洹쒓꺽</TableCell>
                                        <TableCell>?⑥쐞</TableCell>
                                        <TableCell>?섎웾</TableCell>
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
        <TableContainer>
            <Table>
                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                    <TableRow>
                        <TableCell />
                        <TableCell>?섏＜/?ш퀬踰덊샇</TableCell>
                        <TableCell>嫄곕옒泥?/TableCell>
                        <TableCell>?⑷린??/TableCell>
                        <TableCell>湲덉븸</TableCell>
                        <TableCell>?곹깭</TableCell>
                        <TableCell>遺덈웾</TableCell>
                        <TableCell>怨듭젙 ??/TableCell>
                        <TableCell>珥?怨듭젙 鍮꾩슜</TableCell>
                        <TableCell>泥⑤??뚯씪</TableCell>
                        <TableCell>愿由?/TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {plans.length === 0 ? (
                        <TableRow><TableCell colSpan={11} align="center">?곗씠?곌? ?놁뒿?덈떎.</TableCell></TableRow>
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
        'INTERNAL': '?щ궡',
        'PURCHASE': '援щℓ',
        'OUTSOURCING': '?몄＜'
    };

    return (
        <React.Fragment>
            <TableRow
                sx={{ '& > *': { borderBottom: 'unset' }, cursor: 'pointer' }}
                onClick={() => setOpen(!open)}
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
                            <Chip label="?섏＜" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#e3f2fd', color: '#1976d2', border: 'none' }} />
                            <Typography
                                variant="body2"
                                color="primary"
                            >
                                {order.order_no}
                            </Typography>
                        </Box>
                    ) : sp ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip label="?ш퀬" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#f3e5f5', color: '#7b1fa2', border: 'none' }} />
                            <Typography
                                variant="body2"
                                color="secondary"
                            >
                                {sp.production_no || `Stock-${sp.id}`}
                            </Typography>
                        </Box>
                    ) : '-'}
                </TableCell>
                <TableCell>{plan.order?.partner?.name || '?щ궡 ?앹궛(?ш퀬)'}</TableCell>
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
                        title="遺덈웾 ?댁뿭 蹂닿린"
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
                                    {totalCost.toLocaleString()} ??
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
                                    title="泥⑤??뚯씪 蹂닿린/?ㅼ슫濡쒕뱶"
                                >
                                    <FileText className="w-3 h-3" />
                                    {fileList.length}媛?
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
                                    <IconButton size="small" color="primary" onClick={() => onPrint(plan, 'PRODUCTION')} title="?앹궛愿由ъ떆?몄텧??>
                                        <PrintIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="primary" onClick={() => onEdit(plan)} title="?섏젙">
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => onDelete(plan.id)} title="??젣">
                                        <DeleteIcon />
                                    </IconButton>
                                    {plan.status === 'PLANNED' && (
                                        <IconButton size="small" color="secondary" onClick={() => onConfirm(plan.id)} title="怨꾪쉷 ?뺤젙 (MRP ?ㅽ뻾)">
                                            <CheckIcon />
                                        </IconButton>
                                    )}
                                    <IconButton size="small" color="success" onClick={() => onComplete(plan.id)} title="?앹궛 ?꾨즺">
                                        <CheckIcon />
                                    </IconButton>
                                </>
                            ) : (
                                <IconButton size="small" color="error" onClick={() => onDelete(plan.id)} title="?앹궛 ?꾨즺 痍⑥냼 (??젣)">
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
                                ?앹궛 怨듭젙 ?곸꽭
                            </Typography>

                            {Object.entries(groupedItems).map(([productId, group]) => (
                                <Paper key={productId} variant="outlined" sx={{ mb: 2, p: 2, backgroundColor: '#fafafa' }}>
                                    <Box sx={{ mb: 1 }}>
                                        <Typography variant="subtitle1" fontWeight="bold" display="inline" sx={{ mr: 2, color: '#1565c0' }}>
                                            ?덈챸: {group.product_name}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                            洹쒓꺽: {group.product_spec || '-'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                            ?섎웾: {group.items.length > 0 ? group.items[0].quantity : 0} {group.product_unit}
                                        </Typography>
                                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#c62828', bgcolor: '#ffebee', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block', mr: 2 }}>
                                            珥?怨듭젙 鍮꾩슜: {group.items.reduce((sum, item) => sum + (item.cost || 0), 0).toLocaleString()} ??
                                        </Typography>
                                        {(() => {
                                            const groupItemIds = group.items.map(i => i.id);
                                            const groupDefectCost = defects?.filter(d => groupItemIds.includes(d.plan_item_id)).reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
                                            if (groupDefectCost > 0) {
                                                return (
                                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#d32f2f', display: 'inline-block' }}>
                                                        - {groupDefectCost.toLocaleString()} ??(遺덈웾)
                                                    </Typography>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </Box>

                                    <Table size="small" aria-label="process-list" sx={{ tableLayout: 'fixed' }}>
                                        <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                            <TableRow>
                                                <ResizableTableCell width={colWidths.seq} onResize={handleResize('seq')}>?쒕쾲</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.process} onResize={handleResize('process')}>怨듭젙紐?/ResizableTableCell>
                                                <ResizableTableCell width={colWidths.type} onResize={handleResize('type')}>援щ텇</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.partner} onResize={handleResize('partner')}>?몄＜/援щℓ/?묒뾽??/ResizableTableCell>
                                                <ResizableTableCell width={colWidths.equip} onResize={handleResize('equip')}>諛곗젙 ?λ퉬</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.note} onResize={handleResize('note')}>?묒뾽?댁슜</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.period} onResize={handleResize('period')}>?묒뾽湲곌컙</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.progress} onResize={handleResize('progress')}>吏꾪뻾?곹솴</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.cost} onResize={handleResize('cost')}>怨듭젙鍮꾩슜</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.status} onResize={handleResize('status')}>?곹깭</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.attach} onResize={handleResize('attach')}>泥⑤?</ResizableTableCell>
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
                                                            item.worker?.name || <span className="text-gray-400 italic">誘몃같??/span>
                                                        ) : (
                                                            item.partner_name || '-'
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.course_type === 'INTERNAL' ? (
                                                            item.equipment?.name || <span className="text-gray-400 italic">誘몃같??/span>
                                                        ) : (
                                                            <span className="text-gray-500 font-light">?ъ쇅</span>
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
                                                                try {
                                                                    await api.patch(`/production/plan-items/${item.id}`, { status: e.target.value });
                                                                    if (onRefresh) onRefresh();
                                                                } catch (err) {
                                                                    console.error("Status update error", err);
                                                                    // Only alert if it's truly an error (axios throws on non-2xx)
                                                                    alert("?곹깭 蹂寃?以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
                                                                }
                                                            }}
                                                            style={{
                                                                padding: '2px 4px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.75rem',
                                                                border: '1px solid ' + (item.status === 'COMPLETED' ? '#4caf50' : '#ccc'),
                                                                backgroundColor: item.status === 'COMPLETED' ? '#e8f5e9' : (item.course_type !== 'INTERNAL' ? '#f5f5f5' : 'white'),
                                                                cursor: item.course_type !== 'INTERNAL' ? 'not-allowed' : 'pointer'
                                                            }}
                                                        >
                                                            <option value="PLANNED">怨꾪쉷</option>
                                                            <option value="IN_PROGRESS">吏꾪뻾以?/option>
                                                            <option value="COMPLETED">?꾨즺</option>
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
                                                                localFiles = localFiles.filter(f => f && (typeof f === 'object' || (typeof f === 'string' && f.trim() !== ''))).map(f => typeof f === 'string' ? { name: f.split('/').pop(), url: f } : f);

                                                                // 2. Parse external order's files (Read-only)
                                                                let externalFiles = [];
                                                                if (item.course_type === 'PURCHASE' && item.purchase_items?.length > 0 && item.purchase_items[0].purchase_order?.attachment_file) {
                                                                    try {
                                                                        let poFiles = item.purchase_items[0].purchase_order.attachment_file;
                                                                        poFiles = typeof poFiles === 'string' ? JSON.parse(poFiles) : poFiles;
                                                                        if (!Array.isArray(poFiles)) poFiles = [poFiles];
                                                                        externalFiles = poFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split('/').pop() } : f), name: `[援щℓ] ${(typeof f === 'string' ? f.split('/').pop() : f.name)}`, isExternal: true }));
                                                                    } catch (e) { }
                                                                } else if (item.course_type === 'OUTSOURCING' && item.outsourcing_items?.length > 0 && item.outsourcing_items[0].outsourcing_order?.attachment_file) {
                                                                    try {
                                                                        let outFiles = item.outsourcing_items[0].outsourcing_order.attachment_file;
                                                                        outFiles = typeof outFiles === 'string' ? JSON.parse(outFiles) : outFiles;
                                                                        if (!Array.isArray(outFiles)) outFiles = [outFiles];
                                                                        externalFiles = outFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split('/').pop() } : f), name: `[?몄＜] ${(typeof f === 'string' ? f.split('/').pop() : f.name)}`, isExternal: true }));
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
                                                                                            alert("?몃?(諛쒖＜/?몄＜) 臾몄꽌??泥⑤????뚯씪? ?대떦 臾몄꽌?먯꽌留???젣 媛?ν빀?덈떎.");
                                                                                            return;
                                                                                        }
                                                                                        const targetIdxInLocal = localFiles.findIndex(f => f.url === targetFile.url && f.name === targetFile.name);
                                                                                        if (targetIdxInLocal !== -1) {
                                                                                            handleDeleteItemAttachment(item, targetIdxInLocal);
                                                                                        }
                                                                                    };
                                                                                    if (onOpenProcessFiles) {
                                                                                        onOpenProcessFiles(allFiles, `${item.process_name} 泥⑤? ?뚯씪`, onDelete);
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
                                                                                    alert("?뚯씪 ?낅줈???ㅽ뙣");
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

