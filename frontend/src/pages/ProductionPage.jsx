import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Tabs, Tab, IconButton, Collapse } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, CheckCircle as CheckIcon, Print as PrintIcon, Description as DescIcon } from '@mui/icons-material';
import { X, FileText, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';
import ProductionPlanModal from '../components/ProductionPlanModal';
import ProductionSheetModal from '../components/ProductionSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';
import ResizableTableCell from '../components/ResizableTableCell';

const ProductionPage = () => {
    // Add Print Styles
    useEffect(() => {
        // Redundant - now handled globally in index.css
    }, []);
    const [tabIndex, setTabIndex] = useState(0);
    const [orders, setOrders] = useState([]);
    const [stockProductions, setStockProductions] = useState([]);
    const [plans, setPlans] = useState([]);
    const [allPlannedIds, setAllPlannedIds] = useState({ orders: [], stocks: [] });

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
            const params = {};
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;
            const response = await api.get('/sales/orders/', { params }); // Fetch all to include PENDING
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
                } else {
                    params.partner_id = filterPartner;
                }
            }
            if (searchQuery) params.product_name = searchQuery;
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;

            const response = await api.get('/production/plans/', { params });
            setPlans(response.data);

            // Update planned IDs if no BU filter is applied (to get comprehensive list)
            // Or better, fetch a separate comprehensive list when needed
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
            // Fetch without filters but with high limit to get all planned IDs for exclusion logic
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
            if (!window.confirm("?앹궛 ?꾨즺???댁뿭?낅땲?? ??젣 ???꾩젣???ш퀬媛 李④컧?섍퀬 ?곌퀎 諛쒖＜媛 '?湲?濡?蹂듭썝?⑸땲?? 怨꾩냽?섏떆寃좎뒿?덇퉴?")) return;
        } else {
            if (!window.confirm("?뺣쭚濡????앹궛 怨꾪쉷????젣?섏떆寃좎뒿?덇퉴? 愿???섏＜???湲??곹깭濡?蹂듭썝?⑸땲??")) return;
        }

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
            fetchAllPlannedIds();
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
            const files = safeParseJSON(plan.attachment_file, []);
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
            const files = safeParseJSON(item.attachment_file, []);
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
        fetchAllPlannedIds();
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
            <Typography variant="h4" gutterBottom component="div" sx={{ mb: 4, fontWeight: 'bold', color: '#1a237e' }} className="no-print">
                ?앹궛 愿由?
            </Typography>

            <Paper sx={{ width: '100%', mb: 2 }} className="print-safe-area">
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
                    <Tab label="?앹궛 ?湲??섏＜" />
                    <Tab label="?앹궛?꾪솴" />
                    <Tab label="?앹궛 ?꾨즺" />
                </Tabs>

                <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', bgcolor: '#fcfcfc' }}>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 150 }}>
                        <Typography variant="body2" color="textSecondary">?ъ뾽遺:</Typography>
                        <div style={{ flex: 1 }}>
                            <Select
                                isClearable
                                placeholder="?꾩껜 ?ъ뾽遺"
                                options={groups.filter(g => g.type === 'MAJOR').map(g => ({ value: g.id.toString(), label: g.name }))}
                                value={groups.find(g => g.id.toString() === selectedMajorGroupId) ? { value: selectedMajorGroupId, label: groups.find(g => g.id.toString() === selectedMajorGroupId).name } : null}
                                onChange={(opt) => setSelectedMajorGroupId(opt ? opt.value : '')}
                                styles={{
                                    control: (base) => ({ ...base, minHeight: '32px', height: '32px', fontSize: '0.875rem' }),
                                    valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                    input: (base) => ({ ...base, margin: '0' }),
                                    indicatorsContainer: (base) => ({ ...base, height: '32px' }),
                                }}
                            />
                        </div>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                        <Typography variant="body2" color="textSecondary">嫄곕옒泥?</Typography>
                        <div style={{ flex: 1 }}>
                            <Select
                                isClearable
                                placeholder="?꾩껜 嫄곕옒泥?
                                options={[
                                    { value: 'all', label: '?꾩껜 嫄곕옒泥? },
                                    { value: 'internal', label: '?щ궡(?ш퀬)' },
                                    ...partners.map(p => ({ value: p.id.toString(), label: p.name }))
                                ]}
                                value={filterPartner === 'all' ? { value: 'all', label: '?꾩껜 嫄곕옒泥? } :
                                    filterPartner === 'internal' ? { value: 'internal', label: '?щ궡(?ш퀬)' } :
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
                        <Typography variant="body2" color="textSecondary">?덈챸/?덈쾲:</Typography>
                        <input
                            type="text"
                            placeholder="寃?됱뼱 ?낅젰..."
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
                            setSelectedMajorGroupId('');
                        }}
                    >
                        ?꾪꽣 珥덇린??
                    </Button>
                </Box>

                <Box sx={{ p: 3 }}>
                    {tabIndex === 0 && (
                        <UnplannedOrdersTable
                            orders={orders}
                            stockProductions={stockProductions}
                            plannedIds={allPlannedIds}
                            onCreatePlan={handleCreateClick}
                            searchQuery={searchQuery}
                            filterPartner={filterPartner}
                            selectedMajorGroupId={selectedMajorGroupId}
                            groups={groups}
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
            </Paper >

            <ProductionPlanModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                order={selectedOrder}
                stockProduction={selectedStockProduction}
                plan={selectedPlan}
                tabIndex={tabIndex}
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

const UnplannedOrdersTable = ({ orders, stockProductions, plannedIds, onCreatePlan, searchQuery, filterPartner, selectedMajorGroupId, groups }) => {
    const [colWidths, setColWidths] = useState({
        no: 150,
        partner: 150,
        product: 250,
        date: 120,
        delivery: 120,
        note: 200,
        amount: 120,
        action: 120
    });

    const handleResize = (colKey) => (newWidth) => {
        setColWidths(prev => ({ ...prev, [colKey]: newWidth }));
    };
    const planOrderIds = plannedIds?.orders || [];
    const planStockProdIds = plannedIds?.stocks || [];

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
            <Table sx={{ tableLayout: 'fixed', minWidth: 1000 }}>
                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
                    <TableRow>
                        <ResizableTableCell width={colWidths.no} onResize={handleResize('no')}>?섏＜/?ш퀬踰덊샇</ResizableTableCell>
                        <ResizableTableCell width={colWidths.partner} onResize={handleResize('partner')}>嫄곕옒泥?/ResizableTableCell>
                        <ResizableTableCell width={colWidths.product} onResize={handleResize('product')}>?덈챸</ResizableTableCell>
                        <ResizableTableCell width={colWidths.date} onResize={handleResize('date')}>?깅줉??/ResizableTableCell>
                        <ResizableTableCell width={colWidths.delivery} onResize={handleResize('delivery')}>?⑷린??/ResizableTableCell>
                        <ResizableTableCell width={colWidths.note} onResize={handleResize('note')}>鍮꾧퀬</ResizableTableCell>
                        <ResizableTableCell width={colWidths.amount} onResize={handleResize('amount')}>湲덉븸</ResizableTableCell>
                        <ResizableTableCell width={colWidths.action} onResize={handleResize('action')}>?묒뾽</ResizableTableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {unplannedOrders.length === 0 && unplannedStockProductions.length === 0 ? (
                        <TableRow><TableCell colSpan={8} align="center">?앹궛 ?湲?以묒씤 ??ぉ???놁뒿?덈떎.</TableCell></TableRow>
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
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <Chip label="?섏＜" size="small" variant="outlined" sx={{ mr: 1 }} />
                    {order.order_no}
                </TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{order.partner?.name}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {(() => {
                        const first = order.items?.[0]?.product?.name || '';
                        const cnt = (order.items?.length || 1) - 1;
                        return cnt > 0 ? `${first} ??${cnt}嫄? : first;
                    })()}
                </TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{order.order_date}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{order.delivery_date}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: colWidths?.note || 200 }} title={order.note}>{order.note || '-'}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{order.total_amount?.toLocaleString()}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => onCreatePlan(order)}>
                        怨꾪쉷 ?섎┰
                    </Button>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
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
                onDoubleClick={() => onCreatePlan(null, stockProduction)}
            >
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <Chip label="?ш퀬?앹궛" size="small" sx={{ mr: 1, bgcolor: '#e8f5e9', color: '#2e7d32' }} />
                    {stockProduction.production_no}
                </TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{stockProduction.partner?.name || '?щ궡 (?먯껜 ?앹궛)'}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{stockProduction.product?.name || ''}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{stockProduction.request_date}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{stockProduction.target_date || '-'}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: colWidths?.note || 200 }} title={stockProduction.note}>{stockProduction.note || '-'}</TableCell>
                <TableCell sx={{ color: '#666', fontStyle: 'italic', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>-</TableCell>
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
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
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

const ProductionPlansTable = ({ plans, defects, onEdit, onDelete, onComplete, onConfirm, onPrint, onDeleteAttachment, onOpenFiles, onOpenProcessFiles, onShowDefects, onShowOrder, onShowStock, onRefresh, readonly }) => {
    const [colWidths, setColWidths] = useState({
        arrow: 40,
        no: 200,
        partner: 130,
        product: 250,
        delivery: 100,
        amount: 100,
        note: 150,
        status: 100,
        defect: 50,
        processCount: 70,
        cost: 110,
        attach: 70,
        manage: 180
    });

    const handleResize = (colKey) => (newWidth) => {
        setColWidths(prev => ({ ...prev, [colKey]: newWidth }));
    };

    return (
        <TableContainer sx={{ boxShadow: 'none' }}>
            <Table sx={{ tableLayout: 'fixed', minWidth: 1200 }}>
                <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
                    <TableRow>
                        <ResizableTableCell width={colWidths.arrow} onResize={handleResize('arrow')} />
                        <ResizableTableCell width={colWidths.no} onResize={handleResize('no')}>?섏＜/?ш퀬踰덊샇</ResizableTableCell>
                        <ResizableTableCell width={colWidths.partner} onResize={handleResize('partner')}>嫄곕옒泥?/ResizableTableCell>
                        <ResizableTableCell width={colWidths.product} onResize={handleResize('product')}>?덈챸</ResizableTableCell>
                        <ResizableTableCell width={colWidths.delivery} onResize={handleResize('delivery')}>?⑷린??/ResizableTableCell>
                        <ResizableTableCell width={colWidths.amount} onResize={handleResize('amount')}>湲덉븸</ResizableTableCell>
                        <ResizableTableCell width={colWidths.note} onResize={handleResize('note')}>鍮꾧퀬</ResizableTableCell>
                        <ResizableTableCell width={colWidths.status} onResize={handleResize('status')}>?곹깭</ResizableTableCell>
                        <ResizableTableCell width={colWidths.defect} onResize={handleResize('defect')}>遺덈웾</ResizableTableCell>
                        <ResizableTableCell width={colWidths.processCount} onResize={handleResize('processCount')}>怨듭젙??/ResizableTableCell>
                        <ResizableTableCell width={colWidths.cost} onResize={handleResize('cost')}>珥?怨듭젙 鍮꾩슜</ResizableTableCell>
                        <ResizableTableCell width={colWidths.attach} onResize={handleResize('attach')}>泥⑤??뚯씪</ResizableTableCell>
                        <ResizableTableCell width={colWidths.manage} onResize={handleResize('manage')}>愿由?/ResizableTableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {plans.length === 0 ? (
                        <TableRow><TableCell colSpan={13} align="center">?곗씠?곌? ?놁뒿?덈떎.</TableCell></TableRow>
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
                                onConfirm={onConfirm}
                            />
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const ProcessRow = ({ item, colWidths, defects, typeMap, onShowDefects, onRefresh, onOpenProcessFiles }) => {
    const [open, setOpen] = useState(false);

    return (
        <React.Fragment>
            <TableRow
                sx={{
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: '#f0f7ff' },
                    backgroundColor: open ? '#f8fbff' : 'inherit',
                    transition: 'background-color 0.2s'
                }}
                onClick={() => setOpen(!open)}
            >
                <TableCell>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                        {open ? <KeyboardArrowUp sx={{ fontSize: 18 }} /> : <KeyboardArrowDown sx={{ fontSize: 18 }} />}
                    </IconButton>
                    {item.sequence}
                </TableCell>
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
                    )
                    }
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
                <TableCell onClick={(e) => e.stopPropagation()}>
                    <select
                        value={item.status}
                        onChange={async (e) => {
                            const newStatus = e.target.value;
                            if (newStatus === 'COMPLETED' && (item.course_type === 'PURCHASE' || item.course_type === 'OUTSOURCING')) {
                                if (!window.confirm(`'${item.process_name}' 怨듭젙???꾨즺 泥섎━?섏떆寃좎뒿?덇퉴?\n???묒뾽怨??곌껐??諛쒖＜/?몄＜ 諛쒖＜媛 ?④퍡 '泥섎━?꾨즺' ?곹깭濡?蹂寃쎈맆 ???덉뒿?덈떎.`)) {
                                    return;
                                }
                            }
                            try {
                                await api.patch(`/production/plan-items/${item.id}`, { status: newStatus });
                                if (onRefresh) onRefresh();
                            } catch (err) {
                                console.error("Status update error", err);
                                alert("?곹깭 蹂寃?以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
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
                        <option value="PLANNED">怨꾪쉷</option>
                        <option value="IN_PROGRESS">吏꾪뻾以?/option>
                        <option value="COMPLETED">?꾨즺</option>
                    </select>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {(() => {
                            let localFiles = safeParseJSON(item.attachment_file, []);
                            localFiles = localFiles.filter(f => f && (typeof f === 'object' || (typeof f === 'string' && f.trim() !== ''))).map(f => typeof f === 'string' ? { name: f.split?.('/')?.pop() || '?뚯씪', url: f } : f);

                            let externalFiles = [];
                            if (item.course_type === 'PURCHASE' && item.purchase_items?.length > 0 && item.purchase_items[0].purchase_order?.attachment_file) {
                                const poFiles = safeParseJSON(item.purchase_items[0].purchase_order.attachment_file);
                                externalFiles = poFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split?.('/')?.pop() || '?뚯씪' } : f), name: `[援щℓ] ${(typeof f === 'string' ? f.split?.('/')?.pop() || '?뚯씪' : f.name)}`, isExternal: true }));
                            } else if (item.course_type === 'OUTSOURCING' && item.outsourcing_items?.length > 0 && item.outsourcing_items[0].outsourcing_order?.attachment_file) {
                                const outFiles = safeParseJSON(item.outsourcing_items[0].outsourcing_order.attachment_file);
                                externalFiles = outFiles.filter(f => f).map(f => ({ ...(typeof f === 'string' ? { url: f, name: f.split?.('/')?.pop() || '?뚯씪' } : f), name: `[?몄＜] ${(typeof f === 'string' ? f.split?.('/')?.pop() || '?뚯씪' : f.name)}`, isExternal: true }));
                            }

                            const allFiles = [...externalFiles, ...localFiles];

                            return (
                                <>
                                    {allFiles.length > 0 && (
                                        <IconButton
                                            size="small"
                                            color="primary"
                                            onClick={() => {
                                                if (onOpenProcessFiles) {
                                                    onOpenProcessFiles(allFiles, `${item.process_name} 泥⑤? ?뚯씪`);
                                                }
                                            }}
                                        >
                                            <FileText className="w-4 h-4" />
                                        </IconButton>
                                    )}
                                </>
                            );
                        })()}
                    </Box>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0, border: 'none' }} colSpan={12}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1.5, p: 2, bgcolor: '#ffffff', borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #e3f2fd' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1976d2', display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <DescIcon fontSize="small" /> ?묒뾽 ?ㅼ쟻 諛??곸꽭 濡쒓렇
                                </Typography>
                            </Box>

                            {!item.work_log_items || item.work_log_items.length === 0 ? (
                                <Typography variant="body2" color="textSecondary" sx={{ py: 2, textAlign: 'center', fontStyle: 'italic' }}>
                                    ?깅줉???묒뾽 ?ㅼ쟻???놁뒿?덈떎.
                                </Typography>
                            ) : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: '#f1f8ff' }}>
                                            <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>?묒뾽??/TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>?묒뾽 ?쇱떆</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '15%' }} align="right">?섎웾 (?묓뭹/遺덈웾)</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '35%' }}>?묒뾽 ?댁슜</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>泥⑤??뚯씪</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {item.work_log_items.map((logItem) => {
                                            let logFiles = [];
                                            try {
                                                if (logItem.work_log?.attachment_file) {
                                                    const parsed = safeParseJSON(logItem.work_log.attachment_file, []);
                                                    logFiles = Array.isArray(parsed) ? parsed : [parsed];
                                                }
                                            } catch { }

                                            return (
                                                <TableRow key={logItem.id} hover>
                                                    <TableCell>{logItem.worker?.name || logItem.work_log?.worker?.name || '-'}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem' }}>
                                                        {logItem.work_log?.work_date}<br />
                                                        <span style={{ color: '#666' }}>
                                                            {logItem.start_time ? new Date(logItem.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                            {logItem.end_time ? ` ~ ${new Date(logItem.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>{logItem.good_quantity}</span>
                                                        <span style={{ color: '#ccc', margin: '0 4px' }}>/</span>
                                                        <span style={{ color: '#d32f2f' }}>{logItem.bad_quantity}</span>
                                                    </TableCell>
                                                    <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{logItem.note || '-'}</TableCell>
                                                    <TableCell>
                                                        {logFiles.length > 0 && (
                                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                                {logFiles.map((file, fIdx) => (
                                                                    <Chip
                                                                        key={fIdx}
                                                                        label={typeof file === 'string' ? file.split('/').pop() : file.name}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        clickable
                                                                        component="a"
                                                                        href={typeof file === 'string' ? file : file.url}
                                                                        target="_blank"
                                                                        sx={{
                                                                            fontSize: '0.65rem',
                                                                            maxWidth: 100,
                                                                            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }
                                                                        }}
                                                                        icon={<FileText className="w-3 h-3" />}
                                                                    />
                                                                ))}
                                                            </Box>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

const Row = ({ plan, defects, onEdit, onDelete, onComplete, onConfirm, onPrint, onOpenFiles, onOpenProcessFiles, onShowDefects, onShowOrder, onShowStock, readonly, onRefresh }) => {
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
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {plan.order?.partner?.name || plan.stock_production?.partner?.name || '?щ궡 (?먯껜 ?앹궛)'}
                </TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {(() => {
                        const uniqueProducts = [];
                        plan.items?.forEach(item => {
                            const pName = item.product?.name || item.product_name;
                            if (pName && !uniqueProducts.includes(pName)) {
                                uniqueProducts.push(pName);
                            }
                        });
                        if (plan.order && plan.order.items) {
                            plan.order.items.forEach(item => {
                                const pName = item.product?.name || item.product_name;
                                if (pName && !uniqueProducts.includes(pName)) {
                                    uniqueProducts.push(pName);
                                }
                            });
                        } else if (plan.stock_production) {
                            const pName = plan.stock_production.product?.name;
                            if (pName && !uniqueProducts.includes(pName)) uniqueProducts.push(pName);
                        }
                        
                        const first = uniqueProducts[0] || '';
                        const cnt = uniqueProducts.length - 1;
                        return cnt > 0 ? `${first} ??${cnt}嫄? : first;
                    })()}
                </TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{order?.delivery_date || '-'}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{order?.total_amount?.toLocaleString() || '0'}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: colWidths?.note || 150 }} title={order?.note || sp?.note}>
                    {order?.note || sp?.note || '-'}
                </TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
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
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{plan.items?.length || 0}</TableCell>
                <TableCell sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {(() => {
                        const totalCost = plan.items?.reduce((sum, item) => {
                            return sum + (item.cost || 0);
                        }, 0) || 0;

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
                        const fileList = safeParseJSON(plan.attachment_file, []);
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
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={13}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div" sx={{ color: '#1a237e', fontWeight: 'bold' }}>
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
                                            ?앹궛紐⑺몴(Gross): {group.items[0]?.gross_quantity || ((group.items[0]?.quantity || 0) + (group.items[0]?.stock_use_quantity || 0))} {group.product_unit}
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                            ?ш퀬?뚯쭊: {group.items[0]?.stock_use_quantity || 0} {group.product_unit}
                                        </Typography>
                                        <Typography variant="body2" fontWeight="bold" display="inline" sx={{ mr: 2, color: '#d32f2f' }}>
                                            ?ㅼ깮?곕웾(Net): {group.items[0]?.quantity || 0} {group.product_unit}
                                        </Typography>
                                        <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#c62828', bgcolor: '#ffebee', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block', mr: 2 }}>
                                            珥?怨듭젙 鍮꾩슜: {group.items.reduce((sum, item) => sum + (item.cost || 0), 0).toLocaleString()} ??
                                        </Typography>
                                    </Box>

                                    <Table size="small" aria-label="process-list" sx={{ tableLayout: 'fixed' }}>
                                        <TableHead sx={{ '& th': { color: '#000000 !important', fontWeight: 'bold' } }}>
                                            <TableRow>
                                                <ResizableTableCell width={colWidths.seq} onResize={handleResize('seq')}>?쒕쾲</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.process} onResize={handleResize('process')}>怨듭젙紐?/ResizableTableCell>
                                                <ResizableTableCell width={colWidths.type} onResize={handleResize('type')}>援щ텇</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.partner} onResize={handleResize('partner')}>?몄＜/援щℓ/?묒뾽??/ResizableTableCell>
                                                <ResizableTableCell width={colWidths.equip} onResize={handleResize('equip')}>諛곗젙 ?λ퉬</ResizableTableCell>
                                                <ResizableTableCell onResize={handleResize('note')}>?묒뾽?댁슜</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.period} onResize={handleResize('period')}>?묒뾽湲곌컙</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.progress} onResize={handleResize('progress')}>吏꾪뻾?곹솴</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.cost} onResize={handleResize('cost')}>怨듭젙鍮꾩슜</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.status} onResize={handleResize('status')}>?곹깭</ResizableTableCell>
                                                <ResizableTableCell width={colWidths.attach} onResize={handleResize('attach')}>泥⑤?</ResizableTableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {group.items.sort((a, b) => a.sequence - b.sequence).map((item) => (
                                                <ProcessRow
                                                    key={item.id}
                                                    item={item}
                                                    colWidths={colWidths}
                                                    defects={defects}
                                                    typeMap={typeMap}
                                                    onShowDefects={onShowDefects}
                                                    onRefresh={onRefresh}
                                                    onOpenProcessFiles={onOpenProcessFiles}
                                                />
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
