import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Paper, IconButton, Typography, Box, Select, MenuItem,
    Autocomplete
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon, DragIndicator } from '@mui/icons-material';
import api from '../lib/api';

const PLAN_COL_STORAGE_KEY = 'mes_plan_modal_col_widths_v1';
const DEFAULT_PLAN_COL_WIDTHS = {
    drag: 40,
    sequence: 65,
    process_name: 170,
    course_type: 110,
    assignee: 160,
    equipment: 145,
    work_content: 190,
    start_date: 135,
    end_date: 135,
    cost: 135,
    quantity: 90,
    actions: 65,
};

const PlanResizableHeaderCell = ({ colKey, width, minWidth = 45, onResize, align, children }) => {
    const [resizing, setResizing] = useState(false);

    const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setResizing(true);
        const startX = e.clientX;
        const startW = width;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (moveEvent) => {
            const nextW = Math.max(minWidth, Math.round(startW + (moveEvent.clientX - startX)));
            onResize(colKey, nextW);
        };
        const onMouseUp = () => {
            setResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    return (
        <TableCell
            align={align}
            sx={{
                width: `${width}px`,
                minWidth: `${width}px`,
                maxWidth: `${width}px`,
                position: 'relative',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pr: 1.5,
                fontWeight: 700,
                boxSizing: 'border-box',
            }}
        >
            {children}
            <Box
                onMouseDown={handleMouseDown}
                title="드래그하여 칸 너비 조절"
                sx={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '6px',
                    cursor: 'col-resize',
                    zIndex: 10,
                    backgroundColor: resizing ? '#1976d2' : 'transparent',
                    '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.35)' },
                }}
            />
        </TableCell>
    );
};

