import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Paper, IconButton, Typography, Box, Select, MenuItem, Divider
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import api from '../lib/api';

const ProductionPlanModal = ({ isOpen, onClose, onSuccess, order, plan }) => {
    const [items, setItems] = useState([]);
    const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (plan) {
                // Edit Mode
                setPlanDate(plan.plan_date);
                setItems(plan.items.map(item => ({
                    ...item,
                    cid: Math.random().toString(36).substr(2, 9)
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

    const handleAddProcessToProduct = (productId, productName) => {
        // Find max sequence for this product
        const productItems = items.filter(i => i.product_id === productId);
        const maxSeq = productItems.reduce((max, item) => Math.max(max, parseInt(item.sequence) || 0), 0);

        // Find default quantity from other items of same product
        const defaultQty = productItems.length > 0 ? productItems[0].quantity : 0;

        setItems([...items, {
            cid: Math.random().toString(36).substr(2, 9),
            product_id: productId,
            product_name: productName,
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
                    note: item.note, // Work Content
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
                items: []
            };
        }
        // Store original index to handle updates correctly
        acc[key].items.push({ ...item, originalIndex: items.findIndex(i => i.cid === item.cid) });
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
                                <Typography variant="subtitle1" fontWeight="bold">
                                    품목명: {group.product_name}
                                </Typography>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddProcessToProduct(parseInt(productId), group.product_name)}
                                >
                                    공정 추가
                                </Button>
                            </Box>

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                                            <TableCell width="15%">공정명</TableCell>
                                            <TableCell width="5%">순서</TableCell>
                                            <TableCell width="10%">공정관리 구분</TableCell> {/* Renamed from 유형 */}
                                            <TableCell width="12%">외주/구매처</TableCell>
                                            <TableCell width="10%">작업장</TableCell>
                                            <TableCell width="15%">작업내용</TableCell> {/* New Column */}
                                            <TableCell width="8%">수량</TableCell>
                                            <TableCell width="8%">시간(분)</TableCell>
                                            <TableCell width="5%">관리</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {group.items.map((item) => (
                                            <TableRow key={item.cid}>
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
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'sequence', e.target.value)}
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
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        value={item.partner_name || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'partner_name', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        disabled={item.course_type !== 'OUTSOURCING'}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        value={item.work_center || ''}
                                                        onChange={(e) => handleItemChange(item.originalIndex, 'work_center', e.target.value)}
                                                        size="small"
                                                        fullWidth
                                                        variant="standard"
                                                        disabled={item.course_type === 'OUTSOURCING'}
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
