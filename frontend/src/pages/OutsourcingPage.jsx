import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tabs, Tab, Checkbox, Tooltip
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Print as PrintIcon, Delete as DeleteIcon, Description as DescIcon, AttachFile as AttachIcon, Send as SendIcon } from '@mui/icons-material';
import api from '../lib/api';
import OutsourcingOrderModal from '../components/OutsourcingOrderModal';
import PurchaseSheetModal from '../components/PurchaseSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';

const OutsourcingPage = () => {
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);
    const [orders, setOrders] = useState([]);
    const [pendingItems, setPendingItems] = useState([]);
    const [selectedPendingItems, setSelectedPendingItems] = useState([]);
    const [expandedOrderId, setExpandedOrderId] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [initialModalItems, setInitialModalItems] = useState([]);

    // 견적의뢰서/구매발주서 모달
    const [sheetModalOpen, setSheetModalOpen] = useState(false);
    const [sheetOrder, setSheetOrder] = useState(null);
    const [sheetType, setSheetType] = useState('purchase_order');

    // 첨부파일 뷰어 모달
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [viewingFileTitle, setViewingFileTitle] = useState('');
    const [viewingTargetId, setViewingTargetId] = useState(null);

    // Source Information Modals
    const [sourceOrderModalOpen, setSourceOrderModalOpen] = useState(false);
    const [selectedSourceOrder, setSelectedSourceOrder] = useState(null);
    const [sourceStockModalOpen, setSourceStockModalOpen] = useState(false);
    const [selectedSourceStock, setSelectedSourceStock] = useState(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPartnerId, setSelectedPartnerId] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [partners, setPartners] = useState([]);


    useEffect(() => {
        fetchPartners();
    }, []);

    useEffect(() => {
        if (tabValue === 0) {
            fetchPendingItems();
        } else if (tabValue === 1) {
            fetchOrders();
        } else {
            fetchCompletedOrders();
        }
    }, [tabValue, searchQuery, selectedPartnerId, startDate, endDate]);


    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/');
            setPartners(res.data);
        } catch (err) {
            console.error("Fetch partners failed", err);
        }
    };

    const fetchOrders = async () => {
        try {
            const params = {};
            if (searchQuery) params.product_name = searchQuery;
            if (selectedPartnerId) params.partner_id = selectedPartnerId;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

            const response = await api.get('/purchasing/outsourcing/orders', { params });
            setOrders(response.data.filter(o => o.status !== 'COMPLETED'));
        } catch (error) {
            console.error("Failed to fetch outsourcing orders", error);
        }
    };

    const fetchCompletedOrders = async () => {
        try {
            const params = { status: 'COMPLETED' };
            if (searchQuery) params.product_name = searchQuery;
            if (selectedPartnerId) params.partner_id = selectedPartnerId;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

            const response = await api.get('/purchasing/outsourcing/orders', { params });
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch completed outsourcing orders", error);
        }
    };


    const handleApprovalSubmit = (order) => {
        const orderData = {
            order_no: order.order_no,
            partner_name: order.partner?.name,
            partner_phone: order.partner?.phone,
            partner_fax: order.partner?.fax,
            order_date: order.order_date,
            delivery_date: order.delivery_date,
            items: (order.items || []).map((item, idx) => ({
                idx: idx + 1,
                name: item.product?.name || item.process_name,
                spec: item.product?.specification || '-',
                qty: item.quantity,
                price: item.unit_price,
                total: item.quantity * (item.unit_price || 0)
            })),
            colWidths: [40, 200, 120, 60, 80, 100],
            special_notes: order.note
        };

        navigate('/approval/draft', {
            state: {
                autoFill: {
                    type: 'PURCHASE_ORDER',
                    ref_id: order.id,
                    data: orderData
                }
            }
        });
    };
    const fetchPendingItems = async () => {
        try {
            const response = await api.get('/purchasing/outsourcing/pending-items');
            setPendingItems(response.data);
            setSelectedPendingItems([]);
        } catch (error) {
            console.error("Failed to fetch pending items", error);
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const handleCreateClick = () => {
        setSelectedOrder(null);
        setInitialModalItems([]);
        setModalOpen(true);
    };

    const handleEditClick = (order) => {
        setSelectedOrder(order);
        setInitialModalItems([]);
        setModalOpen(true);
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm("정말로 이 외주 발주를 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/purchasing/outsourcing/orders/${orderId}`);
            alert("삭제되었습니다.");
            handleSuccess();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleDeleteAttachment = async (targetId, indexToRemove) => {
        if (!targetId) return;
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;

        try {
            const order = orders.find(o => o.id === targetId);
            if (!order) return;

            const files = typeof order.attachment_file === 'string' ? JSON.parse(order.attachment_file) : order.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== indexToRemove);

            const res = await api.put(`/purchasing/outsourcing/orders/${targetId}`, { attachment_file: newFiles });
            const updatedOrder = res.data;

            setOrders(prev => prev.map(o => o.id === targetId ? updatedOrder : o));
            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("첨부파일이 삭제되었습니다.");
        } catch (error) {
            console.error("Failed to delete attachment", error);
            alert("첨부파일 삭제 실패");
        }
    };

    const handleCreateFromPending = () => {
        if (selectedPendingItems.length === 0) return;

        let itemsToOrder = pendingItems.filter(item => selectedPendingItems.includes(item.id));

        if (itemsToOrder.length === 1) {
            const refItem = itemsToOrder[0];
            const refOrderNo = refItem.plan?.order?.order_no || refItem.plan?.stock_production?.production_no;
            const refPartner = refItem.partner_name;

            if (refOrderNo && refPartner) {
                const relatedItems = pendingItems.filter(item => {
                    if (item.id === refItem.id) return false;
                    const orderNo = item.plan?.order?.order_no || item.plan?.stock_production?.production_no;
                    return orderNo === refOrderNo && item.partner_name === refPartner;
                });

                if (relatedItems.length > 0) {
                    if (window.confirm(`동일한 수주/재고 번호(${refOrderNo}) 및 외주처(${refPartner})를 가진 미발주 품목이 ${relatedItems.length}건 더 있습니다.\n\n하나의 발주서로 묶어서 처리하시겠습니까?`)) {
                        itemsToOrder = [...itemsToOrder, ...relatedItems];
                        setSelectedPendingItems(itemsToOrder.map(i => i.id));
                    }
                }
            }
        }

        setSelectedOrder(null);
        setInitialModalItems(itemsToOrder);
        setModalOpen(true);
    };

    const handleSuccess = () => {
        if (tabValue === 0) fetchPendingItems();
        else if (tabValue === 1) fetchOrders();
        else fetchCompletedOrders();
        setModalOpen(false);
    };

    const handleSelectPendingItem = (id) => {
        if (selectedPendingItems.includes(id)) {
            setSelectedPendingItems(selectedPendingItems.filter(itemId => itemId !== id));
        } else {
            setSelectedPendingItems([...selectedPendingItems, id]);
        }
    };

    const handleSelectAllPending = (event) => {
        if (event.target.checked) {
            setSelectedPendingItems(pendingItems.map(item => item.id));
        } else {
            setSelectedPendingItems([]);
        }
    };

    const handleOpenSource = (item) => {
        if (item.plan?.order) {
            setSelectedSourceOrder(item.plan.order);
            setSourceOrderModalOpen(true);
        } else if (item.plan?.stock_production) {
            setSelectedSourceStock(item.plan.stock_production);
            setSourceStockModalOpen(true);
        }
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
                    외주 가공 발주 관리
                </Typography>
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    sx={{
                        '& .MuiTab-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .Mui-selected': { color: '#fff !important' },
                    }}
                >
                    <Tab label="미발주 현황 (Pending)" />
                    <Tab label="발주 현황 (Ordered)" />
                    <Tab label="완료 내역 (Completed)" />
                </Tabs>
            </Box>

            {/* Filter Section */}
            {(tabValue === 1 || tabValue === 2) && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#fcfcfc', border: '1px solid #eee' }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="textSecondary">기간:</Typography>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                            />
                            <span>~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                            />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                            <Typography variant="body2" color="textSecondary">외주처:</Typography>
                            <Box sx={{ flex: 1 }}>
                                <select
                                    value={selectedPartnerId || ''}
                                    onChange={(e) => setSelectedPartnerId(e.target.value || null)}
                                    style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', fontSize: '14px' }}
                                >
                                    <option value="">전체 외주처</option>
                                    {partners.filter(p => p.type === 'SUPPLIER').map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="textSecondary">품명/품번:</Typography>
                            <input
                                type="text"
                                placeholder="검색어 입력..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px', fontSize: '14px' }}
                            />
                        </Box>
                        <Button
                            size="small"
                            variant="outlined"
                            color="inherit"
                            onClick={() => {
                                setStartDate('');
                                setEndDate('');
                                setSelectedPartnerId(null);
                                setSearchQuery('');
                            }}
                        >
                            초기화
                        </Button>
                    </Box>
                </Paper>
            )}


            {tabValue === 0 && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleCreateFromPending}
                            disabled={selectedPendingItems.length === 0}
                        >
                            선택 품목 발주 등록
                        </Button>
                    </Box>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            indeterminate={selectedPendingItems.length > 0 && selectedPendingItems.length < pendingItems.length}
                                            checked={pendingItems.length > 0 && selectedPendingItems.length === pendingItems.length}
                                            onChange={handleSelectAllPending}
                                        />
                                    </TableCell>
                                    <TableCell>수주번호</TableCell>
                                    <TableCell>공정명/품목</TableCell>
                                    <TableCell>규격</TableCell>
                                    <TableCell>수량</TableCell>
                                    <TableCell>단위</TableCell>
                                    <TableCell>계획일자</TableCell>
                                    <TableCell>외주처(계획)</TableCell>
                                    <TableCell>비고</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {pendingItems.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} align="center">발주 대기 중인 품목이 없습니다.</TableCell></TableRow>
                                ) : (
                                    pendingItems.map((item) => (
                                        <TableRow key={item.id} hover onClick={() => handleSelectPendingItem(item.id)} sx={{ cursor: 'pointer' }}>
                                            <TableCell padding="checkbox">
                                                <Checkbox checked={selectedPendingItems.includes(item.id)} />
                                            </TableCell>
                                            <TableCell>
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                                        {item.plan?.order ? (
                                                            <Chip label="수주" size="small" variant="outlined" sx={{ mr: 0.5, height: 20, fontSize: '0.7rem', color: 'primary.main' }} />
                                                        ) : item.plan?.stock_production ? (
                                                            <Chip label="재고" size="small" variant="outlined" color="success" sx={{ mr: 0.5, height: 20, fontSize: '0.7rem' }} />
                                                        ) : null}
                                                        {item.plan?.order?.order_no || item.plan?.stock_production?.production_no || '-'}
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        {item.plan?.order?.partner?.name || (item.plan?.stock_production ? '사내 생산(재고)' : '-')}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>{item.process_name || item.product?.name}</TableCell>
                                            <TableCell>{item.product?.specification}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{item.product?.unit}</TableCell>
                                            <TableCell>{item.start_date || item.plan?.plan_date || '-'}</TableCell>
                                            <TableCell>{item.partner_name || '-'}</TableCell>
                                            <TableCell>{item.note}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

            {(tabValue === 1 || tabValue === 2) && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        {tabValue === 1 && (
                            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateClick}>
                                신규 외주 발주 직접 등록
                            </Button>
                        )}
                    </Box>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>발주번호</TableCell>
                                    <TableCell>수주번호 (고객사)</TableCell>
                                    <TableCell>발주일자</TableCell>
                                    <TableCell>외주처</TableCell>
                                    <TableCell>품목 수</TableCell>
                                    <TableCell>납기일자</TableCell>
                                    <TableCell>상태</TableCell>
                                    <TableCell>관리</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {orders.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} align="center">{tabValue === 1 ? "진행 중인 외주 발주 내역이 없습니다." : "완료된 외주 발주 내역이 없습니다."}</TableCell></TableRow>
                                ) : (
                                    orders.map((order) => (
                                        <React.Fragment key={order.id}>
                                            <TableRow
                                                hover
                                                onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditClick(order);
                                                }}
                                                sx={{ cursor: 'pointer', backgroundColor: expandedOrderId === order.id ? 'action.hover' : 'inherit' }}
                                            >
                                                <TableCell>{order.order_no}</TableCell>
                                                <TableCell>
                                                    <Box>
                                                        <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                                                            {order.order ? (
                                                                <span style={{ color: '#1976d2' }}>[수주] {order.order.order_no}</span>
                                                            ) : order.related_sales_order_info ? (
                                                                <>
                                                                    {order.related_sales_order_info.includes('PO') || order.related_sales_order_info.includes('OS') ? (
                                                                        <span style={{ color: '#2e7d32' }}>[재고] </span>
                                                                    ) : (
                                                                        <span style={{ color: '#1976d2' }}>[수주] </span>
                                                                    )}
                                                                    {order.related_sales_order_info}
                                                                </>
                                                            ) : (
                                                                <span style={{ color: '#757575' }}>재고용</span>
                                                            )}
                                                        </Typography>
                                                        <Typography variant="caption" color="textSecondary">{order.order?.partner?.name || order.related_customer_names || '-'}</Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>{order.order_date}</TableCell>
                                                <TableCell>{order.partner?.name}</TableCell>
                                                <TableCell>{order.items.length} 품목</TableCell>
                                                <TableCell>{order.delivery_date}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={order.status}
                                                        size="small"
                                                        color={order.status === 'COMPLETED' ? "success" : order.status === 'PENDING' ? "warning" : "primary"}
                                                    />
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Tooltip title="수정">
                                                        <IconButton size="small" onClick={() => handleEditClick(order)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="삭제">
                                                        <IconButton size="small" color="error" onClick={() => handleDeleteOrder(order.id)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="견적의뢰서">
                                                        <IconButton size="small" color="info" onClick={() => {
                                                            setSheetOrder(order);
                                                            setSheetType('estimate_request');
                                                            setSheetModalOpen(true);
                                                        }}>
                                                            <DescIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="구매발주서">
                                                        <IconButton size="small" color="success" onClick={() => {
                                                            setSheetOrder(order);
                                                            setSheetType('purchase_order');
                                                            setSheetModalOpen(true);
                                                        }}>
                                                            <PrintIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {order.status === 'PENDING' && (
                                                        <Tooltip title="결재 상신">
                                                            <IconButton size="small" color="primary" onClick={() => handleApprovalSubmit(order)}>
                                                                <SendIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {(() => {
                                                        let files = [];
                                                        try { files = order.attachment_file ? (typeof order.attachment_file === 'string' ? JSON.parse(order.attachment_file) : order.attachment_file) : []; } catch { files = []; }
                                                        if (!Array.isArray(files)) files = [];
                                                        return (
                                                            <>
                                                                {files.length > 0 && (
                                                                    <Tooltip title={`첨부파일 ${files.length}개`}>
                                                                        <IconButton size="small" onClick={() => {
                                                                            setViewingFiles(files);
                                                                            setViewingFileTitle(order.order_no);
                                                                            setViewingTargetId(order.id);
                                                                            setShowFileModal(true);
                                                                        }}>
                                                                            <AttachIcon fontSize="small" color="action" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                <input
                                                                    type="file"
                                                                    id={`os-file-${order.id}`}
                                                                    style={{ display: 'none' }}
                                                                    onChange={async (e) => {
                                                                        const file = e.target.files[0];
                                                                        if (!file) return;
                                                                        const formData = new FormData();
                                                                        formData.append('file', file);
                                                                        try {
                                                                            const uploadRes = await api.post('/upload', formData, {
                                                                                headers: { 'Content-Type': 'multipart/form-data' }
                                                                            });
                                                                            const newFile = { name: uploadRes.data.filename, url: uploadRes.data.url };
                                                                            const updatedFiles = [...files, newFile];
                                                                            await api.put(`/purchasing/outsourcing/orders/${order.id}`, { attachment_file: updatedFiles });
                                                                            if (tabValue === 1) fetchOrders();
                                                                            else fetchCompletedOrders();
                                                                        } catch (err) {
                                                                            console.error("Upload failed", err);
                                                                            alert("파일 업로드 실패");
                                                                        } finally {
                                                                            e.target.value = null;
                                                                        }
                                                                    }}
                                                                />
                                                                <Tooltip title="첨부파일 추가">
                                                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); document.getElementById(`os-file-${order.id}`).click(); }}>
                                                                        <AddIcon sx={{ fontSize: 18 }} />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </>
                                                        );
                                                    })()}
                                                </TableCell>
                                            </TableRow>
                                            {expandedOrderId === order.id && (
                                                <TableRow>
                                                    <TableCell colSpan={7} sx={{ py: 0, bgcolor: '#f5f5f5' }}>
                                                        <Box sx={{ margin: 2 }}>
                                                            <Typography variant="subtitle2" gutterBottom component="div" color="primary">
                                                                * 외주 발주 상세 내역
                                                            </Typography>
                                                            <Table size="small" aria-label="outsourcing-orders">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>공정명/품목</TableCell>
                                                                        <TableCell>규격</TableCell>
                                                                        <TableCell>수량</TableCell>
                                                                        <TableCell>단가</TableCell>
                                                                        <TableCell>금액</TableCell>
                                                                        <TableCell>비고</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {order.items.map((item) => (
                                                                        <TableRow key={item.id}>
                                                                            <TableCell>{item.product?.name}</TableCell>
                                                                            <TableCell>{item.product?.specification}</TableCell>
                                                                            <TableCell>{item.quantity} {item.product?.unit}</TableCell>
                                                                            <TableCell>{item.unit_price?.toLocaleString()}</TableCell>
                                                                            <TableCell>{(item.quantity * item.unit_price)?.toLocaleString()}</TableCell>
                                                                            <TableCell>{item.note}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

            <OutsourcingOrderModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                order={selectedOrder}
                initialItems={initialModalItems}
            />

            <PurchaseSheetModal
                isOpen={sheetModalOpen}
                onClose={() => setSheetModalOpen(false)}
                order={sheetOrder}
                sheetType={sheetType}
                orderType="outsourcing"
                onSave={() => {
                    if (tabValue === 1) fetchOrders();
                    else fetchCompletedOrders();
                }}
            />

            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => setShowFileModal(false)}
                files={viewingFiles}
                title={viewingFileTitle}
                onDeleteFile={(index) => handleDeleteAttachment(viewingTargetId, index)}
            />

            <OrderModal
                isOpen={sourceOrderModalOpen}
                onClose={() => setSourceOrderModalOpen(false)}
                order={selectedSourceOrder}
                readonly={true}
            />

            <StockProductionModal
                isOpen={sourceStockModalOpen}
                onClose={() => setSourceStockModalOpen(false)}
                stockProduction={selectedSourceStock}
                readonly={true}
            />
        </Box>
    );
};

export default OutsourcingPage;
