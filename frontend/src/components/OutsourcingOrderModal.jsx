import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, MenuItem, Box, Typography, Tooltip, Autocomplete, Popover, List, ListItem, ListItemText, Divider
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, History as HistoryIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Printer, Search, Trash } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PurchaseOrderTemplate from './PurchaseOrderTemplate';

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
        display_order_no: ''
    });

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [activeRowIndex, setActiveRowIndex] = useState(null);

    const [approvalDoc, setApprovalDoc] = useState(null);
    const [defaultSteps, setDefaultSteps] = useState([]);

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
            const res = await api.get('/approval/documents/by-reference', {
                params: {
                    reference_id: order?.id,
                    reference_type: 'OUTSOURCING'
                }
            });
            if (res.data) {
                setApprovalDoc(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch approval doc", err);
        }
    };

    const canApprove = (doc) => {
        if (!doc || !currentUser || !doc.steps) return false;
        const myStaffId = currentUser?.staff_id || currentUser?.id;
        const currentApproverToSign = doc.steps.find(step => step.status === 'PENDING');
        return currentApproverToSign && (Number(currentApproverToSign.approver_id) === Number(myStaffId) || Number(currentApproverToSign.staff_id) === Number(myStaffId));
    };

    const handleProcessApproval = async (status) => {
        if (!approvalDoc) return;
        const comment = window.prompt(status === 'APPROVED' ? "승인 하시겠습니까? (의견 입력 가능)" : "반려 사유를 입력하세요.");
        if (status === 'REJECTED' && !comment) return alert("반려 사유를 입력해야 합니다.");
        
        try {
            await api.patch(`/approval/documents/${approvalDoc.id}/process`, {
                status: status,
                comment: comment || ''
            });
            alert(status === 'APPROVED' ? "승인되었습니다." : "반려되었습니다.");
            fetchApprovalDoc();
            if (onSuccess) onSuccess();
        } catch (err) {
            console.error("Process failed", err);
            alert("처리 중 오류가 발생했습니다.");
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
    }, [isOpen, order, formData.partner_id]);

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
                    product_id: item.product.id,
                    order_size: item.order_size || '',
                    material: item.material || '',
                    pricing_type: item.pricing_type || 'UNIT',
                    total_weight: item.total_weight || 0
                }))
            });
        }
    }, [order]);

    useEffect(() => {
        if (isOpen && !order && initialItems && initialItems.length > 0) {
            // [Defense] Try various field names for partner identification
            const firstItem = initialItems[0];
            const firstPartnerName = firstItem.partner_name || 
                                     (firstItem.partner && (typeof firstItem.partner === 'string' ? firstItem.partner : firstItem.partner.name)) ||
                                     firstItem.outsourcing_company || '';
                                     
            const foundPartner = partners.find(p => p.name === firstPartnerName);

            const displayCode = firstItem?.sales_order_number ||
                firstItem?.plan?.order?.order_no ||
                firstItem?.plan?.stock_production?.production_no || '';

            setFormData(prev => ({
                ...prev,
                partner_id: foundPartner ? foundPartner.id : (prev.partner_id || ''),
                order_id: firstItem?.plan?.order_id || '',
                display_order_no: displayCode,
                items: (initialItems || []).map(item => {
                    // [Defense] Try various field names for product/item
                    const productObj = item?.product || item?.item || item?.material || {};
                    const productId = item?.product_id || productObj?.id || item?.item_id;
                    
                    // Prioritize product detail from mapping if available
                    const product = productObj?.id ? productObj : (products.find(p => p?.id === productId) || {});
                    
                    let unitPrice = item?.unit_price || 0;
                    if (product && product?.standard_processes) {
                        const standardProc = product?.standard_processes?.find(sp =>
                            sp?.process?.name === item?.process_name ||
                            sp?.course_type?.includes('OUTSOURCING') ||
                            sp?.process?.course_type?.includes('OUTSOURCING')
                        );
                        if (standardProc) unitPrice = standardProc?.cost || unitPrice;
                    }

                    return {
                        product_id: productId || '',
                        quantity: item?.quantity || 1,
                        unit_price: unitPrice,
                        note: item?.note || item?.process_name || '',
                        production_plan_item_id: item?.id,
                        display_product_name: productObj?.name || item?.product_name_of_plan || '',
                        display_client_name: item?.client_name || '',
                        order_size: '',
                        material: productObj?.material || '',
                        pricing_type: 'UNIT',
                        total_weight: 0
                    };
                })
            }));
        } else if (isOpen && !order && (!initialItems || initialItems?.length === 0)) {
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
            // Outsourcing should only show PRODUCT or HALF_PRODUCT
            // CEO instructed to remove the partner_id filter to allow searching all items
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
            items: [...formData.items, { product_id: '', quantity: 0, unit_price: 0, note: '', material: '', order_size: '', pricing_type: 'UNIT', total_weight: 0 }]
        });
    };

    const handleRemoveItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const handleItemChange = async (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;

        if (field === 'product_id' && value) {
            const product = products.find(p => p.id === value);
            
            // Auto-fill material
            if (product && product.material) {
                newItems[index].material = product.material;
            }

            try {
                const res = await api.get('/purchasing/price-history', {
                    params: { product_id: value, limit: 1 }
                });
                if (res.data && res.data.length > 0) {
                    newItems[index].unit_price = res.data[0].unit_price;
                } else if (product && product.standard_processes) {
                    const outsourcingProc = product.standard_processes.find(sp =>
                        sp.course_type?.includes('OUTSOURCING') ||
                        sp.process?.course_type?.includes('OUTSOURCING')
                    );
                    if (outsourcingProc) {
                        newItems[index].unit_price = outsourcingProc.cost || 0;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch price history", err);
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
                params: { product_id: productId }
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
                items: formData.items.map(item => ({
                    product_id: item.product_id,
                    quantity: parseInt(item.quantity) || 0,
                    unit_price: parseFloat(item.unit_price) || 0,
                    note: item.note || '',
                    order_size: item.order_size || '',
                    material: item.material || '',
                    pricing_type: item.pricing_type || 'UNIT',
                    total_weight: parseFloat(item.total_weight) || 0,
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

            onSuccess();
            onClose();
        } catch (error) {
            alert("저장 실패");
        }
    };

    // [Defense] Safe product label formatter
    const getProductLabel = (p) => {
        if (!p) return '';
        const code = p.code || p.product_code || '';
        const name = p.name || p.product_name || '';
        const spec = p.specification || p.spec || '';
        return `[${code || 'N/A'}] ${name}${spec ? ` (${spec})` : ''}`;
    };

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>{order ? "외주 발주 수정" : "외주 발주 등록"}</DialogTitle>
            <DialogContent sx={{ p: 2, bgcolor: '#f8f9fa' }}>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                    <Autocomplete
                        options={partners}
                        getOptionLabel={(option) => option.name || ''}
                        value={partners.find(p => p.id === formData.partner_id) || null}
                        onChange={(_, newValue) => setFormData({ ...formData, partner_id: newValue ? newValue.id : '' })}
                        renderInput={(params) => <TextField {...params} label="외주처 검색/선택" size="small" sx={{ minWidth: 250 }} required />}
                        sx={{ flexGrow: 1 }}
                    />
                    <TextField label="발주일자" type="date" value={formData.order_date} onChange={(e) => setFormData({ ...formData, order_date: e.target.value })} size="small" InputLabelProps={{ shrink: true }} />
                    <TextField label="납기일자" type="date" value={formData.delivery_date} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} size="small" InputLabelProps={{ shrink: true }} required />
                    <TextField label="비고" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} size="small" placeholder="특이사항" sx={{ flexGrow: 2 }} />
                </Paper>

                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    <ChevronRight size={18} /> 외주 발주 품목 상세
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#f4f4f5' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold', width: 50, textAlign: 'center' }}>No</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>품목명 / 규격</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 100, textAlign: 'center' }}>수량</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 100, textAlign: 'center' }}>단가기준</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 100, textAlign: 'center' }}>총중량(kg)</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 150, textAlign: 'right' }}>단가</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 150, textAlign: 'right' }}>금액</TableCell>
                                <TableCell align="center" sx={{ width: 60 }}>삭제</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {formData.items.map((item, index) => {
                                const prod = products.find(p => p.id === item.product_id);
                                return (
                                    <React.Fragment key={index}>
                                        {/* Row 1: Primary Fields */}
                                        <TableRow sx={{ '& > td': { borderBottom: 'none' } }}>
                                            <TableCell rowSpan={2} sx={{ textAlign: 'center', borderRight: '1px solid #eee' }}>{index + 1}</TableCell>
                                            <TableCell>
                                                <Autocomplete
                                                    size="small"
                                                    options={products}
                                                    getOptionLabel={getProductLabel}
                                                    isOptionEqualToValue={(option, value) => option.id === value?.id}
                                                    value={prod || null}
                                                    onChange={(_, newValue) => handleItemChange(index, 'product_id', newValue ? newValue.id : '')}
                                                    renderInput={(params) => <TextField {...params} placeholder="품목 검색/선택" variant="outlined" />}
                                                    renderOption={(props, option) => (
                                                        <li {...props}>
                                                            <Box>
                                                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                                    [{option.code || option.product_code}] {option.name}
                                                                </Typography>
                                                                <Typography variant="caption" color="textSecondary">
                                                                    규격: {option.specification || '-'} | 현재고: {option.current_inventory || 0}
                                                                </Typography>
                                                            </Box>
                                                        </li>
                                                    )}
                                                    sx={{ width: '100%' }}
                                                    readOnly={!!item.production_plan_item_id}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ width: 100 }}>
                                                <TextField 
                                                    type="number" 
                                                    size="small" 
                                                    fullWidth
                                                    value={item.quantity} 
                                                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} 
                                                    inputProps={{ style: { textAlign: 'center' } }}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ width: 100 }}>
                                                <TextField 
                                                    select
                                                    size="small" 
                                                    fullWidth
                                                    value={item.pricing_type || 'UNIT'} 
                                                    onChange={(e) => handleItemChange(index, 'pricing_type', e.target.value)} 
                                                    inputProps={{ style: { textAlign: 'center' } }}
                                                >
                                                    <MenuItem value="UNIT">수량</MenuItem>
                                                    <MenuItem value="WEIGHT">중량</MenuItem>
                                                </TextField>
                                            </TableCell>
                                            <TableCell sx={{ width: 100 }}>
                                                <TextField 
                                                    type="number" 
                                                    size="small" 
                                                    fullWidth
                                                    disabled={item.pricing_type !== 'WEIGHT'}
                                                    value={item.total_weight || ''} 
                                                    onChange={(e) => handleItemChange(index, 'total_weight', e.target.value)} 
                                                    inputProps={{ style: { textAlign: 'center' } }}
                                                    placeholder={item.pricing_type === 'WEIGHT' ? 'kg' : '-'}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ width: 150 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <TextField 
                                                        type="number" 
                                                        size="small" 
                                                        fullWidth
                                                        value={item.unit_price} 
                                                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)} 
                                                        inputProps={{ style: { textAlign: 'right' } }}
                                                    />
                                                    <Tooltip title="단가 이력">
                                                        <IconButton size="small" onClick={(e) => handleLookupHistory(e, index, item.product_id)}><HistoryIcon fontSize="small" /></IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ width: 150, textAlign: 'right' }}>
                                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                    ₩{(
                                                        (item.pricing_type === 'WEIGHT' 
                                                            ? (parseFloat(item.total_weight) || 0) 
                                                            : (parseFloat(item.quantity) || 0)
                                                        ) * (parseFloat(item.unit_price) || 0)
                                                    ).toLocaleString()}
                                                </Typography>
                                            </TableCell>
                                            <TableCell rowSpan={2} align="center" sx={{ borderLeft: '1px solid #eee' }}>
                                                <IconButton 
                                                    size="small" 
                                                    color="error" 
                                                    onClick={() => handleRemoveItem(index)}
                                                    disabled={!!item.production_plan_item_id}
                                                >
                                                    <Trash size={16} />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>

                                        {/* Row 2: Secondary Fields */}
                                        <TableRow sx={{ bgcolor: '#fafafa' }}>
                                            <TableCell colSpan={4} sx={{ pt: 0, pb: 1 }}>
                                                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                                    <TextField
                                                        size="small"
                                                        label="재질"
                                                        value={item.material || ''}
                                                        onChange={(e) => handleItemChange(index, 'material', e.target.value)}
                                                        sx={{ width: 180, bgcolor: 'white' }}
                                                    />
                                                    <TextField
                                                        size="small"
                                                        label="주문사이즈"
                                                        value={item.order_size || ''}
                                                        onChange={(e) => handleItemChange(index, 'order_size', e.target.value)}
                                                        sx={{ width: 180, bgcolor: 'white' }}
                                                    />
                                                    <TextField
                                                        size="small"
                                                        label="비고"
                                                        placeholder="비고"
                                                        fullWidth
                                                        value={item.note || ''}
                                                        onChange={(e) => handleItemChange(index, 'note', e.target.value)}
                                                        sx={{ bgcolor: 'white' }}
                                                    />
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    </React.Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
                {(!initialItems || initialItems.length === 0) && (
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddItem} size="small">항목 추가</Button>
                )}
            </DialogContent>
            <DialogActions sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 10, borderTop: '1px solid #eee', p: 2 }}>
                <Button onClick={onClose}>취소</Button>
                {canApprove(approvalDoc) && (
                    <>
                        <Button onClick={() => handleProcessApproval('REJECTED')} color="error" variant="outlined">반려</Button>
                        <Button onClick={() => handleProcessApproval('APPROVED')} color="success" variant="contained">승인</Button>
                    </>
                )}
                <Button onClick={handleSubmit} variant="contained" color="primary">저장</Button>
            </DialogActions>


            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Box sx={{ p: 2, minWidth: 250 }}>
                    <Typography variant="subtitle2">단가 이력</Typography>
                    <Divider sx={{ my: 1 }} />
                    {loadingHistory ? <Typography variant="caption">로딩 중...</Typography> : priceHistory.map((h, i) => (
                        <ListItem key={i} button onClick={() => handleSelectHistoryPrice(h.unit_price)}>
                            <ListItemText primary={`₩${h.unit_price.toLocaleString()}`} secondary={`${h.order_date} | ${h.partner_name}`} />
                        </ListItem>
                    ))}
                </Box>
            </Popover>
        </Dialog>
    );
};

export default OutsourcingOrderModal;
