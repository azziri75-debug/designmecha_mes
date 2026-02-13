import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, MenuItem, Box, Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import api from '../lib/api';

const PurchaseOrderModal = ({ isOpen, onClose, onSuccess, order, initialItems }) => {
    const [partners, setPartners] = useState([]);
    const [products, setProducts] = useState([]);

    const [formData, setFormData] = useState({
        partner_id: '',
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: '',
        note: '',
        status: 'PENDING',
        items: []
    });

    useEffect(() => {
        fetchPartners();
        fetchProducts();
    }, []);

    useEffect(() => {
        if (order) {
            setFormData({
                partner_id: order.partner_id || '',
                order_date: order.order_date,
                delivery_date: order.delivery_date || '',
                note: order.note || '',
                status: order.status || 'PENDING',
                items: order.items.map(item => ({
                    ...item,
                    product_id: item.product.id
                }))
            });
        } else if (isOpen && initialItems && initialItems.length > 0) {
            // Pre-fill from pending items
            // Try to auto-detect partner from first item
            const firstPartnerName = initialItems[0].partner_name;
            const foundPartner = partners.find(p => p.name === firstPartnerName);

            setFormData({
                partner_id: foundPartner ? foundPartner.id : '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                note: '',
                status: 'PENDING',
                items: initialItems.map(item => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: 0, // Could fetch last price if needed
                    note: item.note,
                    production_plan_item_id: item.id
                }))
            });
        } else if (isOpen) {
            setFormData({
                partner_id: '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                note: '',
                status: 'PENDING',
                items: []
            });
        }
    }, [order, isOpen, initialItems, partners]);

    const fetchPartners = async () => {
        try {
            const response = await api.get('/basics/partners');
            setPartners(response.data.filter(p => p.partner_type.includes('SUPPLIER') || p.partner_type.includes('BOTH')));
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    const fetchProducts = async () => {
        try {
            const response = await api.get('/product/products');
            setProducts(response.data);
        } catch (error) {
            console.error("Failed to fetch products", error);
        }
    };

    const handleAddItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { product_id: '', quantity: 0, unit_price: 0, note: '' }]
        });
    };

    const handleRemoveItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;

        // Auto-fill price if product selected
        if (field === 'product_id') {
            // In a real app, fetch last purchase price. For now, 0 or skip.
        }

        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async () => {
        try {
            const payload = {
                ...formData,
                items: formData.items.map(item => ({
                    product_id: item.product_id,
                    quantity: parseInt(item.quantity),
                    unit_price: parseFloat(item.unit_price),
                    note: item.note
                }))
            };

            if (order) {
                await api.put(`/purchasing/purchase/orders/${order.id}`, payload);
            } else {
                await api.post('/purchasing/purchase/orders', payload);
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to save purchase order", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{order ? "발주서 수정" : "발주서 등록"}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                    <TextField
                        select
                        label="거래처 (공급사)"
                        value={formData.partner_id}
                        onChange={(e) => setFormData({ ...formData, partner_id: e.target.value })}
                        fullWidth
                    >
                        {partners.map((partner) => (
                            <MenuItem key={partner.id} value={partner.id}>
                                {partner.name}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="발주일자"
                        type="date"
                        value={formData.order_date}
                        onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                    />
                    <TextField
                        label="납기일자"
                        type="date"
                        value={formData.delivery_date}
                        onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                    />
                    <TextField
                        label="비고"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        fullWidth
                    />
                    {order && (
                        <TextField
                            select
                            label="상태"
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            fullWidth
                        >
                            <MenuItem value="PENDING">대기 (PENDING)</MenuItem>
                            <MenuItem value="ORDERED">발주 (ORDERED)</MenuItem>
                            <MenuItem value="COMPLETED">입고 완료 (COMPLETED)</MenuItem>
                        </TextField>
                    )}
                </Box>

                <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>발주 품목</Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>품목</TableCell>
                                <TableCell width="15%">수량</TableCell>
                                <TableCell width="20%">단가</TableCell>
                                <TableCell width="20%">비고</TableCell>
                                <TableCell width="5%"></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {formData.items.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <TextField
                                            select
                                            value={item.product_id}
                                            onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                                            fullWidth
                                            size="small"
                                            variant="standard"
                                        >
                                            {products.map((p) => (
                                                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                                            ))}
                                        </TextField>
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                            fullWidth
                                            size="small"
                                            variant="standard"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            type="number"
                                            value={item.unit_price}
                                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                            fullWidth
                                            size="small"
                                            variant="standard"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            value={item.note}
                                            onChange={(e) => handleItemChange(index, 'note', e.target.value)}
                                            fullWidth
                                            size="small"
                                            variant="standard"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <IconButton size="small" onClick={() => handleRemoveItem(index)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Button startIcon={<AddIcon />} onClick={handleAddItem} sx={{ mt: 1 }}>
                    품목 추가
                </Button>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button onClick={handleSubmit} variant="contained">저장</Button>
            </DialogActions>
        </Dialog>
    );
};

export default PurchaseOrderModal;