const ProductionPlanModal = ({ isOpen, onClose, onSuccess, order, stockProduction, plan, tabIndex }) => {
    const isCompleted = plan?.status === 'COMPLETED';
    const [items, setItems] = useState([]);
    const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [partners, setPartners] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [equipments, setEquipments] = useState([]);
    const [productStocks, setProductStocks] = useState({}); // { product_id: current_stock }
    const [productStockDetails, setProductStockDetails] = useState({}); // { product_id: { current, otherReserved, availCurrent, producingSp, availSp, maxAllocatable } }
    const [stockUseQtys, setStockUseQtys] = useState({}); // { product_id: use_qty }
    const [masterProcesses, setMasterProcesses] = useState([]); // Master process list
    const [colWidths, setColWidths] = useState(() => {
        try {
            const saved = localStorage.getItem(PLAN_COL_STORAGE_KEY);
            return saved ? { ...DEFAULT_PLAN_COL_WIDTHS, ...JSON.parse(saved) } : DEFAULT_PLAN_COL_WIDTHS;
        } catch {
            return DEFAULT_PLAN_COL_WIDTHS;
        }
    });

    const handleColResize = (key, nextWidth) => {
        setColWidths(prev => {
            const updated = { ...prev, [key]: nextWidth };
            try {
                localStorage.setItem(PLAN_COL_STORAGE_KEY, JSON.stringify(updated));
            } catch {
                // ignore storage errors
            }
            return updated;
        });
    };

    const resetColWidths = () => {
        setColWidths(DEFAULT_PLAN_COL_WIDTHS);
        try {
            localStorage.removeItem(PLAN_COL_STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    const totalTableWidth = Object.values(colWidths).reduce((sum, w) => sum + (Number(w) || 0), 0);

    const isSalesOrderPlan = Boolean(order || plan?.order_id || plan?.order);

    const buildStockMaps = (stockList, ownReservedMap = {}, isSO = true) => {
        const stockMap = {};
        const detailMap = {};
        (stockList || []).forEach(s => {
            const pid = s.product_id;
            const ownRes = ownReservedMap[pid] || 0;
            const totalRes = s.reserved_quantity || 0;
            const otherReserved = Math.max(0, totalRes - ownRes);
            const physicalCurrent = s.current_quantity || 0;
            const producingSp = s.producing_sp || 0;
            const availCurrent = Math.max(0, physicalCurrent - otherReserved);
            const reservedFromSpByOthers = Math.max(0, otherReserved - Math.max(0, physicalCurrent));
            const availSp = isSO ? Math.max(0, producingSp - reservedFromSpByOthers) : 0;
            const maxAllocatable = availCurrent + availSp;

            stockMap[pid] = maxAllocatable;
            detailMap[pid] = {
                current: physicalCurrent,
                otherReserved,
                availCurrent,
                producingSp,
                availSp,
                maxAllocatable
            };
        });
        setProductStocks(stockMap);
        setProductStockDetails(detailMap);
    };


    // Drag and Drop Refs
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (isOpen) {
            // Fetch partners, staff, and equipments
            api.get('/basics/partners/', { params: { type: 'SUBCONTRACTOR' } }).then(res => setPartners(res.data)).catch(() => { });
            api.get('/basics/staff/').then(res => setStaffList(res.data)).catch(() => { });
            api.get('/basics/equipments/').then(res => setEquipments(res.data)).catch(() => { });
            api.get('/product/processes/').then(res => setMasterProcesses(res.data)).catch(() => { });
            if (plan) {
                // Edit Mode
                setPlanDate(plan.plan_date);
                setItems(plan.items.map(item => ({
                    ...item,
                    cid: Math.random().toString(36).substr(2, 9),
                    unit_cost: item.cost && item.quantity ? Math.round(item.cost / item.quantity) : 0,
                    product_spec: item.product?.specification || "",
                    product_unit: item.product?.unit || "EA",
                    product: item.product, // Ensure product object is here
                    gross_quantity: item.gross_quantity || (item.quantity + (item.stock_use_quantity || 0))
                })));

                // [FIX] Initialize stock use quantities in edit mode
                const initialStockUse = {};
                plan.items.forEach(item => {
                    if (item.product_id) {
                        initialStockUse[item.product_id] = item.stock_use_quantity || 0;
                    }
                });
                setStockUseQtys(initialStockUse);
                
                // Fetch stocks for the existing products
                const productIds = [...new Set(plan.items.map(i => i.product_id))];
                api.get('/inventory/stocks', { params: { product_ids: productIds.join(',') } })
                    .then(res => {
                        buildStockMaps(res.data, initialStockUse, Boolean(plan?.order_id || plan?.order));
                    }).catch(() => { });
            } else if (order || stockProduction) {
                // Create Mode
                setPlanDate(new Date().toISOString().split('T')[0]);
                
                const initCreateMode = async () => {
                    const sourceItems = order ? order.items : (stockProduction ? (stockProduction.items || [{ 
                        product: stockProduction.product, 
                        quantity: stockProduction.quantity, 
                        product_id: stockProduction.product_id 
                    }]) : []);
                    
                    if (sourceItems.length === 0) return;


                    // Fetch fresh product details to ensure we have standard_processes
                    const productIds = sourceItems.map(si => si.product_id);
                    const productMap = {};
                    
                    try {
                        const validPids = [...new Set(productIds.filter(pid => pid && !isNaN(parseInt(pid))))];
                        await Promise.all(validPids.map(async (pid) => {
                            try {
                                const res = await api.get(`/product/products/${pid}`);
                                productMap[pid] = res.data;
                            } catch (err) {
                                console.error(`Failed to fetch product ${pid}`, err);
                            }
                        }));
                    } catch (err) {
                        console.error("General failure in product details fetch", err);
                    }

                    // Fetch stocks
                    try {
                        const res = await api.get('/inventory/stocks', { params: { product_ids: productIds.join(',') } });
                        buildStockMaps(res.data, {}, Boolean(order));
                    } catch (err) {
                        console.error("Failed to fetch stocks", err);
                    }


                    const defaultItems = [];
                    const initialStockUse = {};

                    sourceItems.forEach(sourceItem => {
                        const productId = sourceItem.product_id;
                        const product = productMap[productId] || sourceItem.product;
                        const processes = product?.standard_processes || [];
                        
                        // 이미 납품 완료된 품목은 생산계획에서 제외
                        const deliveredQty = sourceItem.delivered_quantity || 0;
                        const remainQty = (sourceItem.quantity || 0) - deliveredQty;
                        if (remainQty <= 0) return; // 납품 완료 품목 건너뜀
                        
                        const grossQty = remainQty; // 잔여 수량만 계획 대상
                        
                        initialStockUse[productId] = 0;

                        if (processes.length > 0) {
                            processes.sort((a, b) => a.sequence - b.sequence).forEach(proc => {
                                defaultItems.push({
                                    cid: Math.random().toString(36).substr(2, 9),
                                    product_id: productId,
                                    product_name: product?.name || "Unknown",
                                    product_spec: product?.specification || "",
                                    product_unit: product?.unit || "EA",
                                    product: product, 
                                    process_name: proc.process?.name || "Unknown",
                                    sequence: proc.sequence,
                                    course_type: proc.process?.course_type || "INTERNAL",
                                    partner_name: proc.partner_name || "",
                                    worker_id: null,
                                    equipment_id: null,
                                    estimated_time: proc.estimated_time || 0,
                                    start_date: null,
                                    end_date: null,
                                    unit_cost: proc.cost || 0,
                                    cost: (proc.cost || 0) * grossQty,
                                    quantity: grossQty,
                                    gross_quantity: grossQty,
                                    stock_use_quantity: 0,
                                    note: ""
                                });
                            });
                        } else {
                            defaultItems.push({
                                cid: Math.random().toString(36).substr(2, 9),
                                product_id: productId,
                                product_name: product?.name || "Unknown",
                                product_spec: product?.specification || "",
                                product_unit: product?.unit || "EA",
                                product: product, 
                                process_name: "기본 공정",
                                sequence: 1,
                                course_type: "INTERNAL",
                                partner_name: "",
                                worker_id: null,
                                equipment_id: null,
                                estimated_time: 0,
                                start_date: null,
                                end_date: null,
                                unit_cost: 0,
                                cost: 0,
                                quantity: grossQty,
                                gross_quantity: grossQty,
                                stock_use_quantity: 0,
                                note: ""
                            });
                        }
                    });
                    setItems(defaultItems);
                    setStockUseQtys(initialStockUse);
                };

                initCreateMode();
            }
        }
    }, [isOpen, order, stockProduction, plan]);

    // Handle Gross Qty Change (New Production Target)
    const handleGrossQtyChange = (productId, value) => {
        const newGross = parseInt(value) || 0;
        const currentStockUse = stockUseQtys[productId] || 0;
        const currentStock = productStocks[productId] || 0;
        
        // Re-validate stock use (cannot exceed new gross or current stock)
        const safeStockUse = Math.max(0, Math.min(currentStockUse, newGross, currentStock));
        const netQty = Math.max(0, newGross - safeStockUse);

        if (safeStockUse !== currentStockUse) {
            setStockUseQtys(prev => ({ ...prev, [productId]: safeStockUse }));
        }

        const newItems = items.map(item => {
            if (Number(item.product_id) === Number(productId)) {
                return {
                    ...item,
                    gross_quantity: newGross,
                    stock_use_quantity: safeStockUse,
                    quantity: netQty,
                    cost: (item.unit_cost || 0) * netQty
                };
            }
            return item;
        });
        setItems(newItems);
    };

    // Handle Stock Use Change
    const handleStockUseChange = (productId, value) => {
        const stockUse = parseInt(value) || 0;
        const currentStock = productStocks[productId] || 0;
        
        // Find first item to get gross qty
        const firstItem = items.find(i => Number(i.product_id) === Number(productId));
        if (!firstItem) return;
        const grossQty = firstItem.gross_quantity || firstItem.quantity || 0;

        // Validation
        const safeStockUse = Math.max(0, Math.min(stockUse, currentStock, grossQty));
        const netQty = Math.max(0, grossQty - safeStockUse);

        setStockUseQtys(prev => ({ ...prev, [productId]: safeStockUse }));

        // Update all processes for this product
        const newItems = items.map(item => {
            if (Number(item.product_id) === Number(productId)) {
                return {
                    ...item,
                    stock_use_quantity: safeStockUse,
                    quantity: netQty,
                    cost: (item.unit_cost || 0) * netQty
                };
            }
            return item;
        });
        setItems(newItems);
    };

    const handleItemChange = (index, field, value) => {
        const item = items[index];
        const productId = item.product_id;
        const newItems = [...items];
        
        // Sync these fields across ALL processes of the same product
        // Note: 'quantity' is intentionally excluded to allow individual process quantity adjustment
        const syncFields = ['gross_quantity', 'stock_use_quantity'];
        
        if (syncFields.includes(field)) {
            const val = parseInt(value) || 0;
            newItems.forEach((it, idx) => {
                if (Number(it.product_id) === Number(productId)) {
                    newItems[idx][field] = val;
                    
                    // If quantity changed via syncFields (no longer happens for 'quantity', but kept for 'gross_quantity' etc.)
                    if (field === 'quantity') {
                        const unitCost = it.unit_cost || 0;
                        newItems[idx].cost = unitCost * val;
                    }
                }
            });
            
            // Special Case: Update stockUseQtys state if stock_use_quantity changed
            if (field === 'stock_use_quantity') {
                setStockUseQtys(prev => ({ ...prev, [productId]: parseInt(value) || 0 }));
            }
        } else {
            // Standard single-item update
            newItems[index][field] = value;

            // Recalculate cost if quantity or cost was changed individually
            if (field === 'quantity') {
                const val = parseInt(value) || 0;
                const unitCost = newItems[index].unit_cost || 0;
                newItems[index].cost = unitCost * val;
            }
            
            if (field === 'cost') {
                const val = parseFloat(value) || 0;
                const qty = parseInt(newItems[index].quantity) || 1;
                newItems[index].unit_cost = val / qty;
            }

            // Auto-lookup cost for INTERNAL processes
            if ((field === 'course_type' && value === 'INTERNAL') ||
                (field === 'process_name' && newItems[index].course_type === 'INTERNAL')) {
                const targetItem = newItems[index];
                const productName = targetItem.process_name?.toLowerCase().trim();
                const stdProcs = targetItem.product?.standard_processes || [];
                const match = stdProcs.find(p => p.process?.name?.toLowerCase().trim() === productName);

                if (match) {
                    const qty = parseInt(targetItem.quantity) || 1;
                    newItems[index].unit_cost = match.cost || 0;
                    newItems[index].cost = (match.cost || 0) * qty;
                }
            }

        }

        setItems(newItems);
    };

    const handleDeleteItem = (index) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const handleAddProcessToProduct = (productId, productName, productSpec, productUnit) => {
        const productItems = items.filter(i => i.product_id === productId);
        const maxSeq = productItems.reduce((max, item) => Math.max(max, parseInt(item.sequence) || 0), 0);
        const defaultQty = productItems.length > 0 ? productItems[0].quantity : 0;
        const productObj = productItems.length > 0 ? productItems[0].product : null;

        setItems([...items, {
            cid: Math.random().toString(36).substr(2, 9),
            product_id: productId,
            product_name: productName,
            product_spec: productSpec,
            product_unit: productUnit,
            product: productObj, // Include product for lookup
            process_name: "추가 공정",
            sequence: maxSeq + 1,
            course_type: "INTERNAL",
            quantity: defaultQty,
            partner_name: "",
            work_center: "",
            estimated_time: 0,
            start_date: null,
            end_date: null,
            unit_cost: 0,
            cost: 0,
            note: ""
        }]);
    };

    // Drag Handlers
    const handleDragStart = (e, productId, index) => {
        dragItem.current = { productId, index };
    };

    const handleDragEnter = (e, productId, index) => {
        dragOverItem.current = { productId, index };
    };

    const handleDragEnd = () => {
        if (!dragItem.current || !dragOverItem.current) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const sourcePid = dragItem.current.productId;
        const targetPid = dragOverItem.current.productId;

        if (sourcePid !== targetPid) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const sourceIndex = dragItem.current.index;
        const targetIndex = dragOverItem.current.index;

        if (sourceIndex === targetIndex) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        // Reorder logic
        const grouped = {};
        items.forEach(item => {
            if (!grouped[item.product_id]) grouped[item.product_id] = [];
            grouped[item.product_id].push(item);
        });

        const group = grouped[sourcePid];
        const movedItem = group[sourceIndex];
        group.splice(sourceIndex, 1);
        group.splice(targetIndex, 0, movedItem);

        // Re-assign sequence
        group.forEach((item, idx) => {
            item.sequence = idx + 1;
        });

        // Flatten back to items preserving product order
        const newItems = [];
        const productIds = [...new Set(items.map(i => i.product_id))];
        productIds.forEach(pid => {
            if (grouped[pid]) {
                newItems.push(...grouped[pid]);
            }
        });

        setItems(newItems);
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const isHeaderOrder = stockProduction && Boolean(stockProduction.order_no || stockProduction.items);
            const payload = {
                order_id: order ? order.id : undefined,
                stock_production_order_id: isHeaderOrder ? stockProduction.id : undefined,
                stock_production_id: stockProduction && !isHeaderOrder ? stockProduction.id : undefined,
                plan_date: planDate,
                items: items

                    .filter(item => item.product_id && !isNaN(parseInt(item.product_id)))
                    .map((item) => ({
                        id: item.id,
                        product_id: parseInt(item.product_id),
                    process_name: item.process_name,
                    sequence: item.sequence,
                    course_type: item.course_type,
                    partner_name: item.partner_name,
                    worker_id: item.worker_id || null,
                    equipment_id: item.equipment_id || null,
                    estimated_time: parseFloat(item.estimated_time) || 0,
                    start_date: item.start_date || null,
                    end_date: item.end_date || null,
                    cost: parseFloat(item.cost) || 0,
                    unit_price: parseFloat(item.unit_cost) || 0,
                    quantity: parseInt(item.quantity) || 0,
                    gross_quantity: item.gross_quantity || (parseInt(item.quantity) + (item.stock_use_quantity || 0)),
                    stock_use_quantity: item.stock_use_quantity || 0,
                    note: item.note,
                    status: item.status || 'CONFIRMED'
                })),
                status: 'CONFIRMED'
            };

            if (plan) {
                await api.put(`/production/plans/${plan.id}`, payload);
            } else {
                await api.post('/production/plans', payload);
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to save plan FULL ERROR:", error);
            if (error.response) {
                const detail = error.response.data.detail || error.response.data;
                if (error.response.status === 400 && detail === "Production Plan already exists for this Order") {
                    alert("이미 해당 수주에 대한 생산 계획이 존재합니다. 목록을 갱신합니다.");
                    onSuccess(); // Refresh lists
                    onClose();   // Close modal
                    return;
                }
                console.error("Response Data:", error.response.data);
                console.error("Response Status:", error.response.status);
                alert(`저장 실패 (${error.response.status}): ${JSON.stringify(detail)}`);
            } else {
                alert("저장 실패: " + error.message);
            }
        } finally {
            setLoading(false);
        }
    };

    // Grouping Logic
    const groupedItems = items.reduce((acc, item, index) => {
        const pid = item.product_id || `temp_${index}`;
        if (!acc[pid]) {
            acc[pid] = {
                product_id: item.product_id,
                product_name: item.product_name || item.product?.name || "품명 미상",
                product_spec: item.product_spec || item.product?.specification || "",
                product_unit: item.product_unit || item.product?.unit || "EA",
                items: []
            };
        }
        acc[pid].items.push({ ...item, originalIndex: index });
        return acc;
    }, {});

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="xl" fullWidth>
            <DialogTitle>
                {isCompleted ? "생산 내역 수정 (완료됨)" : (plan ? "생산 계획 수정" : "생산 계획 수립")}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2, mt: 1 }}>
                    <TextField
                        label="계획 일자"
                        type="date"
                        value={planDate}
                        onChange={(e) => setPlanDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                    />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6">공정 구성 (Process Composition)</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                            표 제목 오른쪽 경계선을 드래그해 칸 너비를 조절할 수 있습니다.
                        </Typography>
                        <Button size="small" variant="text" onClick={resetColWidths}>
                            칸 너비 초기화
                        </Button>
                    </Box>
                </Box>

                <Box sx={{ maxHeight: 600, overflowY: 'auto' }}>
                    {Object.entries(groupedItems).map(([productId, group]) => (
                        <Paper key={productId} variant="outlined" sx={{ mb: 3, p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Box>
                                    <Typography variant="subtitle1" fontWeight="bold" display="inline" sx={{ mr: 2 }}>
                                        품명: {group.product_name}
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary" display="inline" sx={{ mr: 2 }}>
                                        규격: {group.product_spec || '-'}
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary" display="inline">
                                        수량: {group.items.length > 0 ? group.items[0].quantity : 0} {group.product_unit || 'EA'}
                                    </Typography>
                                </Box>
                                {!isCompleted && (
                                    <Button
                                        size="small"
                                        startIcon={<AddIcon />}
                                        onClick={() => handleAddProcessToProduct(parseInt(productId), group.product_name, group.product_spec, group.product_unit)}
                                    >
                                        공정 추가
                                    </Button>
                                )}
                            </Box>

                            {/* Net Requirement Calculator */}
                            {(() => {
                                const sDetail = productStockDetails[productId] || {
                                    current: 0,
                                    otherReserved: 0,
                                    availCurrent: productStocks[productId] || 0,
                                    producingSp: 0,
                                    availSp: 0,
                                    maxAllocatable: productStocks[productId] || 0,
                                };
                                const grossVal = group.items[0]?.gross_quantity || group.items[0]?.quantity || 0;
                                const stockUseVal = stockUseQtys[productId] || 0;
                                const maxUse = Math.min(sDetail.maxAllocatable || 0, grossVal);
                                const usedFromCurrent = Math.min(stockUseVal, sDetail.availCurrent || 0);
                                const usedFromSp = Math.max(0, stockUseVal - usedFromCurrent);

                                return (
                                    <Box sx={{ p: 1.5, mb: 2, bgcolor: '#f1f5f9', borderRadius: 1, border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="caption" color="textSecondary" display="block">수주/요청량 (Order)</Typography>
                                            <Typography variant="body1" sx={{ color: '#64748b', fontWeight: 'bold' }}>
                                                {(() => {
                                                    const sourceQty = order?.items?.find(i => i.product_id === parseInt(productId))?.quantity ||
                                                                      plan?.order?.items?.find(i => i.product_id === parseInt(productId))?.quantity ||
                                                                      stockProduction?.items?.find(i => i.product_id === parseInt(productId))?.quantity ||
                                                                      stockProduction?.quantity ||
                                                                      plan?.stock_production?.quantity || 0;
                                                    return (sourceQty || 0).toLocaleString();
                                                })()}
                                            </Typography>
                                        </Box>
                                        <Typography variant="h6" color="textSecondary">|</Typography>
                                        <Box sx={{ minWidth: 95 }}>
                                            <Typography variant="caption" color="textSecondary" display="block">생산목표 (Gross)</Typography>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={group.items[0]?.gross_quantity || 0}
                                                onChange={(e) => handleGrossQtyChange(productId, e.target.value)}
                                                inputProps={{ min: 0 }}
                                                variant="outlined"
                                                disabled={isCompleted}
                                                sx={{ width: 95, bgcolor: isCompleted ? '#f8fafc' : 'white', '& .MuiInputBase-input': { fontWeight: 'bold' } }}
                                            />
                                        </Box>
                                        <Typography variant="h6" color="textSecondary">-</Typography>
                                        <Box>
                                            <Typography variant="caption" color="textSecondary" display="block">가용 현재고</Typography>
                                            <Typography variant="body1" color="primary" fontWeight="bold">
                                                {(sDetail.availCurrent || 0).toLocaleString()}
                                            </Typography>
                                            {(sDetail.otherReserved > 0 || sDetail.current !== sDetail.availCurrent) && (
                                                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontSize: '0.68rem' }}>
                                                    (실재고 {sDetail.current} / 타수주예약 {sDetail.otherReserved})
                                                </Typography>
                                            )}
                                        </Box>
                                        {isSalesOrderPlan && (
                                            <>
                                                <Typography variant="h6" color="textSecondary">+</Typography>
                                                <Box sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: sDetail.availSp > 0 ? '#eef2ff' : 'transparent', border: sDetail.availSp > 0 ? '1px dashed #6366f1' : 'none' }}>
                                                    <Typography variant="caption" sx={{ color: sDetail.availSp > 0 ? '#4f46e5' : 'text.secondary', fontWeight: sDetail.availSp > 0 ? 'bold' : 'normal' }} display="block">
                                                        제작중 재고생산(선점가능)
                                                    </Typography>
                                                    <Typography variant="body1" sx={{ color: sDetail.availSp > 0 ? '#4f46e5' : '#94a3b8', fontWeight: 'bold' }}>
                                                        {(sDetail.availSp || 0).toLocaleString()}
                                                    </Typography>
                                                    {sDetail.producingSp > sDetail.availSp && (
                                                        <Typography variant="caption" sx={{ color: '#6366f1', display: 'block', fontSize: '0.68rem' }}>
                                                            (총 재고생산중 {sDetail.producingSp})
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </>
                                        )}
                                        <Typography variant="h6" color="textSecondary">→</Typography>
                                        <Box sx={{ minWidth: 140 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.3 }}>
                                                <Typography variant="caption" color="textSecondary">
                                                    {isSalesOrderPlan ? '재고/제작중 선점량' : '재고 소진량'}
                                                </Typography>
                                                {!isCompleted && maxUse > 0 && stockUseVal !== maxUse && (
                                                    <Button
                                                        size="small"
                                                        variant="text"
                                                        onClick={() => handleStockUseChange(productId, maxUse)}
                                                        sx={{ p: 0, minWidth: 'auto', fontSize: '0.68rem', color: '#4f46e5', fontWeight: 'bold' }}
                                                    >
                                                        최대선점({maxUse})
                                                    </Button>
                                                )}
                                            </Box>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={stockUseVal}
                                                onChange={(e) => handleStockUseChange(productId, e.target.value)}
                                                inputProps={{ min: 0, max: maxUse }}
                                                variant="outlined"
                                                disabled={isCompleted}
                                                sx={{ width: 130, bgcolor: isCompleted ? '#f8fafc' : 'white' }}
                                            />
                                        </Box>
                                        <Typography variant="h6" color="textSecondary">=</Typography>
                                        <Box>
                                            <Typography variant="caption" color="textSecondary" display="block">실 생산 수량(Net Qty)</Typography>
                                            <Typography variant="h5" color="secondary" fontWeight="bold">{(group.items[0]?.quantity || 0).toLocaleString()}</Typography>
                                        </Box>
                                        <Box sx={{ ml: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                                            {usedFromSp > 0 && (
                                                <Typography variant="caption" sx={{ color: '#4338ca', bgcolor: '#e0e7ff', px: 1, py: 0.3, borderRadius: 1, border: '1px solid #818cf8', fontWeight: 'bold' }}>
                                                    📌 현재고 {usedFromCurrent}개 + 제작중 재고생산 {usedFromSp}개 선점 반영
                                                </Typography>
                                            )}
                                            {group.items[0]?.quantity === 0 ? (
                                                <Typography variant="caption" sx={{ color: '#059669', bgcolor: '#ecfdf5', px: 1, py: 0.5, borderRadius: 1, border: '1px solid #10b981' }}>
                                                    ⚠️ 재고/선점분으로 전량 대체 (신규 생산 생략)
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" color="textSecondary">
                                                    * 부족분({(group.items[0]?.quantity || 0).toLocaleString()})에 대해서만 생산/발주가 진행됩니다.
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                );
                            })()}


                            <TableContainer sx={{ overflowX: 'auto' }}>
                                <Table size="small" sx={{ tableLayout: 'fixed', width: `${totalTableWidth}px`, minWidth: '100%' }}>
                                    <colgroup>
                                        <col style={{ width: `${colWidths.drag}px` }} />
                                        <col style={{ width: `${colWidths.sequence}px` }} />
                                        <col style={{ width: `${colWidths.process_name}px` }} />
                                        <col style={{ width: `${colWidths.course_type}px` }} />
                                        <col style={{ width: `${colWidths.assignee}px` }} />
                                        <col style={{ width: `${colWidths.equipment}px` }} />
                                        <col style={{ width: `${colWidths.work_content}px` }} />
                                        <col style={{ width: `${colWidths.start_date}px` }} />
                                        <col style={{ width: `${colWidths.end_date}px` }} />
                                        <col style={{ width: `${colWidths.cost}px` }} />
                                        <col style={{ width: `${colWidths.quantity}px` }} />
                                        <col style={{ width: `${colWidths.actions}px` }} />
                                    </colgroup>
                                    <TableHead>
                                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                            <PlanResizableHeaderCell colKey="drag" width={colWidths.drag} minWidth={32} onResize={handleColResize} align="center" />
                                            <PlanResizableHeaderCell colKey="sequence" width={colWidths.sequence} minWidth={50} onResize={handleColResize}>순서</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="process_name" width={colWidths.process_name} minWidth={90} onResize={handleColResize}>공정명</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="course_type" width={colWidths.course_type} minWidth={80} onResize={handleColResize}>구분</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="assignee" width={colWidths.assignee} minWidth={90} onResize={handleColResize}>외주/구매/작업자</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="equipment" width={colWidths.equipment} minWidth={90} onResize={handleColResize}>배정 장비</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="work_content" width={colWidths.work_content} minWidth={100} onResize={handleColResize}>작업내용</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="start_date" width={colWidths.start_date} minWidth={105} onResize={handleColResize}>시작일</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="end_date" width={colWidths.end_date} minWidth={105} onResize={handleColResize}>종료일</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="cost" width={colWidths.cost} minWidth={90} onResize={handleColResize}>공정비용</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="quantity" width={colWidths.quantity} minWidth={65} onResize={handleColResize}>수량</PlanResizableHeaderCell>
                                            <PlanResizableHeaderCell colKey="actions" width={colWidths.actions} minWidth={50} onResize={handleColResize}>관리</PlanResizableHeaderCell>

                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {group.items.map((item, index) => (
                                            <TableRow
                                                key={item.cid}
                                                onDragStart={(e) => handleDragStart(e, productId, index)}
                                                onDragEnter={(e) => handleDragEnter(e, productId, index)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                                draggable={!isCompleted}
                                                sx={{
                                                    cursor: isCompleted ? 'default' : 'move',
                                                    backgroundColor: 'inherit',
                                                    '&:active': { backgroundColor: isCompleted ? 'inherit' : '#f0f0f0' }
                                                }}
                                            >
                                                <TableCell align="center">
                                                    <DragIndicator fontSize="small" color="disabled" />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        value={item.sequence}
                                                        disabled
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Autocomplete
                                                        freeSolo
                                                        options={masterProcesses.filter(p => !p.group_id || p.group_id === item.product?.group_id)}
                                                        getOptionLabel={(option) => typeof option === 'string' ? option : (option.name || "")}

                                                        value={item.process_name || ""}
                                                        onInputChange={(event, newInputValue) => {
                                                            handleItemChange(item.originalIndex, 'process_name', newInputValue);
                                                        }}
                                                        onChange={(event, newValue) => {
                                                            if (typeof newValue === 'object' && newValue !== null) {
                                                                const newItems = [...items];
                                                                const idx = item.originalIndex;
                                                                newItems[idx].process_name = newValue.name;
                                                                newItems[idx].course_type = newValue.course_type || "INTERNAL";
                                                                
                                                                const targetItem = newItems[idx];
                                                                const stdProcs = targetItem.product?.standard_processes || [];
                                                                const match = stdProcs.find(p => p.process?.name?.toLowerCase().trim() === newValue.name?.toLowerCase().trim());
                                                                if (match) {
                                                                    const qty = parseInt(targetItem.quantity) || 1;
                                                                    newItems[idx].unit_cost = match.cost || 0;
                                                                    newItems[idx].cost = (match.cost || 0) * qty;
                                                                }
                                                                setItems(newItems);
                                                            }
                                                        }}
                                                        renderInput={(params) => (
                                                            <TextField
                                                                {...params}
                                                                size="small"
                                                                placeholder="공정 선택/입력"
                                                                variant="standard"
                                                                fullWidth
                                                                disabled={isCompleted}
                                                            />
                                                        )}
                                                        disabled={isCompleted}
                                                    />
                                                </TableCell>

                                                <TableCell>
                                                    <Select
                                                        value={item.course_type}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'course_type', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        disabled={isCompleted}
                                                    >
                                                        <MenuItem value="INTERNAL">사내</MenuItem>
                                                        <MenuItem value="OUTSOURCING">외주</MenuItem>
                                                        <MenuItem value="PURCHASE">구매</MenuItem>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    {item.course_type === 'INTERNAL' ? (
                                                        <Select
                                                            value={item.worker_id || ''}
                                                            onChange={(e) => {
                                                                handleItemChange(item.originalIndex, 'worker_id', e.target.value);
                                                            }}
                                                            size="small"
                                                            fullWidth
                                                            variant="standard"
                                                            displayEmpty
                                                            disabled={isCompleted}
                                                        >
                                                            <MenuItem value=""><em>작업자 선택</em></MenuItem>
                                                            {staffList.filter(s => s.is_active).map(s => (
                                                                <MenuItem key={s.id} value={s.id}>{s.name} {s.role ? `(${s.role})` : ''}</MenuItem>
                                                            ))}
                                                        </Select>
                                                    ) : (
                                                        <Select
                                                            value={item.partner_name || ''}
                                                            onChange={(e) => {
                                                                handleItemChange(item.originalIndex, 'partner_name', e.target.value);
                                                            }}
                                                            size="small"
                                                            fullWidth
                                                            variant="standard"
                                                            displayEmpty
                                                            disabled={isCompleted}
                                                        >
                                                            <MenuItem value=""><em>{item.course_type === 'OUTSOURCING' ? '외주처 선택' : '공급사 선택'}</em></MenuItem>
                                                            {partners.filter(p => {
                                                                const types = Array.isArray(p.partner_type) ? p.partner_type : [];
                                                                if (item.course_type === 'OUTSOURCING') return types.includes('SUBCONTRACTOR') || types.includes('SUPPLIER');
                                                                if (item.course_type === 'PURCHASE') return types.includes('SUPPLIER') || types.includes('SUBCONTRACTOR');
                                                                return true;
                                                            }).map(p => (
                                                                <MenuItem key={p.id} value={p.name}>{p.name}</MenuItem>
                                                            ))}
                                                        </Select>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {item.course_type === 'INTERNAL' ? (
                                                        <Select
                                                            value={item.equipment_id || ''}
                                                            onChange={(e) => handleItemChange(item.originalIndex, 'equipment_id', e.target.value)}
                                                            size="small"
                                                            fullWidth
                                                            variant="standard"
                                                            displayEmpty
                                                            disabled={isCompleted}
                                                        >
                                                            <MenuItem value=""><em>장비 선택</em></MenuItem>
                                                            {equipments.filter(eq => eq.is_active).map(eq => (
                                                                <MenuItem key={eq.id} value={eq.id}>{eq.name} ({eq.code || 'No Code'})</MenuItem>
                                                            ))}
                                                        </Select>
                                                    ) : (
                                                        <Typography variant="caption" color="textSecondary">사외 공정</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        value={item.note || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'note', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        placeholder="작업 내용"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="date"
                                                        value={item.start_date || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'start_date', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        InputLabelProps={{ shrink: true }}
                                                        disabled={isCompleted}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="date"
                                                        value={item.end_date || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'end_date', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        InputLabelProps={{ shrink: true }}
                                                        disabled={isCompleted}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        value={item.cost || 0}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'cost', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        disabled={tabIndex === 0 && item.course_type === 'INTERNAL'}
                                                        placeholder={'직접입력'}
                                                        helperText={item.course_type === 'INTERNAL' ? `표준단가: ${(item.unit_cost || 0).toLocaleString()} (자동)` : (item.purchase_items?.length ? `발주: ${item.purchase_items.reduce((s, pi) => s + (pi.quantity * pi.unit_price), 0).toLocaleString()}원` : `단가: ${(item.unit_cost || 0).toLocaleString()}`)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'quantity', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        disabled={isCompleted}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {!isCompleted && (
                                                        <IconButton size="small" color="error" onClick={() => handleDeleteItem(item.originalIndex)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    ))}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={loading} color="secondary">
                    {loading ? "저장 중..." : (tabIndex === 0 ? "생산계획확정 (Confirm & MRP)" : "생산계획 수정 (Sync)")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ProductionPlanModal;
