import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Paper, IconButton, Typography, Box, Select, MenuItem
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
                // Map existing items to state
                setItems(plan.items.map(item => ({
                    ...item,
                    cid: Math.random().toString(36).substr(2, 9) // Client ID for key
                })));
            } else if (order) {
                // Create Mode - Generate defaults from Order
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
                        // Fallback if no processes defined
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

    const handleAddItem = () => {
        // Add a blank item (need to select product?)
        // For simplicity, just add a generic row, user can ignore product_id if not strict
        // But backend needs product_id.
        // Let's pick the first product from order as default or leave blank if possible.
        // Actually, without product_id, backend might fail.
        // Let's take the first available product from order/plan.
        const defaultProductId = order?.items[0]?.product_id || plan?.items[0]?.product_id || 0;
        const defaultProductName = order?.items[0]?.product?.name || plan?.items[0]?.product?.name || "";

        setItems([...items, {
            cid: Math.random().toString(36).substr(2, 9),
            product_id: defaultProductId,
            product_name: defaultProductName,
            process_name: "",
            sequence: items.length + 1,
            course_type: "INTERNAL",
            quantity: 0,
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
                    note: item.note,
                    status: item.status || "PLANNED" // Preserve status if editing
                }))
            };

            if (plan) {
                // Update
                await api.put(`/production/plans/${plan.id}`, payload);
                alert("생산 계획이 수정되었습니다.");
            } else if (order) {
                // Create
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
                <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell>제품</TableCell>
                                <TableCell>공정명</TableCell>
                                <TableCell>순서</TableCell>
                                <TableCell>유형</TableCell>
                                <TableCell>외주/구매처</TableCell>
                                <TableCell>작업장</TableCell>
                                <TableCell>수량</TableCell>
                                <TableCell>시간(분)</TableCell>
                                <TableCell>관리</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item, index) => (
                                <TableRow key={item.cid}>
                                    <TableCell>{item.product_name}</TableCell>
                                    <TableCell>
                                        <TextField
                                            value={item.process_name}
                                            onChange={(e) => handleItemChange(index, 'process_name', e.target.value)}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            type="number"
                                            value={item.sequence}
                                            onChange={(e) => handleItemChange(index, 'sequence', e.target.value)}
                                            size="small"
                                            sx={{ width: 60 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={item.course_type}
                                            onChange={(e) => handleItemChange(index, 'course_type', e.target.value)}
                                            size="small"
                                        >
                                            <MenuItem value="INTERNAL">사내</MenuItem>
                                            <MenuItem value="OUTSOURCING">외주</MenuItem>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            value={item.partner_name || ''}
                                            onChange={(e) => handleItemChange(index, 'partner_name', e.target.value)}
                                            size="small"
                                            disabled={item.course_type !== 'OUTSOURCING'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            value={item.work_center || ''}
                                            onChange={(e) => handleItemChange(index, 'work_center', e.target.value)}
                                            size="small"
                                            disabled={item.course_type === 'OUTSOURCING'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                            size="small"
                                            sx={{ width: 80 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            type="number"
                                            value={item.estimated_time || 0}
                                            onChange={(e) => handleItemChange(index, 'estimated_time', e.target.value)}
                                            size="small"
                                            sx={{ width: 80 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <IconButton size="small" color="error" onClick={() => handleDeleteItem(index)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Button startIcon={<AddIcon />} onClick={handleAddItem} sx={{ mt: 1 }}>
                    공정 추가
                </Button>
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
