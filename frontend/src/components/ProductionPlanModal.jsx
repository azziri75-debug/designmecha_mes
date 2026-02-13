import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Paper, IconButton, Typography, Box, Select, MenuItem
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon, DragIndicator } from '@mui/icons-material';
import api from '../lib/api';

const ProductionPlanModal = ({ isOpen, onClose, onSuccess, order, plan }) => {
    const [items, setItems] = useState([]);
    const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    // Drag and Drop Refs
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (isOpen) {
            if (plan) {
                // Edit Mode
                setPlanDate(plan.plan_date);
                setItems(plan.items.map(item => ({
                    ...item,
                    cid: Math.random().toString(36).substr(2, 9),
                    product_spec: item.product?.specification || "", // Ensure spec is captured
                    product_unit: item.product?.unit || "EA"
                })));
            } else if (order) {
                // Create Mode
                setPlanDate(new Date().toISOString().split('T')[0]);
                const defaultItems = [];
                order.items.forEach(orderItem => {
                    const product = orderItem.product;
                    const processes = product?.standard_processes || [];

                    if (processes.length > 0) {
                        processes.sort((a, b) => a.sequence - b.sequence).forEach(proc => {
                            defaultItems.push({
                                cid: Math.random().toString(36).substr(2, 9),
                                product_id: orderItem.product_id,
                                product_name: product.name,
                                product_spec: product.specification || "",
                                product_unit: product.unit || "EA",
                                process_name: proc.process?.name || "Unknown",
                                sequence: proc.sequence,
                                course_type: proc.process?.course_type || "INTERNAL",
                                partner_name: proc.partner_name || "",
                                work_center: proc.equipment_name || "",
                                estimated_time: proc.estimated_time || 0,
                                quantity: orderItem.quantity,
                                note: ""
                            });
                        });
                    } else {
                        defaultItems.push({
                            cid: Math.random().toString(36).substr(2, 9),
                            product_id: orderItem.product_id,
                            product_name: product?.name || "Unknown",
                            product_spec: product.specification || "",
                            product_unit: product.unit || "EA",
                            process_name: "기본 공정",
                            sequence: 1,
                            course_type: "INTERNAL",
                            partner_name: "",
                            work_center: "",
                            estimated_time: 0,
                            quantity: orderItem.quantity,
                            note: ""
                        });
                    }
                });
                setItems(defaultItems);
            }
        }
    }, [isOpen, order, plan]);

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
            process_name: "",
            sequence: maxSeq + 1,
            course_type: "INTERNAL",
            quantity: defaultQty,
            partner_name: "",
            work_center: "",
            estimated_time: 0,
            note: ""
        }]);
    };

    // Drag and Drop Handlers
    const handleDragStart = (e, productId, index) => {
        dragItem.current = { productId, index };
    };

    const handleDragEnter = (e, productId, index) => {
        dragOverItem.current = { productId, index };
    };

    const handleDragEnd = () => {
        if (!dragItem.current || !dragOverItem.current) return;

        const { productId: srcPid, index: srcIdx } = dragItem.current;
        const { productId: destPid, index: destIdx } = dragOverItem.current;

        if (srcPid !== destPid || srcIdx === destIdx) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        // 1. Get all items for this product
        const productItems = items.filter(i => i.product_id === srcPid);
        // 2. Separate other items
        const otherItems = items.filter(i => i.product_id !== srcPid);

        // 3. Reorder productItems
        const itemToMove = productItems[srcIdx];
        productItems.splice(srcIdx, 1);
        productItems.splice(destIdx, 0, itemToMove);

        // 4. Update sequences
        const updatedProductItems = productItems.map((item, index) => ({
            ...item,
            sequence: index + 1
        }));

        // 5. Merge back (Need to maintain relative order of blocks? 
        // Actually, since we render by group, just appending is fine, 
        // BUT to keep state clean, let's put them back where they were?
        // Simplest is to just concatenate `otherItems` + `updatedProductItems`.
        // However, `otherItems` might be mixed. 
        // Better: Map the original `items` list? No, `items` is flat.
        // If we just concatenate, the groups in UI will still be valid.
        // Let's just create a new list by iterating existing items and replacing the chunk for this product.

        // Easier approach: Rebuild items list by grouping implicitly.
        const newItems = [...otherItems, ...updatedProductItems];
        // Note: This changes the global order of products in `items` array if we are not careful.
        // But `groupedItems` in render will sort it out.
        // However, if we want to preserve product order, we should be careful.
        // Let's assume preservation of product order is not strictly required as `groupedItems` keys (product IDs) determine display order?
        // Actually `groupedItems` uses `Object.entries` which might not guarantee order.
        // Let's try to do it safely:
        // We can just filter `items` for this product, modify them, and then reconstruct `items` 
        // by mapping original `items` and replacing the ones for this product... wait that's hard if indices changed.

        // Revised Approach:
        // Filter `items` to get `productItems` (sorted by sequence usually).
        // Modifying `productItems` creates a new list.
        // We want to replace the old items of this product with the new items.
        // Since `items` might have products interleaved (unlikely if created from order loop), 
        // but let's just append `updatedProductItems` to `items.filter(p => p.id !== pid)`.
        // The display logic groups by ID anyway.

        setItems([...otherItems, ...updatedProductItems]);

        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload = {
                plan_date: planDate,
                items: items.map(item => ({
                    product_id: item.product_id,
                    process_name: item.process_name,
                    sequence: parseInt(item.sequence),
                    course_type: item.course_type,
                    partner_name: item.partner_name,
                    work_center: item.work_center,
                    estimated_time: parseFloat(item.estimated_time),
                    quantity: parseInt(item.quantity),
                    note: item.note,
                    status: item.status || "PLANNED"
                }))
            };

            if (plan) {
                await api.put(`/production/plans/${plan.id}`, payload);
                alert("생산 계획이 수정되었습니다.");
            } else if (order) {
                await api.post('/production/plans', {
                    order_id: order.id,
                    ...payload
                });
                alert("생산 계획이 등록되었습니다.");
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Save failed", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    // Group items by Product ID
    const groupedItems = items.reduce((acc, item) => {
        const key = item.product_id;
        if (!acc[key]) {
            acc[key] = {
                product_name: item.product_name,
                product_spec: item.product_spec,
                product_unit: item.product_unit,
                items: []
            };
        }
        // Store original index to handle updates correctly
        // Wait, if I use `items` state index, it might not be stable if I reorder.
        // I should pass the *item object* itself to change handler or use `cid`.
        // `handleItemChange` uses index. 
        // If I render from `groupedItems`, the `originalIndex` must be the index in `items` state.
        acc[key].items.push({ ...item, originalIndex: items.findIndex(i => i.cid === item.cid) });
        return acc;
    }, {});

    // Sort items within groups by sequence for display
    Object.values(groupedItems).forEach(group => {
        group.items.sort((a, b) => a.sequence - b.sequence);
    });

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
                                            <TableCell width="15%">공정명</TableCell>
                                            <TableCell width="5%">순서</TableCell>
                                            <TableCell width="10%">구분</TableCell> {/* Renamed to 구분 */}
                                            <TableCell width="12%">외주/구매처</TableCell>
                                            <TableCell width="10%">작업장</TableCell>
                                            <TableCell width="15%">작업내용</TableCell>
                                            <TableCell width="8%">수량</TableCell>
                                            <TableCell width="8%">시간(분)</TableCell>
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
                                                        value={item.process_name}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'process_name', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        value={item.sequence}
                                                        disabled // Sequence is automated
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
                                                        <MenuItem value="PURCHASE">구매</MenuItem> {/* Added Purchase */}
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        value={item.partner_name || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'partner_name', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        // Disable logic: disabled if INTERNAL? User might want to specify supplier for PURCHASE
                                                        disabled={item.course_type === 'INTERNAL'}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        value={item.work_center || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'work_center', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        disabled={item.course_type !== 'INTERNAL'}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        value={item.note || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'note', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        placeholder="작업 내용 입력"
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
                                                    <TextField
                                                        type="number"
                                                        value={item.estimated_time || 0}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'estimated_time', e.target.value)}
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
