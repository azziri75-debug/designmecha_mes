import React, { useState, useEffect, useRef, useCallback } from 'react';
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

    // ── Resizable Columns ─────────────────────────────────────
    const OO_LS_KEY = 'outsourcing_order_modal_col_widths';
    const OO_DEFAULT = { name: 220, pricingType: 120, qty: 150, price: 130, amount: 130 };
    const [ooColW, setOoColW] = useState(() => {
        try { const s = localStorage.getItem(OO_LS_KEY); if (s) return JSON.parse(s); } catch {}
        return OO_DEFAULT;
    });
    const ooResizingCol = useRef(null);
    const ooStartX = useRef(0);
    const ooStartWidth = useRef(0);
    const ooResizerStyle = { position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'col-resize', background: 'transparent', zIndex: 1 };
    const ooMouseMove = useCallback((e) => {
        if (!ooResizingCol.current) return;
        setOoColW(prev => ({ ...prev, [ooResizingCol.current]: Math.max(50, ooStartWidth.current + e.clientX - ooStartX.current) }));
    }, []);
    const ooMouseUp = useCallback(() => {
        ooResizingCol.current = null;
        document.removeEventListener('mousemove', ooMouseMove);
        document.removeEventListener('mouseup', ooMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setOoColW(prev => { try { localStorage.setItem(OO_LS_KEY, JSON.stringify(prev)); } catch {} return prev; });
    }, [ooMouseMove]);
    const ooMouseDown = (col, e) => {
        e.preventDefault();
        ooResizingCol.current = col;
        ooStartX.current = e.clientX;
        ooStartWidth.current = ooColW[col];
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', ooMouseMove);
        document.addEventListener('mouseup', ooMouseUp);
    };

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

    // 외주업체 선택 시 해당 업체의 외주공정이 등록된 제품만 필터링
    const [filterByPartner, setFilterByPartner] = useState(true);

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

        // 타입 불일치를 방지하기 위해 모두 String으로 변환
        const myStaffId = String(currentUser?.staff_id || currentUser?.id || "");
        const currentApproverToSign = doc.steps.find(step => step.status === 'PENDING');

        if (!currentApproverToSign) return false;

        const approverId = String(currentApproverToSign.approver_id || "");
        const stepStaffId = String(currentApproverToSign.staff_id || "");

        return (approverId === myStaffId || stepStaffId === myStaffId);
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

    // Unified initialization logic: Runs only when the modal opens [isOpen]
    useEffect(() => {
        if (!isOpen) return;

        if (order) {
            // [EDIT MODE]
            setFormData({
                partner_id: order.partner_id || '',
                order_id: order.order_id || '',
                order_date: order.order_date,
                delivery_date: order.delivery_date || '',
                note: order.note || '',
                status: order.status || 'PENDING',
                items: (order.items || []).map(item => ({
                    ...item,
                    product_id: item.product?.id || item.product_id,
                    product_name: item.product?.name || item.product_name || '',
                    specification: item.product?.specification || item.specification || '',
                    order_size: item.order_size || '',
                    material: item.material || '',
                    pricing_type: item.pricing_type || 'UNIT',
                    total_weight: item.total_weight || 0
                }))
            });
            fetchApprovalDoc();
        } else if (initialItems && initialItems.length > 0) {
            // [PRE-FILL MODE]
            const firstItem = initialItems[0];
            const firstPartnerName = firstItem.partner_name || 
                                     (firstItem.partner && (typeof firstItem.partner === 'string' ? firstItem.partner : firstItem.partner.name)) ||
                                     firstItem.outsourcing_company || '';
                                     
            const foundPartner = partners.find(p => p.name === firstPartnerName);

            const displayCode = firstItem?.sales_order_number ||
                firstItem?.plan?.order?.order_no ||
                firstItem?.plan?.stock_production?.production_no || 
                (firstItem ? "재고용 (외주)" : "직접발주");
            
            // 제목 생성을 위한 메타데이터 추출 (수주건 vs 재고건)
            const isStock = !!(firstItem?.plan?.stock_production_id || firstItem?.stock_production_id || String(displayCode).includes('재고용'));
            const customerName = firstItem?.plan?.order?.partner?.name || firstItem?.plan?.stock_production?.partner?.name || firstItem?.customer_name || '';

            setFormData({
                partner_id: foundPartner ? foundPartner.id : '',
                order_id: firstItem?.plan?.order_id || '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                note: '',
                status: 'PENDING',
                display_order_no: displayCode,
                is_stock: isStock,
                related_customer_names: customerName,
                items: (initialItems || []).map(item => {
                    const productObj = item?.product || item?.item || item?.material || {};
                    const productId = item?.product_id || productObj?.id || item?.item_id;
                    const productName = productObj?.name || item?.product_name_of_plan || '알 수 없는 품목';
                    const spec = productObj?.specification || item?.specification || '';

                    let unitPrice = item?.unit_price || 0;
                    const productFound = products.find(p => String(p?.id) === String(productId));
                    const finalProduct = productObj?.id ? productObj : (productFound || {});

                    if (finalProduct && finalProduct?.standard_processes) {
                        const standardProc = finalProduct?.standard_processes?.find(sp =>
                            sp?.process?.name === item?.process_name ||
                            sp?.course_type?.includes('OUTSOURCING') ||
                            sp?.process?.course_type?.includes('OUTSOURCING')
                        );
                        if (standardProc) unitPrice = standardProc?.cost || unitPrice;
                    }

                    return {
                        ...item,
                        product_id: productId || '',
                        product_name: productName,
                        quantity: item?.quantity || 1,
                        unit_price: unitPrice,
                        note: item?.note || item?.process_name || '',
                        production_plan_item_id: item?.id || null,
                        specification: spec,
                        pricing_type: item?.pricing_type || 'UNIT',
                        total_weight: item?.total_weight || 0
                    };
                })
            });
            fetchDefaultLines();
        } else {
            // [NEW MODE]
            setFormData({
                partner_id: '',
                order_id: '',
                order_date: new Date().toISOString().split('T')[0],
                delivery_date: '',
                note: '',
                status: 'PENDING',
                items: []
            });
            fetchDefaultLines();
        }
        
        fetchPartners();
        fetchProducts();
        fetchSalesOrders();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // [Fix] partners 비동기 로드 후 partner_id 자동기입
    // 메인 effect 실행 시점에 partners가 []이므로, partners가 채워진 후 한 번 더 시도
    useEffect(() => {
        if (!isOpen || !partners.length || !initialItems?.length) return;
        if (formData.partner_id) return; // 이미 설정된 경우 skip
        const firstItem = initialItems[0];
        const rawName = (
            firstItem.partner_name ||
            (firstItem.partner && (typeof firstItem.partner === 'string' ? firstItem.partner : firstItem.partner.name)) ||
            firstItem.outsourcing_company || ''
        ).trim();
        if (!rawName) return;
        const found = partners.find(p =>
            p.name.trim() === rawName ||
            p.name.trim().toLowerCase() === rawName.toLowerCase()
        );
        if (found) setFormData(prev => ({ ...prev, partner_id: found.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [partners]);

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
            // limit을 충분히 크게 지정하여 모든 품목이 표시되도록 함
            const response = await api.get('/product/products', {
                params: { limit: 9999 }
            });
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
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, {
                product_id: '', quantity: 0, unit_price: 0, note: '',
                material: '', order_size: '',
                pricing_type: 'UNIT',
                total_weight: 0, unit_weight: 0, weight_price: 0
            }]
        }));
    };

    const handleRemoveItem = (index) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const handleItemChange = async (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index] = { ...newItems[index], [field]: value };

        // ── 중량 기준 3중 연동 ────────────────────────────────────────────
        if (newItems[index].pricing_type === 'WEIGHT') {
            const qty      = parseFloat(newItems[index].quantity)     || 0;
            const unitW    = parseFloat(newItems[index].unit_weight)  || 0;
            const totalW   = parseFloat(newItems[index].total_weight) || 0;
            const weightP  = parseFloat(newItems[index].weight_price) || 0;

            if (field === 'quantity') {
                // 수량 변경 → 총중량 재계산 (개당중량 기준)
                if (unitW > 0) {
                    newItems[index].total_weight = (qty * unitW).toFixed(4);
                } else if (totalW > 0 && qty > 0) {
                    newItems[index].unit_weight = (totalW / qty).toFixed(4);
                }
            } else if (field === 'unit_weight') {
                // 개당중량 변경 → 총중량 재계산
                newItems[index].total_weight = (qty * parseFloat(value || 0)).toFixed(4);
            } else if (field === 'total_weight') {
                // 총중량 변경 → 개당중량 재계산
                if (qty > 0) {
                    newItems[index].unit_weight = (parseFloat(value || 0) / qty).toFixed(4);
                }
            }
            // 중량단가 기준 단가(unit_price) 자동 계산 (총중량×중량단가/수량)
            const newTotalW = parseFloat(newItems[index].total_weight) || 0;
            const newQty   = parseFloat(newItems[index].quantity) || 1;
            if (weightP > 0) {
                newItems[index].unit_price = newQty > 0
                    ? ((newTotalW * weightP) / newQty).toFixed(0)
                    : 0;
            }
            if (field === 'weight_price') {
                const wp2 = parseFloat(value || 0);
                newItems[index].unit_price = newQty > 0
                    ? ((newTotalW * wp2) / newQty).toFixed(0)
                    : 0;
            }
        }
        // ─────────────────────────────────────────────────────────────────

        if (field === 'product_id' && value) {
            const product = products.find(p => String(p.id) === String(value));
            if (product && product.material) {
                newItems[index].material = product.material;
            }
            const processName = newItems[index].note || '';
            try {
                const res = await api.get('/purchasing/price-history', {
                    params: { product_id: value, purchase_type: 'OUTSOURCING', process_name: processName || undefined, limit: 1 }
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

        setFormData(prev => ({ ...prev, items: newItems }));
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
        const processName = formData.items[index]?.note || '';
        try {
            const response = await api.get('/purchasing/price-history', {
                params: {
                    product_id: productId,
                    purchase_type: 'OUTSOURCING',
                    process_name: processName || undefined,
                    partner_id: formData.partner_id || undefined
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
                    unit_weight: parseFloat(item.unit_weight) || 0,
                    weight_price: parseFloat(item.weight_price) || 0,
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

    // [Helper] 선택된 외주업체 이름
    const selectedPartnerName = partners.find(
        p => String(p.id) === String(formData.partner_id)
    )?.name || null;

    // [Helper] 제품에 선택된 외주업체의 외주공정이 등록되어 있는지 확인
    const hasOutsourcingProcess = (product) => {
        if (!selectedPartnerName || !product.standard_processes?.length) return false;
        return product.standard_processes.some(sp => {
            const ct = (sp.course_type || sp.process?.course_type || '').toUpperCase();
            const pn = (sp.partner_name || '').trim();
            return ct.includes('OUTSOURCING') && pn === selectedPartnerName.trim();
        });
    };

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>{order ? "외주 발주 수정" : "외주 발주 등록"}</DialogTitle>
            <DialogContent sx={{ p: 2, bgcolor: '#f8f9fa' }}>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                    <Autocomplete
                        options={partners}
                        getOptionLabel={(option) => option.name || ''}
                        isOptionEqualToValue={(option, value) => String(option.id) === String(value?.id)}
                        value={partners.find(p => String(p.id) === String(formData.partner_id)) || null}
                        onChange={(_, newValue) => setFormData(prev => ({ ...prev, partner_id: newValue ? newValue.id : '' }))}
                        renderInput={(params) => <TextField {...params} label="외주처 검색/선택" size="small" sx={{ minWidth: 250 }} required />}
                        sx={{ flexGrow: 1 }}
                    />
                    <TextField label="발주일자" type="date" value={formData.order_date} onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))} size="small" InputLabelProps={{ shrink: true }} />
                    <TextField label="납기일자" type="date" value={formData.delivery_date} onChange={(e) => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))} size="small" InputLabelProps={{ shrink: true }} required />
                    <TextField label="비고" value={formData.note} onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))} size="small" placeholder="특이사항" sx={{ flexGrow: 2 }} />
                </Paper>

                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ChevronRight size={18} /> 외주 발주 품목 상세
                    {/* 외주업체 필터 토글 - 외주처가 선택된 경우에만 표시 */}
                    {formData.partner_id && (
                        <Box
                            component="label"
                            sx={{
                                ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5,
                                fontSize: '0.75rem', cursor: 'pointer',
                                color: filterByPartner ? 'primary.main' : 'text.secondary',
                                border: '1px solid', borderColor: filterByPartner ? 'primary.main' : 'divider',
                                borderRadius: 1, px: 1, py: 0.3,
                                userSelect: 'none'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={filterByPartner}
                                onChange={e => setFilterByPartner(e.target.checked)}
                                style={{ width: 14, height: 14, cursor: 'pointer' }}
                            />
                            {selectedPartnerName ? `"${selectedPartnerName}" 외주공정 제품만 표시` : '업체별 필터'}
                        </Box>
                    )}
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small" sx={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '50px' }} />
                            <col style={{ width: ooColW.name + 'px' }} />
                            <col style={{ width: ooColW.pricingType + 'px' }} />
                            <col style={{ width: ooColW.qty + 'px' }} />
                            <col style={{ width: ooColW.price + 'px' }} />
                            <col style={{ width: ooColW.amount + 'px' }} />
                            <col style={{ width: '60px' }} />
                        </colgroup>
                        <TableHead sx={{ bgcolor: '#f4f4f5' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold', width: 50, textAlign: 'center' }}>No</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', position: 'relative', userSelect: 'none' }}>
                                    품목명 / 규격
                                    <div onMouseDown={(e) => ooMouseDown('name', e)} style={ooResizerStyle} title="드래그하여 열 너비 조정" />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', position: 'relative', userSelect: 'none' }}>
                                    단가기준
                                    <div onMouseDown={(e) => ooMouseDown('pricingType', e)} style={ooResizerStyle} title="드래그하여 열 너비 조정" />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', position: 'relative', userSelect: 'none' }}>
                                    {formData.items?.[0]?.pricing_type === 'WEIGHT' ? '총중량(kg)' : '총수량(EA)'}
                                    <div onMouseDown={(e) => ooMouseDown('qty', e)} style={ooResizerStyle} title="드래그하여 열 너비 조정" />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right', position: 'relative', userSelect: 'none' }}>
                                    단가
                                    <div onMouseDown={(e) => ooMouseDown('price', e)} style={ooResizerStyle} title="드래그하여 열 너비 조정" />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right', position: 'relative', userSelect: 'none' }}>
                                    금액
                                    <div onMouseDown={(e) => ooMouseDown('amount', e)} style={ooResizerStyle} title="드래그하여 열 너비 조정" />
                                </TableCell>
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
                                                    isOptionEqualToValue={(option, value) => String(option.id) === String(value?.id)}
                                                    value={products.find(p => String(p.id) === String(item.product_id)) || null}
                                                    onChange={(_, newValue) => handleItemChange(index, 'product_id', newValue ? newValue.id : '')}
                                                    filterOptions={(options, { inputValue }) => {
                                                        // 1단계: 외주체 필터 (선택 시)
                                                        let base = options;
                                                        if (filterByPartner && selectedPartnerName) {
                                                            base = options.filter(o => hasOutsourcingProcess(o));
                                                        }
                                                        // 2단계: 텍스트 검색 필터
                                                        const q = inputValue.toLowerCase();
                                                        if (!q) return base;
                                                        return base.filter(o =>
                                                            (o.name || '').toLowerCase().includes(q) ||
                                                            (o.specification || '').toLowerCase().includes(q) ||
                                                            (o.code || o.product_code || '').toLowerCase().includes(q)
                                                        );
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            placeholder={
                                                                filterByPartner && selectedPartnerName
                                                                    ? `외주공정 등록 품목 검색 (품명·규격·코드)`
                                                                    : `품목 검색/선택 (품명·규격·코드)`
                                                            }
                                                            variant="outlined"
                                                        />
                                                    )}
                                                    renderOption={(props, option) => {
                                                        // 선택된 외주체의 공정 정보 추출
                                                        const matchedProcess = selectedPartnerName
                                                            ? option.standard_processes?.find(sp => {
                                                                const ct = (sp.course_type || sp.process?.course_type || '').toUpperCase();
                                                                return ct.includes('OUTSOURCING') && (sp.partner_name || '').trim() === selectedPartnerName.trim();
                                                              })
                                                            : null;
                                                        return (
                                                            <li {...props}>
                                                                <Box>
                                                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                                        [{option.code || option.product_code || 'N/A'}] {option.name}
                                                                    </Typography>
                                                                    <Typography variant="caption" color="textSecondary">
                                                                        규격: {option.specification || '-'}
                                                                        {matchedProcess && (
                                                                            <Box component="span" sx={{ ml: 1, color: 'primary.main', fontWeight: 'bold' }}>
                                                                                ✔ {matchedProcess.process?.name || '외주공정'}
                                                                                {matchedProcess.cost ? ` (₩${Number(matchedProcess.cost).toLocaleString()})` : ''}
                                                                            </Box>
                                                                        )}
                                                                    </Typography>
                                                                </Box>
                                                            </li>
                                                        );
                                                    }}
                                                    sx={{ width: '100%' }}
                                                    readOnly={!!item.production_plan_item_id}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ width: 120 }}>
                                                <TextField 
                                                    select
                                                    size="small" 
                                                    fullWidth
                                                    value={item.pricing_type || 'UNIT'} 
                                                    onChange={(e) => handleItemChange(index, 'pricing_type', e.target.value)} 
                                                    inputProps={{ style: { textAlign: 'center' } }}
                                                >
                                                    <MenuItem value="UNIT">수량 기준 (EA)</MenuItem>
                                                    <MenuItem value="WEIGHT">중량 기준 (kg)</MenuItem>
                                                </TextField>
                                            </TableCell>
                                            <TableCell sx={{ width: 150 }}>
                                                <TextField 
                                                    type="number" 
                                                    size="small" 
                                                    fullWidth
                                                    value={item.pricing_type === 'WEIGHT' ? item.total_weight || '' : item.quantity || ''} 
                                                    onChange={(e) => handleItemChange(index, item.pricing_type === 'WEIGHT' ? 'total_weight' : 'quantity', e.target.value)} 
                                                    inputProps={{ style: { textAlign: 'center' } }}
                                                    placeholder={item.pricing_type === 'WEIGHT' ? 'kg 입력' : '수량 입력'}
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
                                                        item.pricing_type === 'WEIGHT'
                                                            ? (parseFloat(item.total_weight) || 0) * (parseFloat(item.weight_price) || 0)
                                                            : (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
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

                                        {/* Row 2: 중량 기준 상세 or 비고 */}
                                        <TableRow sx={{ bgcolor: '#fafafa' }}>
                                            <TableCell colSpan={5} sx={{ pt: 1, pb: 1 }}>
                                                {item.pricing_type === 'WEIGHT' ? (
                                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <Box sx={{ minWidth: 100 }}>
                                                            <Typography variant="caption" color="text.secondary">수량 (EA)</Typography>
                                                            <TextField
                                                                type="number" size="small" fullWidth
                                                                value={item.quantity || ''}
                                                                onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                                                                placeholder="수량"
                                                                inputProps={{ style: { textAlign: 'center' } }}
                                                            />
                                                        </Box>
                                                        <Box sx={{ minWidth: 110 }}>
                                                            <Typography variant="caption" color="text.secondary">개당 중량 (kg)</Typography>
                                                            <TextField
                                                                type="number" size="small" fullWidth
                                                                value={item.unit_weight || ''}
                                                                onChange={e => handleItemChange(index, 'unit_weight', e.target.value)}
                                                                placeholder="개당 중량"
                                                                inputProps={{ style: { textAlign: 'right' } }}
                                                            />
                                                        </Box>
                                                        <Box sx={{ minWidth: 110 }}>
                                                            <Typography variant="caption" color="text.secondary">총 중량 (kg)</Typography>
                                                            <TextField
                                                                type="number" size="small" fullWidth
                                                                value={item.total_weight || ''}
                                                                onChange={e => handleItemChange(index, 'total_weight', e.target.value)}
                                                                placeholder="총 중량"
                                                                inputProps={{ style: { textAlign: 'right', color: '#1976d2', fontWeight: 'bold' } }}
                                                            />
                                                        </Box>
                                                        <Box sx={{ minWidth: 130 }}>
                                                            <Typography variant="caption" color="text.secondary">중량 단가 (원/kg)</Typography>
                                                            <TextField
                                                                type="number" size="small" fullWidth
                                                                value={item.weight_price || ''}
                                                                onChange={e => handleItemChange(index, 'weight_price', e.target.value)}
                                                                placeholder="원/kg"
                                                                inputProps={{ style: { textAlign: 'right' } }}
                                                            />
                                                        </Box>
                                                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pb: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary">개당 단가 (자동)</Typography>
                                                            <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'bold', textAlign: 'right', border: '1px solid #e0e0e0', px: 1, py: 0.8, borderRadius: 1, minWidth: 100 }}>
                                                                ₩{(parseFloat(item.unit_price) || 0).toLocaleString()}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pb: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary">비고</Typography>
                                                            <TextField
                                                                size="small" placeholder="비고"
                                                                value={item.note || ''}
                                                                onChange={e => handleItemChange(index, 'note', e.target.value)}
                                                                sx={{ bgcolor: 'white', minWidth: 120 }}
                                                            />
                                                        </Box>
                                                    </Box>
                                                ) : (
                                                    <TextField
                                                        size="small" label="비고"
                                                        placeholder="상세 내용을 입력하세요."
                                                        fullWidth
                                                        value={item.note || ''}
                                                        onChange={(e) => handleItemChange(index, 'note', e.target.value)}
                                                        sx={{ bgcolor: 'white' }}
                                                    />
                                                )}
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
            <DialogActions sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 100, borderTop: '2px solid #ddd', p: 2, boxShadow: '0 -4px 10px rgba(0,0,0,0.1)' }}>
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
