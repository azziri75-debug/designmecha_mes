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

    // Drag and Drop Refs
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (isOpen) {
            // Fetch partners, staff, and equipments
            api.get('/basics/partners/').then(res => setPartners(res.data)).catch(() => { });
            api.get('/basics/staff/').then(res => setStaffList(res.data)).catch(() => { });
            api.get('/basics/equipments/').then(res => setEquipments(res.data)).catch(() => { });
            if (plan) {
                // Edit Mode
                setPlanDate(plan.plan_date);
                setItems(plan.items.map(item => ({
                    ...item,
                    cid: Math.random().toString(36).substr(2, 9),
                    product_spec: item.product?.specification || "", // Ensure spec is captured
                    product_unit: item.product?.unit || "EA"
                })));
            } else if (order || stockProduction) {
                // Create Mode
                setPlanDate(new Date().toISOString().split('T')[0]);
                const defaultItems = [];
                const sourceItems = order ? order.items : [{ product: stockProduction.product, quantity: stockProduction.quantity, product_id: stockProduction.product_id }];

                sourceItems.forEach(sourceItem => {
                    const product = sourceItem.product;
                    const processes = product?.standard_processes || [];

                    if (processes.length > 0) {
                        processes.sort((a, b) => a.sequence - b.sequence).forEach(proc => {
                            defaultItems.push({
                                cid: Math.random().toString(36).substr(2, 9),
                                product_id: sourceItem.product_id,
                                product_name: product?.name || "Unknown",
                                product_spec: product?.specification || "",
                                product_unit: product?.unit || "EA",
                                process_name: proc.process?.name || "Unknown",
                                sequence: proc.sequence,
                                course_type: proc.process?.course_type || "INTERNAL",
                                partner_name: proc.partner_name || "",
                                worker_id: null,
                                equipment_id: null,
                                estimated_time: proc.estimated_time || 0,
                                start_date: null,
                                end_date: null,
                                cost: 0,
                                quantity: sourceItem.quantity,
                                note: ""
                            });
                        });
                    } else {
                        defaultItems.push({
                            cid: Math.random().toString(36).substr(2, 9),
                            product_id: sourceItem.product_id,
                            product_name: product?.name || "Unknown",
                            product_spec: product?.specification || "",
                            product_unit: product?.unit || "EA",
                            process_name: "기본 공정",
                            sequence: 1,
                            course_type: "INTERNAL",
                            partner_name: "",
                            worker_id: null,
                            equipment_id: null,
                            estimated_time: 0,
                            start_date: null,
                            end_date: null,
                            cost: 0,
                            quantity: sourceItem.quantity,
                            note: ""
                        });
                    }
                });
                setItems(defaultItems);
            }
        }
    }, [isOpen, order, stockProduction, plan]);

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
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

        setItems([...items, {
            cid: Math.random().toString(36).substr(2, 9),
            product_id: productId,
            product_name: productName,
            product_spec: productSpec,
            product_unit: productUnit,
            process_name: "추가 공정",
            sequence: maxSeq + 1,
            course_type: "INTERNAL",
            quantity: defaultQty,
            partner_name: "",
            work_center: "",
            estimated_time: 0,
            start_date: null,
            end_date: null,
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
                items: items.map((item) => ({
                    product_id: item.product_id,
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
                    note: item.note,
                    status: 'PLANNED'
                }))
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

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                            <TableCell width="5%" align="center"></TableCell> {/* Drag Handle Column */}
                                            <TableCell width="5%">순서</TableCell>
                                            <TableCell width="12%">공정명</TableCell>
                                            <TableCell width="10%">구분</TableCell>
                                            <TableCell width="12%">외주/구매/작업자</TableCell>
                                            <TableCell width="10%">배정 장비</TableCell>
                                            <TableCell width="12%">작업내용</TableCell>
                                            <TableCell width="10%">시작일</TableCell>
                                            <TableCell width="10%">종료일</TableCell>
                                            <TableCell width="10%">공정비용</TableCell>
                                            <TableCell width="5%">수량</TableCell>
                                            <TableCell width="5%">관리</TableCell>
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
                                                        disabled={item.course_type !== 'INTERNAL'}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        placeholder={item.course_type !== 'INTERNAL' ? '발주금액 자동연동' : '직접입력'}
                                                        helperText={item.course_type !== 'INTERNAL' && item.purchase_items?.length ? `발주: ${item.purchase_items.reduce((s, pi) => s + (pi.quantity * pi.unit_price), 0).toLocaleString()}원` : ''}
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
                <Button onClick={handleSubmit} variant="contained" disabled={loading}>
                    {loading ? "저장 중..." : "확정 (Confirm)"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ProductionPlanModal;
