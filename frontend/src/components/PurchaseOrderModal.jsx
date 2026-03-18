import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, MenuItem, Box, Typography, Tooltip, Autocomplete
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, History as HistoryIcon } from '@mui/icons-material';
import { Popover, List, ListItem, ListItemText, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Printer, Pencil, Trash, ChevronRight } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PurchaseOrderTemplate from './PurchaseOrderTemplate';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';

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
                <Button onClick={() => window.print()} color="info">인쇄</Button>
            </DialogActions>
        </Dialog>
    );
};

const PurchaseOrderModal = ({ isOpen, onClose, onSuccess, order, initialItems, purchaseType }) => {
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
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

    const [approvalDoc, setApprovalDoc] = useState(null);
    const [defaultSteps, setDefaultSteps] = useState([]);

    const canApprove = (doc) => {
        if (!doc || !currentUser || !doc.steps) return false;
        const myStaffId = currentUser?.staff_id || currentUser?.id;
        const pendingApprovers = doc.steps.filter(a => a.status === 'PENDING');
        const currentApproverToSign = pendingApprovers.length > 0 ? pendingApprovers[0] : null;
        return currentApproverToSign && (Number(currentApproverToSign.approver_id) === Number(myStaffId) || Number(currentApproverToSign.staff_id) === Number(myStaffId));
    };

    const handleProcessApproval = async (status) => {
        const comment = window.prompt(status === 'APPROVED' ? "승인 하시겠습니까? (의견 입력 가능)" : "반려 사유를 입력하세요.");
        if (status === 'REJECTED' && comment === null) return;
        
        try {
            await api.post(`/approval/documents/${approvalDoc.id}/process`, {
                status: status,
                comment: comment || ''
            });
            alert(status === 'APPROVED' ? "승인되었습니다." : "반려되었습니다.");
            fetchApprovalDoc();
            if (onSuccess) onSuccess();
        } catch (error) {
            console.error("Approval process failed", error);
            alert("처리 실패: " + (error.response?.data?.detail || error.message));
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
    }, [isOpen, purchaseType, order, formData.partner_id]);

    const fetchDefaultLines = async () => {
        try {
            const res = await api.get('/approval/lines', { params: { doc_type: 'PURCHASE_ORDER' } });
            // Map lines to dummy steps for preview
            const dummySteps = res.data.map(line => ({
                sequence: line.sequence,
                approver: line.approver,
                status: 'PENDING'
            }));
            setDefaultSteps(dummySteps);
        } catch (err) {
            console.error("Failed to fetch default lines", err);
        }
    };

    const fetchApprovalDoc = async () => {
        try {
            // Use the dedicated by-reference endpoint for efficiency and reliability
            const res = await api.get('/approval/documents/by-reference', {
                params: {
                    reference_id: order.id,
                    reference_type: 'PURCHASE'
                }
            });
            if (res.data) {
                setApprovalDoc(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch approval doc", err);
        }
    };

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
                    product_id: item.product.id,
                    order_size: item.order_size || '',
                    material: item.material || ''
                }))
            });
        }
    }, [order]);

    // Pre-fill logic: Only run once when modal opens and initialItems are provided
    useEffect(() => {
        if (isOpen && !order && initialItems && initialItems.length > 0) {
            // [Defense] Try various field names for partner identification
            const firstItem = initialItems[0];
            const firstPartnerName = firstItem.partner_name || 
                                     (firstItem.partner && (typeof firstItem.partner === 'string' ? firstItem.partner : firstItem.partner.name)) ||
                                     firstItem.supplier_name || '';
                                     
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
                    // [Defense] Try various field names for product/item/material
                    const productObj = item?.product || item?.material || item?.item || {};
                    const productId = item?.product_id || productObj?.id || item?.material_id || item?.item_id;
                    
                    if (item?.type === 'PENDING') {
                        // Priority: 1. standard_processes of provided product, 2. products list, 3. item.unit_price
                        const product = productObj?.id ? productObj : (products.find(p => p?.id === productId) || {});
                        let unitPrice = item?.unit_price || 0;
                        
                        if (product && product?.standard_processes) {
                            const standardProc = product?.standard_processes?.find(sp =>
                                sp?.process?.name === item?.process_name ||
                                sp?.course_type?.includes('PURCHASE') ||
                                sp?.process?.course_type?.includes('PURCHASE')
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
                            material: productObj?.material || ''
                        };
                    } else if (item?.type === 'MRP') {
                        const product = productObj?.id ? productObj : (products.find(p => p?.id === productId) || {});
                        let unitPrice = 0;
                        if (product && product?.standard_processes) {
                            const standardProc = product?.standard_processes?.find(sp =>
                                sp?.course_type?.includes('PURCHASE') ||
                                sp?.process?.course_type?.includes('PURCHASE')
                            );
                            if (standardProc) unitPrice = standardProc?.cost || 0;
                        }
                        return {
                            product_id: productId || '',
                            quantity: item?.shortage_quantity !== undefined ? item?.shortage_quantity : (item?.required_purchase_qty || 0),
                            unit_price: unitPrice || 0,
                            note: 'MRP 소요량 기반 발주',
                            production_plan_item_id: null,
                            material_requirement_id: item?.id,
                            current_stock: item?.current_stock,
                            required_quantity: item?.required_quantity !== undefined ? item?.required_quantity : (item?.total_demand || 0),
                            shortage_quantity: item?.shortage_quantity !== undefined ? item?.shortage_quantity : (item?.required_purchase_qty || 0)
                        };
                    } else if (item?.type === 'CONSUMABLE_WAIT') {
                        return {
                            product_id: productId || '',
                            quantity: item?.quantity || 1,
                            unit_price: item?.unit_price || 0,
                            note: item?.remarks || '',
                            consumable_purchase_wait_id: item?.id
                        };
                    }
                    return {
                        product_id: productId || '',
                        quantity: item?.quantity || 1,
                        unit_price: item?.unit_price || 0,
                        note: item?.note || ''
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
    }, [isOpen, order, initialItems, products, partners]); // Added products/partners back to deps to ensure mapping completes when they load

    // Sync partner_id when partners are loaded
    useEffect(() => {
        if (isOpen && !order && initialItems && initialItems.length > 0 && partners.length > 0 && !formData.partner_id) {
            const firstPartnerName = initialItems[0].partner_name;
            const foundPartner = partners.find(p => p.name === firstPartnerName);
            if (foundPartner) {
                setFormData(prev => ({ ...prev, partner_id: foundPartner.id }));
            }
        }
    }, [partners, isOpen, initialItems]);

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
            // Material purchase (PART) should include RAW_MATERIAL
            // Consumable purchase should only include CONSUMABLE
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

        // Auto-fill price AND material if product selected
        if (field === 'product_id' && value) {
            const product = products.find(p => p.id === value);
            
            // Auto-fill material if available
            if (product && product.material) {
                newItems[index].material = product.material;
            }

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
                    order_size: item.order_size || '',
                    material: item.material || '',
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

            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to save purchase order", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
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
            <DialogTitle>{order ? "발주서 수정" : "발주서 등록"}</DialogTitle>
            <DialogContent sx={{ p: 2, bgcolor: '#f8f9fa' }}>
                {/* Header Section: Partner & Order Info */}
                <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                    <Autocomplete
                        options={partners}
                        getOptionLabel={(option) => option.name || ''}
                        value={partners.find(p => p.id === formData.partner_id) || null}
                        onChange={(_, newValue) => {
                            setFormData({ ...formData, partner_id: newValue ? newValue.id : '' });
                        }}
                        renderInput={(params) => (
                            <TextField {...params} label="거래처 검색/선택" size="small" sx={{ minWidth: 250 }} required />
                        )}
                        sx={{ flexGrow: 1 }}
                    />
                    
                    <TextField
                        label="발주일자"
                        type="date"
                        value={formData.order_date}
                        onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                        size="small"
                        InputLabelProps={{ shrink: true }}
                    />

                    <TextField
                        label="납기일자"
                        type="date"
                        value={formData.delivery_date}
                        onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        required
                    />

                    <TextField
                        label="비고"
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        size="small"
                        placeholder="특이사항 입력"
                        sx={{ flexGrow: 2 }}
                    />
                    
                    {formData.display_order_no && (
                        <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold' }}>
                            연결 번호: {formData.display_order_no}
                        </Typography>
                    )}
                </Paper>

                {/* Items Section: Proper Interactive Table */}
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ChevronRight size={18} /> 발주 품목 상세
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#f4f4f5' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold', width: 50, textAlign: 'center' }}>No</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>품목명 / 규격</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 100, textAlign: 'center' }}>수량</TableCell>
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
                                                    readOnly={!!item.production_plan_item_id || !!item.material_requirement_id || !!item.consumable_purchase_wait_id}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ width: 100 }}>
                                                <TextField
                                                    type="number"
                                                    size="small"
                                                    fullWidth
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                    inputProps={{ min: 1, style: { textAlign: 'center' } }}
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
                                                    <Tooltip title="단가 이력 조회">
                                                        <IconButton size="small" onClick={(e) => handleLookupHistory(e, index, item.product_id)}>
                                                            <HistoryIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ width: 150, textAlign: 'right' }}>
                                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                    ₩{((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toLocaleString()}
                                                </Typography>
                                            </TableCell>
                                            <TableCell rowSpan={2} align="center" sx={{ borderLeft: '1px solid #eee' }}>
                                                <IconButton 
                                                    size="small" 
                                                    color="error" 
                                                    onClick={() => handleRemoveItem(index)}
                                                    disabled={!!item.production_plan_item_id || !!item.material_requirement_id || !!item.consumable_purchase_wait_id}
                                                >
                                                    <DeleteIcon fontSize="small" />
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
                                                        placeholder="상세 내용을 입력하세요."
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
                            {formData.items.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                        등록된 품목이 없습니다. 아래의 [품목 추가] 버튼을 눌러주세요.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                
                <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
                    {(!initialItems || initialItems.length === 0) && (
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={handleAddItem}
                            size="small"
                        >
                            품목 추가
                        </Button>
                    )}
                </Box>

            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button onClick={() => window.print()} color="info" startIcon={<Printer />}>인쇄</Button>
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
