import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, MenuItem, Box, Typography, Tooltip
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, History as HistoryIcon } from '@mui/icons-material';
import { Popover, List, ListItem, ListItemText, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const OutsourcingOrderModal = ({ isOpen, onClose, onSuccess, order, initialItems }) => {
    const navigate = useNavigate();
    const [partners, setPartners] = useState([]);
    const [products, setProducts] = useState([]);
    const [salesOrders, setSalesOrders] = useState([]);

    const [formData, setFormData] = useState({
        partner_id: '',
        order_id: '',
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: '',
        note: '',
        status: 'PENDING',
        items: [],
        display_order_no: '' // For UI display of linked SO/SP
    });

    // History Popover State
    const [anchorEl, setAnchorEl] = useState(null);
    const [priceHistory, setPriceHistory] = useState([]);
    const [activeItemIndex, setActiveItemIndex] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        fetchPartners();
        fetchProducts();
        fetchSalesOrders();
    }, []);

    useEffect(() => {
        if (order) {
            setFormData({
                partner_id: order.partner_id || '',
                order_id: order.order_id || '',
                order_date: order.order_date,
                delivery_date: order.delivery_date || '',
                note: order.note || '',
                status: order.status || 'PENDING',
                items: order.items.map(item => ({
                    ...item,
                    product_id: item.product.id
                }))
            });
        } else if (isOpen && initialItems && initialItems.length > 0 && products.length > 0) {
            // Pre-fill from pending items
            const firstPartnerName = initialItems[0].partner_name;
            const foundPartner = partners.find(p => p.name === firstPartnerName);

            // Extract SO or SP code for display
            const displayCode = initialItems[0]?.plan?.order?.order_no ||
                initialItems[0]?.plan?.stock_production?.production_no || '';

            setFormData({
                partner_id: foundPartner ? foundPartner.id : '',
                order_id: initialItems[0]?.plan?.order_id || '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                note: '',
                status: 'PENDING',
                display_order_no: displayCode,
                items: initialItems.map(item => {
                    // Look up standard process cost for original process
                    const product = products.find(p => p.id === item.product_id);
                    let unitPrice = 0;
                    if (product && product.standard_processes) {
                        const standardProc = product.standard_processes.find(sp =>
                            sp.process?.name === item.process_name ||
                            sp.course_type?.includes('OUTSOURCING') ||
                            sp.process?.course_type?.includes('OUTSOURCING')
                        );
                        if (standardProc) unitPrice = standardProc.cost || 0;
                    }

                    return {
                        product_id: item.product_id,
                        quantity: item.quantity,
                        unit_price: unitPrice,
                        note: item.note,
                        production_plan_item_id: item.id
                    };
                })
            });
        } else if (isOpen) {
            setFormData({
                partner_id: '',
                order_id: '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                note: '',
                status: 'PENDING',
                items: []
            });
        }
    }, [order, isOpen, initialItems, partners, products]);

    const fetchPartners = async () => {
        try {
            const response = await api.get('/basics/partners/', { params: { type: 'SUBCONTRACTOR' } });
            setPartners(response.data);
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

    const fetchSalesOrders = async () => {
        try {
            const response = await api.get('/sales/orders');
            setSalesOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch sales orders", error);
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
            const product = products.find(p => p.id === value);
            if (product && product.standard_processes) {
                // Find OUTSOURCING process
                const outsourcingProc = product.standard_processes.find(sp =>
                    sp.course_type?.includes('OUTSOURCING') ||
                    sp.process?.course_type?.includes('OUTSOURCING')
                );
                if (outsourcingProc) {
                    newItems[index].unit_price = outsourcingProc.cost || 0;
                }
            }
        }

        setFormData({ ...formData, items: newItems });
    };

    const handleLookupHistory = async (event, index, productId) => {
        if (!productId) return;
        setAnchorEl(event.currentTarget);
        setActiveItemIndex(index);
        setLoadingHistory(true);
        try {
            const response = await api.get('/purchasing/price-history', {
                params: { product_id: productId, partner_id: formData.partner_id || undefined }
            });
            setPriceHistory(response.data);
        } catch (error) {
            console.error("Failed to fetch price history", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSelectHistoryPrice = (price) => {
        if (activeItemIndex !== null) {
            handleItemChange(activeItemIndex, 'unit_price', price);
        }
        setAnchorEl(null);
    };

    const handleSubmit = async () => {
        // Validation
        if (!formData.partner_id) return alert("외주처를 선택해 주세요.");
        if (!formData.delivery_date) return alert("납기일자를 입력해 주세요.");
        if (formData.items.length === 0) return alert("품목을 최소 1개 이상 추가해 주세요.");

        for (let i = 0; i < formData.items.length; i++) {
            const item = formData.items[i];
            if (!item.product_id) return alert(`${i + 1}번째 품목의 제품을 선택해 주세요.`);
            if (!item.quantity || item.quantity <= 0) return alert(`${i + 1}번째 품목의 수량을 입력해 주세요.`);
            if (item.unit_price === undefined || item.unit_price === null || item.unit_price < 0) return alert(`${i + 1}번째 품목의 단가를 입력해 주세요.`);
        }

        try {
            const payload = {
                ...formData,
                partner_id: formData.partner_id || null,
                order_id: formData.order_id || null,
                items: formData.items.map(item => ({
                    product_id: item.product_id,
                    quantity: parseInt(item.quantity) || 0,
                    unit_price: parseFloat(item.unit_price) || 0,
                    note: item.note || '',
                    production_plan_item_id: item.production_plan_item_id || null
                }))
            };

            let savedOrder;
            if (order) {
                const res = await api.put(`/purchasing/outsourcing/orders/${order.id}`, payload);
                savedOrder = res.data;
            } else {
                const res = await api.post('/purchasing/outsourcing/orders', payload);
                savedOrder = res.data;
            }

            // [Integration] Ask for approval submission
            if (window.confirm("외주 발주서가 저장되었습니다. 이 내용으로 전자결재 [결재요청]을 즉시 진행하시겠습니까?")) {
                try {
                    const partner = partners.find(p => p.id === formData.partner_id);
                    const approvalPayload = {
                        title: `[외주발주서] ${partner?.name || ''} - ${formData.order_date}`,
                        doc_type: 'PURCHASE_ORDER', // Use same PO form layout
                        content: {
                            order_no: savedOrder.order_no,
                            partner_name: partner?.name,
                            partner_phone: partner?.phone,
                            partner_fax: partner?.fax,
                            order_date: formData.order_date,
                            delivery_date: formData.delivery_date,
                            special_notes: formData.note,
                            items: formData.items.map((item, idx) => ({
                                idx: idx + 1,
                                name: products.find(p => p.id === item.product_id)?.name,
                                spec: products.find(p => p.id === item.product_id)?.specification || products.find(p => p.id === item.product_id)?.code,
                                qty: item.quantity,
                                price: item.unit_price,
                                total: item.quantity * item.unit_price
                            }))
                        },
                        reference_id: savedOrder.id,
                        reference_type: 'OUTSOURCING'
                    };
                    await api.post('/approval/documents', approvalPayload);
                    alert("결재 요청이 완료되었습니다.");
                    navigate('/approval?mode=MY_WAITING');
                } catch (appErr) {
                    console.error("Failed to submit approval", appErr);
                    alert("발주서는 저장되었으나, 결재 요청 중 오류가 발생했습니다: " + (appErr.response?.data?.detail || appErr.message));
                }
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to save outsourcing order", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{order ? "외주 발주 수정" : "외주 발주 등록"}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                    <TextField
                        select
                        label="외주처"
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
                    {(initialItems && initialItems.length > 0) ? (
                        <TextField
                            label="연결 수주/재고번호"
                            value={formData.display_order_no || '재고용'}
                            fullWidth
                            disabled
                        />
                    ) : (
                        <TextField
                            select
                            label="연결 수주번호"
                            value={formData.order_id}
                            onChange={(e) => setFormData({ ...formData, order_id: e.target.value })}
                            fullWidth
                        >
                            <MenuItem value=""><em>없음 (재고용)</em></MenuItem>
                            {salesOrders.map((so) => (
                                <MenuItem key={so.id} value={so.id}>
                                    {so.order_no} ({so.partner?.name})
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
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
                            <MenuItem value="COMPLETED">완료 (COMPLETED)</MenuItem>
                        </TextField>
                    )}
                </Box>

                <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>발주 품목</Typography>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>품목 (공정/제품)</TableCell>
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
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <TextField
                                                type="number"
                                                value={item.unit_price}
                                                onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                fullWidth
                                                size="small"
                                                variant="standard"
                                            />
                                            <Tooltip title="과거 단가 이력 조회">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => handleLookupHistory(e, index, item.product_id)}
                                                    disabled={!item.product_id}
                                                >
                                                    <HistoryIcon sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
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

            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 2, minWidth: 300, maxWidth: 450 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>과거 단가 이력 (최근 10건)</Typography>
                    <Divider sx={{ mb: 1 }} />
                    {loadingHistory ? (
                        <Typography variant="body2" sx={{ p: 2, textAlign: 'center' }}>로딩 중...</Typography>
                    ) : priceHistory.length === 0 ? (
                        <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>이력이 없습니다.</Typography>
                    ) : (
                        <List size="small" disablePadding>
                            {priceHistory.map((h, i) => (
                                <ListItem
                                    key={i}
                                    button
                                    onClick={() => handleSelectHistoryPrice(h.unit_price)}
                                    sx={{
                                        borderRadius: 1,
                                        '&:hover': { bgcolor: 'action.hover' },
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        py: 1
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 0.5 }}>
                                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                            {h.order_date}
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                                            ₩{h.unit_price.toLocaleString()}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                        <Typography variant="caption" color="text.secondary">
                                            {h.partner_name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            수량: {h.quantity}
                                        </Typography>
                                    </Box>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Box>
            </Popover>
        </Dialog>
    );
};

export default OutsourcingOrderModal;
