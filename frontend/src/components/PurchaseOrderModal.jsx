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

const ProductSelectionModal = ({ isOpen, onClose, onSelect, products }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.specification && p.specification.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>제품 선택</DialogTitle>
            <DialogContent>
                <TextField
                    fullWidth
                    label="검색 (품명 또는 규격)"
                    variant="outlined"
                    size="small"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    sx={{ mb: 2, mt: 1 }}
                />
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>품목명</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>규격</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>현재고</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>주거래처</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 'bold' }}>선택</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredProducts.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell>{p.name}</TableCell>
                                    <TableCell>{p.specification || '-'}</TableCell>
                                    <TableCell align="right">{p.current_inventory || 0}</TableCell>
                                    <TableCell>{p.partner_name || '-'}</TableCell>
                                    <TableCell align="center">
                                        <Button size="small" variant="contained" onClick={() => onSelect(p)}>선택</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
            </DialogActions>
        </Dialog>
    );
};

const PurchaseOrderModal = ({ isOpen, onClose, onSuccess, order, initialItems, purchaseType }) => {
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
        purchase_type: purchaseType || 'PART',
        items: [],
        display_order_no: '' // For UI display of linked SO/SP
    });

    // History Popover State
    const [anchorEl, setAnchorEl] = useState(null);
    const [priceHistory, setPriceHistory] = useState([]);
    const [activeItemIndex, setActiveItemIndex] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Product Modal State
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [activeRowIndex, setActiveRowIndex] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchPartners();
            fetchProducts();
            fetchSalesOrders();
        }
    }, [isOpen, purchaseType]);

    useEffect(() => {
        if (order) {
            setFormData({
                partner_id: order.partner_id || '',
                order_id: order.order_id || '',
                order_date: order.order_date,
                delivery_date: order.delivery_date || '',
                note: order.note || '',
                status: order.status || 'PENDING',
                purchase_type: order.purchase_type || purchaseType || 'PART',
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
            const displayCode = initialItems[0]?.sales_order_number ||
                initialItems[0]?.plan?.order?.order_no ||
                initialItems[0]?.plan?.stock_production?.production_no || '';

            setFormData({
                partner_id: foundPartner ? foundPartner.id : '',
                order_id: initialItems[0]?.plan?.order_id || '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                note: '',
                status: 'PENDING',
                purchase_type: purchaseType || 'PART',
                display_order_no: displayCode,
                items: initialItems.map(item => {
                    if (item.type === 'PENDING') {
                        // Original Pending Item (ProductionPlanItem)
                        const product = products.find(p => p.id === item.product_id);
                        let unitPrice = 0;
                        if (product && product.standard_processes) {
                            const standardProc = product.standard_processes.find(sp =>
                                sp.process?.name === item.process_name ||
                                sp.course_type?.includes('PURCHASE') ||
                                sp.process?.course_type?.includes('PURCHASE')
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
                    } else if (item.type === 'MRP') {
                        // MRP Item
                        const product = products.find(p => p.id === item.product_id);
                        let unitPrice = 0;
                        if (product && product.standard_processes) {
                            const standardProc = product.standard_processes.find(sp =>
                                sp.course_type?.includes('PURCHASE') ||
                                sp.process?.course_type?.includes('PURCHASE')
                            );
                            if (standardProc) unitPrice = standardProc.cost || 0;
                        }

                        return {
                            product_id: item.product_id,
                            quantity: item.shortage_quantity !== undefined ? item.shortage_quantity : (item.required_purchase_qty || 0),
                            unit_price: unitPrice,
                            note: 'MRP 소요량 기반 발주',
                            production_plan_item_id: null,
                            material_requirement_id: item.id,
                            current_stock: item.current_stock,
                            required_quantity: item.required_quantity !== undefined ? item.required_quantity : item.total_demand,
                            shortage_quantity: item.shortage_quantity !== undefined ? item.shortage_quantity : item.required_purchase_qty
                        };
                    } else if (item.type === 'CONSUMABLE_WAIT') {
                        // Consumable Purchase Wait Item
                        return {
                            product_id: item.product_id,
                            quantity: item.quantity,
                            unit_price: 0,
                            note: item.remarks || '',
                            consumable_purchase_wait_id: item.id
                        };
                    }
                    return item;
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
            const response = await api.get('/basics/partners/', { params: { type: 'SUPPLIER' } });
            setPartners(response.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    const fetchProducts = async () => {
        try {
            // Filter by purchaseType
            let typeParam = 'PART,RAW_MATERIAL';
            if (purchaseType === 'CONSUMABLE') {
                typeParam = 'CONSUMABLE';
            }
            const response = await api.get('/product/products', { params: { item_type: typeParam } });
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

    const handleItemChange = async (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;

        // Auto-fill price if product selected
        if (field === 'product_id' && value) {
            const product = products.find(p => p.id === value);

            // 1. Try to fetch LATEST purchase price from history
            try {
                const res = await api.get('/purchasing/price-history', {
                    params: { product_id: value, limit: 1 }
                });
                if (res.data && res.data.length > 0) {
                    newItems[index].unit_price = res.data[0].unit_price;
                } else if (product && product.standard_processes) {
                    // 2. Fallback to standard process cost
                    const purchaseProc = product.standard_processes.find(sp =>
                        sp.course_type?.includes('PURCHASE') ||
                        sp.process?.course_type?.includes('PURCHASE')
                    );
                    if (purchaseProc) {
                        newItems[index].unit_price = purchaseProc.cost || 0;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch latest price", err);
            }
        }

        setFormData({ ...formData, items: newItems });
    };

    const handleSelectProduct = (product) => {
        if (activeRowIndex !== null) {
            handleItemChange(activeRowIndex, 'product_id', product.id);
        }
        setIsProductModalOpen(false);
        setActiveRowIndex(null);
    };


    const handleLookupHistory = async (event, index, productId) => {
        if (!productId) return;
        setAnchorEl(event.currentTarget);
        setActiveItemIndex(index);
        setLoadingHistory(true);
        try {
            const response = await api.get('/purchasing/price-history', {
                params: {
                    product_id: productId,
                    partner_id: formData.partner_id || undefined,
                    purchase_type: formData.purchase_type // For more specific history if needed
                }
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
        if (!formData.partner_id) return alert("거래처를 선택해 주세요.");
        if (!formData.delivery_date) return alert("납품일자를 입력해 주세요.");
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
                    id: item.id || undefined,
                    product_id: item.product_id,
                    quantity: parseInt(item.quantity) || 0,
                    unit_price: parseFloat(item.unit_price) || 0,
                    note: item.note || '',
                    production_plan_item_id: item.production_plan_item_id || null,
                    material_requirement_id: item.material_requirement_id || null,
                    consumable_purchase_wait_id: item.consumable_purchase_wait_id || null
                }))
            };

            let savedOrder;
            if (order) {
                const res = await api.put(`/purchasing/purchase/orders/${order.id}`, payload);
                savedOrder = res.data;
            } else {
                const res = await api.post('/purchasing/purchase/orders', payload);
                savedOrder = res.data;
            }

            // [Integration] Ask for approval submission
            if (window.confirm("발주서가 저장되었습니다. 이 내용으로 전자결재 [결재요청]을 즉시 진행하시겠습니까?")) {
                try {
                    // 결재선 데이터 미리 가져오기
                    const lineRes = await api.get('/approval/lines?doc_type=PURCHASE_ORDER');
                    const customApprovers = lineRes.data.map(line => ({
                        approver_id: line.approver_id,
                        sequence: line.sequence
                    }));

                    const partner = partners.find(p => p.id === formData.partner_id);
                    const approvalPayload = {
                        title: `[${formData.purchase_type === 'CONSUMABLE' ? '소모품' : '구매'}발주서] ${partner?.name || ''} - ${formData.order_date}`,
                        doc_type: 'PURCHASE_ORDER',
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
                                spec: products.find(p => p.id === item.product_id)?.specification,
                                qty: item.quantity,
                                price: item.unit_price,
                                total: item.quantity * item.unit_price
                            }))
                        },
                        custom_approvers: customApprovers,
                        reference_id: savedOrder.id,
                        reference_type: 'PURCHASE'
                    };
                    await api.post('/approval/documents', approvalPayload);
                    alert("결재 요청이 완료되었습니다.");
                    navigate('/approval?mode=MY_WAITING');
                } catch (appErr) {
                    console.error("Failed to submit approval", appErr);
                    const errorMsg = appErr.response?.data?.detail 
                        ? (typeof appErr.response.data.detail === 'string' ? appErr.response.data.detail : JSON.stringify(appErr.response.data.detail))
                        : appErr.message;
                    alert("발주서는 저장되었으나, 결재 요청 중 오류가 발생했습니다: " + errorMsg);
                }
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
                    {(initialItems && initialItems.length > 0) ? (
                        <TextField
                            label="연결 데이터 소스"
                            value={formData.display_order_no ? `연결 수주번호: [${formData.display_order_no}]` : '연결 수주번호: [없음/재고용]'}
                            fullWidth
                            disabled
                            InputProps={{
                                style: { fontWeight: 'bold', color: '#1976d2' }
                            }}
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
                        label="납품요청일"
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
                                <TableCell width="15%">규격</TableCell>
                                {initialItems?.some(i => i.type === 'MRP') && (
                                    <>
                                        <TableCell width="10%">현재고</TableCell>
                                        <TableCell width="10%">총 소요량</TableCell>
                                    </>
                                )}
                                <TableCell width="10%">수량</TableCell>
                                <TableCell width="15%">단가</TableCell>
                                <TableCell width="15%">비고</TableCell>
                                <TableCell width="5%"></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {formData.items.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 100 }}>
                                                {products.find(p => p.id === item.product_id)?.name || '품목 선택'}
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    setActiveRowIndex(index);
                                                    setIsProductModalOpen(true);
                                                }}
                                            >
                                                찾기
                                            </Button>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption">
                                            {products.find(p => p.id === item.product_id)?.specification || '-'}
                                        </Typography>
                                    </TableCell>
                                    {initialItems?.some(i => i.type === 'MRP') && (
                                        <>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ textAlign: 'right', pr: 2 }}>
                                                    {item.current_stock?.toLocaleString() || '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ textAlign: 'right', pr: 2 }}>
                                                    {item.required_quantity?.toLocaleString() || '-'}
                                                </Typography>
                                            </TableCell>
                                        </>
                                    )}
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

            <ProductSelectionModal
                isOpen={isProductModalOpen}
                onClose={() => {
                    setIsProductModalOpen(false);
                    setActiveRowIndex(null);
                }}
                onSelect={handleSelectProduct}
                products={products}
            />

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
                                            ₩{(h.unit_price || 0).toLocaleString()}
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

export default PurchaseOrderModal;
