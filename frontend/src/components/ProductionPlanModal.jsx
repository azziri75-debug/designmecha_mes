import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Paper, IconButton, Typography, Box, Select, MenuItem
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon, DragIndicator } from '@mui/icons-material';
import api from '../lib/api';

const ProductionPlanModal = ({ isOpen, onClose, onSuccess, order, stockProduction, plan }) => {
    const [items, setItems] = useState([]);
    const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [partners, setPartners] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [equipments, setEquipments] = useState([]);
    const [productStocks, setProductStocks] = useState({}); // { product_id: current_stock }
    const [stockUseQtys, setStockUseQtys] = useState({}); // { product_id: use_qty }

    // Drag and Drop Refs
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (isOpen) {
            // Fetch partners, staff, and equipments
            api.get('/basics/partners/', { params: { type: 'SUBCONTRACTOR' } }).then(res => setPartners(res.data)).catch(() => { });
            api.get('/basics/staff/').then(res => setStaffList(res.data)).catch(() => { });
            api.get('/basics/equipments/').then(res => setEquipments(res.data)).catch(() => { });
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
                        const stockMap = {};
                        res.data.forEach(s => { stockMap[s.product_id] = s.current_quantity; });
                        setProductStocks(stockMap);
                    }).catch(() => { });
            } else if (order || stockProduction) {
                // Create Mode
                setPlanDate(new Date().toISOString().split('T')[0]);
                
                const initCreateMode = async () => {
                    const sourceItems = order ? order.items : (stockProduction ? [{ 
                        product: stockProduction.product, 
                        quantity: stockProduction.quantity, 
                        product_id: stockProduction.product_id 
                    }] : []);
                    
                    if (sourceItems.length === 0) return;

                    // Fetch fresh product details to ensure we have standard_processes
                    const productIds = sourceItems.map(si => si.product_id);
                    const productMap = {};
                    
                    try {
                        await Promise.all(productIds.map(async (pid) => {
                            const res = await api.get(`/product/products/${pid}`);
                            productMap[pid] = res.data;
                        }));
                    } catch (err) {
                        console.error("Failed to fetch fresh product details", err);
                    }

                    // Fetch stocks
                    try {
                        const res = await api.get('/inventory/stocks', { params: { product_ids: productIds.join(',') } });
                        const stockMap = {};
                        res.data.forEach(s => { stockMap[s.product_id] = s.current_quantity; });
                        setProductStocks(stockMap);
                    } catch (err) {
                        console.error("Failed to fetch stocks", err);
                    }

                    const defaultItems = [];
                    const initialStockUse = {};

                    sourceItems.forEach(sourceItem => {
                        const productId = sourceItem.product_id;
                        const product = productMap[productId] || sourceItem.product;
                        const processes = product?.standard_processes || [];
                        const grossQty = sourceItem.quantity;
                        
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
        const syncFields = ['quantity', 'gross_quantity', 'stock_use_quantity'];
        
        if (syncFields.includes(field)) {
            const val = parseInt(value) || 0;
            newItems.forEach((it, idx) => {
                if (Number(it.product_id) === Number(productId)) {
                    newItems[idx][field] = val;
                    
                    // If quantity changed, recalculate cost for this item (based on its own unit_cost)
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

            if (field === 'cost') {
                const qty = parseInt(newItems[index].quantity) || 1;
                newItems[index].unit_cost = parseFloat(value) / qty;
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
            const payload = {
                order_id: order ? order.id : undefined,
                stock_production_id: stockProduction ? stockProduction.id : undefined,
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
        if (!acc[item.product_id]) {
            acc[item.product_id] = {
                product_name: item.product_name,
                product_spec: item.product_spec,
                product_unit: item.product_unit,
                items: []
            };
        }
        acc[item.product_id].items.push({ ...item, originalIndex: index });
        return acc;
    }, {});

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="xl" fullWidth>
            <DialogTitle>
                {plan ? "생산 계획 수정" : "생산 계획 수립"}
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

                <Typography variant="h6" gutterBottom>공정 구성 (Process Composition)</Typography>

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
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddProcessToProduct(parseInt(productId), group.product_name, group.product_spec, group.product_unit)}
                                >
                                    공정 추가
                                </Button>
                            </Box>

                            {/* Net Requirement Calculator */}
                            <Box sx={{ p: 1.5, mb: 2, bgcolor: '#f1f5f9', borderRadius: 1, border: '1px solid #e2e8f0', display: 'flex', gap: 3, alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="caption" color="textSecondary" display="block">수주량 (Order)</Typography>
                                    <Typography variant="body1" sx={{ color: '#64748b' }}>
                                        {(() => {
                                            const sourceQty = order ? order.items.find(i => i.product_id === parseInt(productId))?.quantity :
                                                              stockProduction ? stockProduction.quantity : 0;
                                            return (sourceQty || 0).toLocaleString();
                                        })()}
                                    </Typography>
                                </Box>
                                <Typography variant="h6" color="textSecondary">|</Typography>
                                <Box sx={{ minWidth: 100 }}>
                                    <Typography variant="caption" color="textSecondary" display="block">생산목표 (Gross)</Typography>
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={group.items[0]?.gross_quantity || 0}
                                        onChange={(e) => handleGrossQtyChange(productId, e.target.value)}
                                        inputProps={{ min: 0 }}
                                        variant="outlined"
                                        sx={{ bgcolor: 'white', '& .MuiInputBase-input': { fontWeight: 'bold' } }}
                                    />
                                </Box>
                                <Typography variant="h6" color="textSecondary">-</Typography>
                                <Box>
                                    <Typography variant="caption" color="textSecondary" display="block">현재고(Stock)</Typography>
                                    <Typography variant="body1" color="primary" fontWeight="bold">{(productStocks[productId] || 0).toLocaleString()}</Typography>
                                </Box>
                                <Typography variant="h6" color="textSecondary">→</Typography>
                                <Box sx={{ minWidth: 120 }}>
                                    <Typography variant="caption" color="textSecondary" display="block">재고 소진량(Stock Use)</Typography>
                                    <TextField
                                        size="small"
                                        type="number"
                                        value={stockUseQtys[productId] || 0}
                                        onChange={(e) => handleStockUseChange(productId, e.target.value)}
                                        inputProps={{ min: 0, max: Math.min(productStocks[productId] || 0, group.items[0]?.gross_quantity || group.items[0]?.quantity || 0) }}
                                        variant="outlined"
                                        sx={{ bgcolor: 'white' }}
                                    />
                                </Box>
                                <Typography variant="h6" color="textSecondary">=</Typography>
                                <Box>
                                    <Typography variant="caption" color="textSecondary" display="block">실 생산 수량(Net Qty)</Typography>
                                    <Typography variant="h5" color="secondary" fontWeight="bold">{(group.items[0]?.quantity || 0).toLocaleString()}</Typography>
                                </Box>
                                <Box sx={{ ml: 'auto' }}>
                                    {group.items[0]?.quantity === 0 ? (
                                        <Typography variant="caption" sx={{ color: '#059669', bgcolor: '#ecfdf5', px: 1, py: 0.5, borderRadius: 1, border: '1px solid #10b981' }}>
                                            ⚠️ 재고로 전량 대체 (자동 주문 생략)
                                        </Typography>
                                    ) : (
                                        <Typography variant="caption" color="textSecondary">
                                            * 부족분에 대해서만 자동 발주가 실행됩니다.
                                        </Typography>
                                    )}
                                </Box>
                            </Box>

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                            <TableCell width="3%" align="center"></TableCell> {/* Drag Handle Column */}
                                            <TableCell width="4%">순서</TableCell>
                                            <TableCell width="12%">공정명</TableCell>
                                            <TableCell width="8%">구분</TableCell>
                                            <TableCell width="10%">외주/구매/작업자</TableCell>
                                            <TableCell width="10%">배정 장비</TableCell>
                                            <TableCell width="12%">작업내용</TableCell>
                                            <TableCell width="9%">시작일</TableCell>
                                            <TableCell width="9%">종료일</TableCell>
                                            <TableCell width="9%">공정비용</TableCell>
                                            <TableCell width="8%">수량</TableCell>
                                            <TableCell width="6%">관리</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {group.items.map((item, index) => (
                                            <TableRow
                                                key={item.cid}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, parseInt(productId), index)}
                                                onDragEnter={(e) => handleDragEnter(e, parseInt(productId), index)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                                sx={{
                                                    cursor: 'move',
                                                    backgroundColor: 'inherit',
                                                    '&:active': { backgroundColor: '#f0f0f0' }
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
                                                    <TextField
                                                        value={item.process_name}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'process_name', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        value={item.course_type}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'course_type', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
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
                                                        disabled={item.course_type === 'INTERNAL'}
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
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteItem(item.originalIndex)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
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
                    {loading ? "저장 중..." : "계획 확정 (Confirm & MRP)"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ProductionPlanModal;
