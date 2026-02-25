import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tabs, Tab, Checkbox, Tooltip
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Print as PrintIcon, Delete as DeleteIcon, Description as DescIcon, AttachFile as AttachIcon } from '@mui/icons-material';
import api from '../lib/api';
import OutsourcingOrderModal from '../components/OutsourcingOrderModal';
import PurchaseSheetModal from '../components/PurchaseSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';

const OutsourcingPage = () => {
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

    // Source Information Modals
    const [sourceOrderModalOpen, setSourceOrderModalOpen] = useState(false);
    const [selectedSourceOrder, setSelectedSourceOrder] = useState(null);
    const [sourceStockModalOpen, setSourceStockModalOpen] = useState(false);
    const [selectedSourceStock, setSelectedSourceStock] = useState(null);

    useEffect(() => {
        if (tabValue === 0) {
            fetchPendingItems();
        } else if (tabValue === 1) {
            fetchOrders();
        } else {
            fetchCompletedOrders();
        }
    }, [tabValue]);

    const fetchOrders = async () => {
        try {
            const response = await api.get('/purchasing/outsourcing/orders');
            setOrders(response.data.filter(o => o.status !== 'COMPLETED'));
        } catch (error) {
            console.error("Failed to fetch outsourcing orders", error);
        }
    };

    const fetchCompletedOrders = async () => {
        try {
            const response = await api.get('/purchasing/outsourcing/orders', { params: { status: 'COMPLETED' } });
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch completed outsourcing orders", error);
        }
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

    const handleCreateFromPending = () => {
        if (selectedPendingItems.length === 0) return;
        const itemsToOrder = pendingItems.filter(item => selectedPendingItems.includes(item.id));
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
                <Tabs value={tabValue} onChange={handleTabChange}>
                    <Tab label="미발주 현황 (Pending)" />
                    <Tab label="발주 현황 (Ordered)" />
                    <Tab label="완료 내역 (Completed)" />
                </Tabs>
            </Box>

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
                                                            {order.related_sales_order_info?.includes('PO') || order.related_sales_order_info?.includes('OS') ? (
                                                                <span style={{ color: '#2e7d32' }}>[재고] </span>
                                                            ) : order.related_sales_order_info ? (
                                                                <span style={{ color: '#1976d2' }}>[수주] </span>
                                                            ) : null}
                                                            {order.related_sales_order_info || '-'}
                                                        </Typography>
                                                        <Typography variant="caption" color="textSecondary">{order.related_customer_names || '-'}</Typography>
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
                                                    {(() => {
                                                        let files = [];
                                                        try { files = order.attachment_file ? (typeof order.attachment_file === 'string' ? JSON.parse(order.attachment_file) : order.attachment_file) : []; } catch { files = []; }
                                                        if (!Array.isArray(files)) files = [];
                                                        return files.length > 0 ? (
                                                            <Tooltip title={`첨부파일 ${files.length}개`}>
                                                                <IconButton size="small" onClick={() => {
                                                                    setViewingFiles(files);
                                                                    setViewingFileTitle(order.order_no);
                                                                    setShowFileModal(true);
                                                                }}>
                                                                    <AttachIcon fontSize="small" color="action" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        ) : null;
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
