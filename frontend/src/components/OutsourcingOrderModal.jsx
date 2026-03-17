import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, MenuItem, Box, Typography, Tooltip, Autocomplete
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, History as HistoryIcon } from '@mui/icons-material';
import { Popover, List, ListItem, ListItemText, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Printer, Plus, Search } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PurchaseOrderTemplate from './PurchaseOrderTemplate';
import { ChevronRight, Printer, Plus, Search, Trash } from 'lucide-react';
import { Autocomplete } from '@mui/material';

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
import { ChevronRight, Printer, Plus, Search, Trash } from 'lucide-react';

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

const OutsourcingOrderModal = ({ isOpen, onClose, onSuccess, order, initialItems }) => {
    const navigate = useNavigate();
    const [partners, setPartners] = useState([]);
    const [products, setProducts] = useState([]);
    const [salesOrders, setSalesOrders] = useState([]);

    const { user: currentUser } = useAuth();
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

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [activeRowIndex, setActiveRowIndex] = useState(null);

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [activeRowIndex, setActiveRowIndex] = useState(null);

    const [approvalDoc, setApprovalDoc] = useState(null);
    const [defaultSteps, setDefaultSteps] = useState([]);

    // History Popover State
    const [anchorEl, setAnchorEl] = useState(null);
    const [priceHistory, setPriceHistory] = useState([]);
    const [activeItemIndex, setActiveItemIndex] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const fetchDefaultLines = async () => {
        try {
            const res = await api.get('/approval/lines', { params: { doc_type: 'PURCHASE_ORDER' } });
            const dummySteps = res.data.map(line => ({
                sequence: line.sequence,
                approver: line.approver,
                role: line.approver?.role,
                status: 'PENDING'
            }));
            setDefaultSteps(dummySteps);
        } catch (err) {
            console.error("Failed to fetch default lines", err);
        }
    };

    const fetchApprovalDoc = async () => {
        try {
            const res = await api.get('/approval/documents');
            const found = res.data.find(d => d.doc_type === 'PURCHASE_ORDER' && d.content?.order_no === order?.order_no);
            if (found) setApprovalDoc(found);
        } catch (err) {
            console.error("Failed to fetch approval doc", err);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchPartners();
            fetchProducts();
            fetchSalesOrders();
            if (order) fetchApprovalDoc();
            else fetchDefaultLines();
        } else {
            setApprovalDoc(null);
            setDefaultSteps([]);
        }
    }, [isOpen, order]);

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
        }
    }, [order]);

    useEffect(() => {
        if (isOpen && !order && initialItems && initialItems.length > 0 && products.length > 0 && partners.length > 0) {
            const firstPartnerName = initialItems[0].partner_name;
            const foundPartner = partners.find(p => p.name === firstPartnerName);

            const displayCode = initialItems[0]?.plan?.order?.order_no ||
                initialItems[0]?.plan?.stock_production?.production_no || '';

            setFormData(prev => ({
                ...prev,
                partner_id: foundPartner ? foundPartner.id : '',
                order_id: initialItems[0]?.plan?.order_id || '',
                display_order_no: displayCode,
                items: initialItems.map(item => {
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
            }));
        } else if (isOpen && !order && (!initialItems || initialItems.length === 0)) {
            setFormData(prev => ({
                ...prev,
                partner_id: '',
                order_id: '',
                items: []
            }));
        }
    }, [isOpen, order, initialItems, partners, products]);

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

    const handleItemChange = async (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;

        // Auto-fill price if product selected
        if (field === 'product_id' && value) {
            const product = products.find(p => p.id === value);
            
            try {
                // 1. Try to fetch LATEST purchase price from history
                const res = await api.get('/purchasing/price-history', {
                    params: { product_id: value, limit: 1 }
                });
                if (res.data && res.data.length > 0) {
                    newItems[index].unit_price = res.data[0].unit_price;
                } else if (product && product.standard_processes) {
                    // 2. Fallback to standard process cost
                    const outsourcingProc = product.standard_processes.find(sp =>
                        sp.course_type?.includes('OUTSOURCING') ||
                        sp.process?.course_type?.includes('OUTSOURCING')
                    );
                    if (outsourcingProc) {
                        newItems[index].unit_price = outsourcingProc.cost || 0;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch price history for price pre-fill", err);
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

            if (window.confirm("외주 발주서가 저장되었습니다. 이 내용으로 전자결재 [결재요청]을 즉시 진행하시겠습니까?")) {
                try {
                    const partner = partners.find(p => p.id === formData.partner_id);
                    const approvalPayload = {
                        title: `[외주발주서] ${partner?.name || ''} - ${formData.order_date}`,
                        doc_type: 'PURCHASE_ORDER',
                        content: {
                            order_no: savedOrder.order_no,
                            partner_name: partner?.name,
                            partner_phone: partner?.phone,
                            partner_fax: partner?.fax,
                            order_date: formData.order_date,
                            delivery_date: formData.delivery_date,
                            special_notes: formData.note,
                            items: formData.items.map((item, idx) => {
                                const prod = products.find(p => p.id === item.product_id);
                                return {
                                    idx: idx + 1,
                                    name: prod?.name,
                                    spec: prod?.specification || prod?.code,
                                    qty: item.quantity,
                                    price: item.unit_price,
                                    total: item.quantity * item.unit_price
                                };
                            })
                        },
                        reference_id: savedOrder.id,
                        reference_type: 'OUTSOURCING'
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
            console.error("Failed to save outsourcing order", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{order ? "외주 발주 수정" : "외주 발주 등록"}</DialogTitle>
            <DialogContent sx={{ p: 2, bgcolor: '#f4f4f5' }}>
                <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                        select
                        label="외주처 선택"
                        value={formData.partner_id}
                        onChange={(e) => setFormData({ ...formData, partner_id: e.target.value })}
                        size="small"
                        sx={{ minWidth: 200 }}
                        required
                    >
                        {partners.map((p) => (
                            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="납기일자"
                        type="date"
                        value={formData.delivery_date}
                        onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        required
                    />
                    {formData.display_order_no && (
                        <Typography variant="body2" color="text.secondary">
                            연결 번호: {formData.display_order_no}
                        </Typography>
                    )}
                </Paper>
                <PurchaseOrderTemplate 
                    data={{
                        order_no: formData.display_order_no || (order ? order.order_no : '자동 생성'),
                        partner_name: partners.find(p => p.id === formData.partner_id)?.name || '',
                        partner_phone: partners.find(p => p.id === formData.partner_id)?.phone || '',
                        partner_fax: partners.find(p => p.id === formData.partner_id)?.fax || '',
                        order_date: formData.order_date,
                        items: formData.items.map(item => {
                            const p = products.find(prod => prod.id === item.product_id);
                            return {
                                ...item,
                                name: p?.name || '',
                                spec: p?.specification || '',
                                qty: item.quantity,
                                price: item.unit_price,
                                total: (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
                            };
                        }),
                        special_notes: formData.note,
                        delivery_date: formData.delivery_date,
                        delivery_place: '당사 공장',
                        valid_until: '발주일로부터 30일',
                        payment_terms: '마감 후 30일',
                        colWidths: [40, 200, 120, 60, 80, 100]
                    }}
                    onChange={(field, val) => {
                        if (field === 'items') {
                            const newItems = val.map(v => ({
                                ...v,
                                quantity: v.qty,
                                unit_price: v.price
                            }));
                            setFormData(prev => ({ ...prev, items: newItems }));
                        } else if (field === 'special_notes') {
                            setFormData(prev => ({ ...prev, note: val }));
                        } else if (field === 'partner_id') {
                             setFormData(prev => ({ ...prev, partner_id: val }));
                        } else {
                            setFormData(prev => ({ ...prev, [field]: val }));
                        }
                    }}
                    onAddItem={handleAddItem}
                    onSearchProduct={(idx) => {
                        // For outsourcing we use a simplified product select in-template
                    }}
                    isReadOnly={false}
                    documentData={approvalDoc || { author: currentUser, steps: defaultSteps }}
                    currentUser={currentUser}
                    hideApprovalGrid={false}
                    className="p-[10mm] shadow-none border-none mx-auto my-4 max-w-[210mm]"
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button onClick={() => window.print()} color="info" startIcon={<Printer />}>인쇄</Button>
                <Button onClick={handleSubmit} variant="contained" color="primary">저장</Button>
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
