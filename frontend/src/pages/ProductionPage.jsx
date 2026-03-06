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
            if (!window.confirm("?ùÏÇ∞ ?ÑÎ£å???¥Ïó≠?ÖÎãà?? ÏßÑÌñâ Ï§??ÅÌÉúÎ°??òÎèåÎ¶¨ÏãúÍ≤†Ïäµ?àÍπå?\n\n[Ï£ºÏùò]\n- Ï∂îÍ????¨Í≥†Í∞Ä Ï∞®Í∞ê?©Îãà??\n- ?∞Í≥Ñ???êÏû¨/?∏Ï£º Î∞úÏ£ºÍ∞Ä '?ÄÍ∏? ?ÅÌÉúÎ°??êÎ≥µ?©Îãà??")) return;
            try {
                await api.patch(`/production/plans/${planId}/status?status=IN_PROGRESS`);
                alert("?ÅÌÉúÍ∞Ä 'ÏßÑÌñâ Ï§??ºÎ°ú Î≥ÄÍ≤ΩÎêò?àÏúºÎ©??¨Í≥† Î∞?Î∞úÏ£º ?¥Ïó≠???êÎ≥µ?òÏóà?µÎãà??");
                fetchPlans();
                fetchOrders();
            } catch (error) {
                console.error("Revert failed", error);
                alert("?ÅÌÉú Î≥ÄÍ≤??§Ìå®: " + (error.response?.data?.detail || error.message));
            }
            return;
        }

        if (!window.confirm("?ïÎßêÎ°????ùÏÇ∞ Í≥ÑÌöç????†ú?òÏãúÍ≤†Ïäµ?àÍπå? Í¥Ä???òÏ£º???ÄÍ∏??ÅÌÉúÎ°?Î≥µÏõê?©Îãà??")) return;

        // Ask whether to also delete related orders
        const deleteRelated = window.confirm(
            "?∞Í????êÏû¨Î∞úÏ£º/?∏Ï£ºÎ∞úÏ£º ?¥Ïó≠???àÏùÑ ???àÏäµ?àÎã§.\n\n" +
            "[?ïÏù∏] ???∞Í? Î∞úÏ£º ?¥Ïó≠???®Íªò ??†ú\n" +
            "[Ï∑®ÏÜå] ???ùÏÇ∞ Í≥ÑÌöçÎß???†ú (Î∞úÏ£º ?¥Ïó≠ ?†Ï?)"
        );

        try {
            await api.delete(`/production/plans/${planId}?delete_related_orders=${deleteRelated}`);
            alert("??†ú?òÏóà?µÎãà??");
            fetchPlans();
            fetchOrders();
        } catch (error) {
            console.error("Delete failed", error);
            alert("??†ú ?§Ìå®: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleConfirmPlan = async (planId) => {
        if (!window.confirm("?ùÏÇ∞ Í≥ÑÌöç???ïÏ†ï?òÏãúÍ≤†Ïäµ?àÍπå? ?ïÏ†ï ???êÎèô?ºÎ°ú ?êÏû¨ ?åÏöî??MRP)???∞Ï∂ú?òÍ≥† ÎØ∏Î∞úÏ£?Î™©Î°ù???±Î°ù?©Îãà??")) return;
        try {
            await api.patch(`/production/plans/${planId}/status?status=CONFIRMED`);
            alert("Í≥ÑÌöç???ïÏ†ï?òÏóà?µÎãà?? ?êÏû¨Íµ¨Îß§Í¥ÄÎ¶¨Ïóê??MRP Î¶¨Ïä§?∏Î? ?ïÏù∏??Ï£ºÏÑ∏??");
            fetchPlans();
        } catch (error) {
            console.error("Confirm failed", error);
            alert("?ïÏ†ï Ï≤òÎ¶¨ ?§Ìå®");
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
                        warningMessage += `- [Íµ¨Îß§] ${item.product?.name || '?àÎ™©'}???êÏû¨ Î∞úÏ£ºÍ∞Ä ?ÑÎ£å?òÏ? ?äÏïò?µÎãà??\n`;
                    }
                }
                // Check Outsourcing Items
                if (item.outsourcing_items && item.outsourcing_items.length > 0) {
                    const incompleteOutsourcing = item.outsourcing_items.some(oi => oi.outsourcing_order?.status !== 'COMPLETED');
                    if (incompleteOutsourcing) {
                        hasIncompleteDependencies = true;
                        warningMessage += `- [?∏Ï£º] ${item.product?.name || '?àÎ™©'}???∏Ï£º Î∞úÏ£ºÍ∞Ä ?ÑÎ£å?òÏ? ?äÏïò?µÎãà??\n`;
                    }
                }
            }
        }

        let confirmMessage = "??Í≥ÑÌöç??'?ÑÎ£å' Ï≤òÎ¶¨?òÏãúÍ≤†Ïäµ?àÍπå?";
        if (hasIncompleteDependencies) {
            confirmMessage = "?§Ïùå ??™©??Î∞úÏ£º/?∏Ï£ºÍ∞Ä ?ÑÎ£å?òÏ? ?äÏïò?µÎãà??\n\n" + warningMessage + "\nÍ∑∏Îûò???ÑÎ£å?òÏãúÍ≤†Ïäµ?àÍπå?";
        }

        if (!window.confirm(confirmMessage)) return;

        try {
            await api.patch(`/production/plans/${planId}/status?status=COMPLETED`);
            alert("?ÑÎ£å Ï≤òÎ¶¨?òÏóà?µÎãà??");
            fetchPlans();
        } catch (error) {
            console.error("Complete failed", error);
            alert("?ÑÎ£å Ï≤òÎ¶¨ ?§Ìå®");
        }
    };

    const handleDeleteAttachment = async (plan, idxToRemove) => {
        if (!window.confirm("?ïÎßêÎ°???Ï≤®Î??åÏùº????†ú?òÏãúÍ≤†Ïäµ?àÍπå? (???ëÏóÖ?Ä ?òÎèåÎ¶????ÜÏäµ?àÎã§)")) return;

        try {
            const files = typeof plan.attachment_file === 'string' ? JSON.parse(plan.attachment_file) : plan.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== idxToRemove);

            await api.put(`/production/plans/${plan.id}`, {
                attachment_file: newFiles
            });

            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("Ï≤®Î??åÏùº????†ú?òÏóà?µÎãà??");
            fetchPlans(); // Refresh the list
        } catch (e) {
            console.error("Delete attachment failed", e);
            alert("Ï≤®Î??åÏùº ??†ú ?§Ìå®");
        }
    };

    const handleDeleteItemAttachment = async (item, idxToRemove) => {
        if (!window.confirm("?ïÎßêÎ°???Ï≤®Î??åÏùº????†ú?òÏãúÍ≤†Ïäµ?àÍπå? (???ëÏóÖ?Ä ?òÎèåÎ¶????ÜÏäµ?àÎã§)")) return;

        try {
            const files = typeof item.attachment_file === 'string' ? JSON.parse(item.attachment_file) : item.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== idxToRemove);

            await api.patch(`/production/plan-items/${item.id}`, {
                attachment_file: newFiles
            });

            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("Ï≤®Î??åÏùº????†ú?òÏóà?µÎãà??");
            fetchPlans();
        } catch (e) {
            console.error("Delete item attachment failed", e);
            alert("Ï≤®Î??åÏùº ??†ú ?§Ìå®");
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
                ?ùÏÇ∞ Í¥ÄÎ¶?
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
                    <Tab label="?ùÏÇ∞ ?ÄÍ∏??òÏ£º" />
                    <Tab label="?ùÏÇ∞?ÑÌô©" />
                    <Tab label="?ùÏÇ∞ ?ÑÎ£å" />
                </Tabs>

                {tabIndex === 2 && (
                    <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', gap: 2, alignItems: 'center', bgcolor: '#fcfcfc' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="textSecondary">Í∏∞Í∞Ñ:</Typography>
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
                            <Typography variant="body2" color="textSecondary">Í±∞ÎûòÏ≤?</Typography>
                            <select
                                value={filterPartner}
                                onChange={(e) => setFilterPartner(e.target.value)}
                                style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '120px' }}
                            >
                                <option value="all">?ÑÏ≤¥ Í±∞ÎûòÏ≤?/option>
                                <option value="internal">?¨ÎÇ¥(?¨Í≥†)</option>
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
                            ?ÑÌÑ∞ Ï¥àÍ∏∞??
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
                                setViewingFileTitle(plan?.order?.order_no || 'Ï≤®Î? ?åÏùº');
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
                                setViewingFileTitle(plan?.order?.order_no || 'Ï≤®Î? ?åÏùº');
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
            title="Î∂àÎüâ Î∞úÏÉù ?¥Ïó≠"
            files={[]} // Not used but required by FileViewerModal structural similarity if I were to use it, but better use a simple Box/Paper
        >
            <Box sx={{ p: 2, minWidth: 400 }}>
                <Typography variant="h6" color="error" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AlertCircle /> Î∂àÎüâ ?¥Ïó≠ ({defects.length}Í±?
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#fff5f5' }}>
                            <TableRow>
                                <TableCell>Î∞úÏÉù??/TableCell>
                                <TableCell>?¨Ïú†</TableCell>
                                <TableCell align="right">?òÎüâ</TableCell>
                                <TableCell align="right">?êÏã§ ÎπÑÏö©</TableCell>
                                <TableCell>?ÅÌÉú</TableCell>
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
                    <Button onClick={onClose} variant="outlined">?´Í∏∞</Button>
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
                        <TableCell>?òÏ£ºÎ≤àÌò∏</TableCell>
                        <TableCell>Í±∞ÎûòÏ≤?/TableCell>
                        <TableCell>?òÏ£º??/TableCell>
                        <TableCell>?©Í∏∞??/TableCell>
                        <TableCell>Í∏àÏï°</TableCell>
                        <TableCell>?ëÏóÖ</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {unplannedOrders.length === 0 && unplannedStockProductions.length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center">?ùÏÇ∞ ?ÄÍ∏?Ï§ëÏù∏ ??™©???ÜÏäµ?àÎã§.</TableCell></TableRow>
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
                    <Chip label="?òÏ£º" size="small" variant="outlined" sx={{ mr: 1 }} />
                    {order.order_no}
                </TableCell>
                <TableCell>{order.partner?.name}</TableCell>
                <TableCell>{order.order_date}</TableCell>
                <TableCell>{order.delivery_date}</TableCell>
                <TableCell>{order.total_amount?.toLocaleString()}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => onCreatePlan(order)}>
                        Í≥ÑÌöç ?òÎ¶Ω
                    </Button>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                ?òÏ£º ?àÎ™© Î™©Î°ù
                            </Typography>
                            <Table size="small" aria-label="purchases">
                                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                    <TableRow>
                                        <TableCell>?àÎ™Ö</TableCell>
                                        <TableCell>Í∑úÍ≤©</TableCell>
                                        <TableCell>?®ÏúÑ</TableCell>
                                        <TableCell>?òÎüâ</TableCell>
                                        <TableCell>ÎπÑÍ≥†</TableCell>
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
                    <Chip label="?¨Í≥†?ùÏÇ∞" size="small" sx={{ mr: 1, bgcolor: '#e8f5e9', color: '#2e7d32' }} />
                    {stockProduction.production_no}
                </TableCell>
                <TableCell>?¨ÎÇ¥ (?êÏ≤¥ ?ùÏÇ∞)</TableCell>
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
                        Í≥ÑÌöç ?òÎ¶Ω
                    </Button>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                ?¨Í≥† ?ùÏÇ∞ ?àÎ™© ?ÅÏÑ∏
                            </Typography>
                            <Table size="small">
                                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                    <TableRow>
                                        <TableCell>?àÎ™Ö</TableCell>
                                        <TableCell>Í∑úÍ≤©</TableCell>
                                        <TableCell>?®ÏúÑ</TableCell>
                                        <TableCell>?òÎüâ</TableCell>
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
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }} />
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>?òÏ£º/?¨Í≥†Î≤àÌò∏</TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>Í±∞ÎûòÏ≤?/TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>?©Í∏∞??/TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>Í∏àÏï°</TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>?ÅÌÉú</TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>Î∂àÎüâ</TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>Í≥µÏ†ï ??/TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>Ï¥?Í≥µÏ†ï ÎπÑÏö©</TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>Ï≤®Î??åÏùº</TableCell>
                        <TableCell sx={{ color: '#000000 !important', fontWeight: 'bold' }}>Í¥ÄÎ¶?/TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {plans.length === 0 ? (
                        <TableRow><TableCell colSpan={11} align="center">?∞Ïù¥?∞Í? ?ÜÏäµ?àÎã§.</TableCell></TableRow>
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
        'INTERNAL': '?¨ÎÇ¥',
        'PURCHASE': 'Íµ¨Îß§',
        'OUTSOURCING': '?∏Ï£º'
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
                            <Chip label="?òÏ£º" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#e3f2fd', color: '#1976d2', border: 'none' }} />
                            <Typography
                                variant="body2"
                                color="primary"
                            >
                                {order.order_no}
                            </Typography>
                        </Box>
                    ) : sp ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Chip label="?¨Í≥†" size="small" sx={{ height: 20, fontSize: '0.65rem', backgroundColor: '#f3e5f5', color: '#7b1fa2', border: 'none' }} />
                            <Typography
                                variant="body2"
                                color="secondary"
                            >
                                {sp.production_no || `Stock-${sp.id}`}
                            </Typography>
                        </Box>
                    ) : '-'}
                </TableCell>
                <TableCell>{plan.order?.partner?.name || '?¨ÎÇ¥ ?ùÏÇ∞(?¨Í≥†)'}</TableCell>
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
                        title="Î∂àÎüâ ?¥Ïó≠ Î≥¥Í∏∞"
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
                                    title="Ï≤®Î??åÏùº Î≥¥Í∏∞/?§Ïö¥Î°úÎìú"
                                >
                                    <FileText className="w-3 h-3" />
                                    {fileList.length}Í∞?
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
                                    <IconButton size="small" color="primary" onClick={() => onPrint(plan, 'PRODUCTION')} title="?ùÏÇ∞Í¥ÄÎ¶¨Ïãú?∏Ï∂ú??>
                                        <PrintIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="primary" onClick={() => onEdit(plan)} title="?òÏ†ï">
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => onDelete(plan.id)} title="??†ú">
                                        <DeleteIcon />
                                    </IconButton>
                                    {plan.status === 'PLANNED' && (
                                        <IconButton size="small" color="secondary" onClick={() => onConfirm(plan.id)} title="Í≥ÑÌöç ?ïÏ†ï (MRP ?§Ìñâ)">
                                            <CheckIcon />
                                        </IconButton>
                                    )}
                                    <IconButton size="small" color="success" onClick={() => onComplete(plan.id)} title="?ùÏÇ∞ ?ÑÎ£å">
                                        <CheckIcon />
                                    </IconButton>
                                </>
                            ) : (
                                <IconButton size="small" color="error" onClick={() => onDelete(plan.id)} title="?ùÏÇ∞ ?ÑÎ£å Ï∑®ÏÜå (??†ú)">
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
                                ?ùÏÇ∞ Í≥µÏ†ï ?ÅÏÑ∏
                            </Typography>

                            {Object.entries(groupedItems).map(([productId, group]) => (
                                <Paper key={productId} variant="outlined" sx={{ mb: 2, p: 2, backgroundColor: '#fafafa' }}>
                                    <Box sx={{ mb: 1 }}>
                                        <Typography variant="subtitle1" fontWeight="bold" display="inline" sx={{ mr: 2, color: '#1565c0' }}>
                                            ?àÎ™Ö: {group.product_name}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                            Í∑úÍ≤©: {group.product_spec || '-'}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                            ?òÎüâ: {group.items.length > 0 ? group.items[0].quantity : 0} {group.product_unit}
                                        </Typography>
                                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#c62828', bgcolor: '#ffebee', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block', mr: 2 }}>
                                            Ï¥?Í≥µÏ†ï ÎπÑÏö©: {group.items.reduce((sum, item) => sum + (item.cost || 0), 0).toLocaleString()} ??
                                        </Typography>
                                        {(() => {
                                            const groupItemIds = group.items.map(i => i.id);
                                            const groupDefectCost = defects?.filter(d => groupItemIds.includes(d.plan_item_id)).reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
                                            if (groupDefectCost > 0) {
                                                return (
                                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#d32f2f', display: 'inline-block' }}>
                                                        - {groupDefectCost.toLocaleString()} ??(Î∂àÎüâ)
                                                    </Typography>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </Box>

                                    <Table size="small" aria-label="process-list" sx={{ tableLayout: 'fixed' }}>
                                        <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                            <TableRow>
                                                <ResizableTableCell width={colWidths.seq} onResize={handleResize('seq')}>?úÎ≤à</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.process} onResize={handleResize('process')}>Í≥µÏ†ïÎ™?/ResizableTableCell>
                                                <ResizableTableCell width={colWidths.type} onResize={handleResize('type')}>Íµ¨Î∂Ñ</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.partner} onResize={handleResize('partner')}>?∏Ï£º/Íµ¨Îß§/?ëÏóÖ??/ResizableTableCell>
                                                <ResizableTableCell width={colWidths.equip} onResize={handleResize('equip')}>Î∞∞Ï†ï ?•ÎπÑ</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.note} onResize={handleResize('note')}>?ëÏóÖ?¥Ïö©</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.period} onResize={handleResize('period')}>?ëÏóÖÍ∏∞Í∞Ñ</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.progress} onResize={handleResize('progress')}>ÏßÑÌñâ?ÅÌô©</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.cost} onResize={handleResize('cost')}>Í≥µÏ†ïÎπÑÏö©</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.status} onResize={handleResize('status')}>?ÅÌÉú</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.attach} onResize={handleResize('attach')}>Ï≤®Î?</ResizableTableCell>
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
                                                            item.worker?.name || <span className="text-gray-400 italic">ÎØ∏Î∞∞??/span>
                                                        ) : (
                                                            item.partner_name || '-'
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.course_type === 'INTERNAL' ? (
                                                            item.equipment?.name || <span className="text-gray-400 italic">ÎØ∏Î∞∞??/span>
                                                        ) : (
                                                            <span className="text-gray-500 font-light">?¨Ïô∏</span>
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
                                                                    alert("?ÅÌÉú Î≥ÄÍ≤?Ï§??§Î•òÍ∞Ä Î∞úÏÉù?àÏäµ?àÎã§.");
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
                                                            <option value="PLANNED">Í≥ÑÌöç</option>
                                                            <option value="IN_PROGRESS">ÏßÑÌñâÏ§?/option>
                                                            <option value="COMPLETED">?ÑÎ£å</option>
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
                                                                        externalFiles = poFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split('/').pop() } : f), name: `[Íµ¨Îß§] ${(typeof f === 'string' ? f.split('/').pop() : f.name)}`, isExternal: true }));
                                                                    } catch (e) { }
                                                                } else if (item.course_type === 'OUTSOURCING' && item.outsourcing_items?.length > 0 && item.outsourcing_items[0].outsourcing_order?.attachment_file) {
                                                                    try {
                                                                        let outFiles = item.outsourcing_items[0].outsourcing_order.attachment_file;
                                                                        outFiles = typeof outFiles === 'string' ? JSON.parse(outFiles) : outFiles;
                                                                        if (!Array.isArray(outFiles)) outFiles = [outFiles];
                                                                        externalFiles = outFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split('/').pop() } : f), name: `[?∏Ï£º] ${(typeof f === 'string' ? f.split('/').pop() : f.name)}`, isExternal: true }));
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
                                                                                            alert("?∏Î?(Î∞úÏ£º/?∏Ï£º) Î¨∏ÏÑú??Ï≤®Î????åÏùº?Ä ?¥Îãπ Î¨∏ÏÑú?êÏÑúÎß???†ú Í∞Ä?•Ìï©?àÎã§.");
                                                                                            return;
                                                                                        }
                                                                                        const targetIdxInLocal = localFiles.findIndex(f => f.url === targetFile.url && f.name === targetFile.name);
                                                                                        if (targetIdxInLocal !== -1) {
                                                                                            handleDeleteItemAttachment(item, targetIdxInLocal);
                                                                                        }
                                                                                    };
                                                                                    if (onOpenProcessFiles) {
                                                                                        onOpenProcessFiles(allFiles, `${item.process_name} Ï≤®Î? ?åÏùº`, onDelete);
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
                                                                                    alert("?åÏùº ?ÖÎ°ú???§Ìå®");
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
