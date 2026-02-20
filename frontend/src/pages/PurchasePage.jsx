import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tabs, Tab, Checkbox
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Print as PrintIcon, Delete as DeleteIcon } from '@mui/icons-material';
import api from '../lib/api';
import PurchaseOrderModal from '../components/PurchaseOrderModal';

const PurchasePage = () => {
    const [tabValue, setTabValue] = useState(0);
    const [orders, setOrders] = useState([]);
    const [pendingItems, setPendingItems] = useState([]);
    const [selectedPendingItems, setSelectedPendingItems] = useState([]);
    const [expandedOrderId, setExpandedOrderId] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [initialModalItems, setInitialModalItems] = useState([]);

    useEffect(() => {
        if (tabValue === 0) {
            fetchPendingItems();
        } else if (tabValue === 1) {
            fetchOrders(); // Fetch active orders
        } else {
            fetchCompletedOrders(); // Fetch completed orders
        }
    }, [tabValue]);

    const fetchOrders = async () => {
        try {
            const response = await api.get('/purchasing/purchase/orders');
            // Client-side filter for now as backend filter is exact match
            setOrders(response.data.filter(o => o.status !== 'COMPLETED'));
        } catch (error) {
            console.error("Failed to fetch purchase orders", error);
        }
    };

    const fetchCompletedOrders = async () => {
        try {
            const response = await api.get('/purchasing/purchase/orders', { params: { status: 'COMPLETED' } });
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch completed orders", error);
        }
    };

    const fetchPendingItems = async () => {
        try {
            const response = await api.get('/purchasing/purchase/pending-items');
            setPendingItems(response.data);
            setSelectedPendingItems([]); // Reset selection on refresh
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
        if (!window.confirm("정말로 이 발주를 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/purchasing/purchase/orders/${orderId}`);
            alert("삭제되었습니다.");
            handleSuccess();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleCreateFromPending = () => {
        if (selectedPendingItems.length === 0) return;

        // Filter pendingItems objects based on selected IDs
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

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
                    구매 자재 발주 관리
                </Typography>
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tabValue} onChange={handleTabChange}>
                    <Tab label="미발주 현황 (Pending)" />
                    <Tab label="발주 현황 (Ordered)" />
                    <Tab label="입고 완료 (Completed)" />
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
                                    <TableCell>품목명</TableCell>
                                    <TableCell>규격</TableCell>
                                    <TableCell>수량</TableCell>
                                    <TableCell>단위</TableCell>
                                    <TableCell>계획일자</TableCell>
                                    <TableCell>구매처(계획)</TableCell>
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
                                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{item.plan?.order?.order_no || '-'}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{item.plan?.order?.partner?.name || '-'}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>{item.product?.name}</TableCell>
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
                                신규 발주 직접 등록
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
                                    <TableCell>공급사</TableCell>
                                    <TableCell>품목 수</TableCell>
                                    <TableCell>납기일자</TableCell>
                                    <TableCell>상태</TableCell>
                                    <TableCell>관리</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {orders.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} align="center">{tabValue === 1 ? "진행 중인 발주 내역이 없습니다." : "완료된 발주 내역이 없습니다."}</TableCell></TableRow>
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
                                                        <Typography variant="body2">{order.related_sales_order_info || '-'}</Typography>
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
                                                        color={order.status === 'COMPLETED' ? "success" : order.status === 'PENDING' ? "warning" : "primary"}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <IconButton size="small" onClick={() => handleEditClick(order)}>
                                                        <EditIcon />
                                                    </IconButton>
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteOrder(order.id)}>
                                                        <DeleteIcon />
                                                    </IconButton>
                                                    <IconButton size="small">
                                                        <PrintIcon />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                            {expandedOrderId === order.id && (
                                                <TableRow>
                                                    <TableCell colSpan={7} sx={{ py: 0, bgcolor: '#f5f5f5' }}>
                                                        <Box sx={{ margin: 2 }}>
                                                            <Typography variant="subtitle2" gutterBottom component="div" color="primary">
                                                                * 발주 상세 내역
                                                            </Typography>
                                                            <Table size="small" aria-label="purchases">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>품목명</TableCell>
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

            <PurchaseOrderModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                order={selectedOrder}
                initialItems={initialModalItems}
            />
        </Box>
    );
};

export default PurchasePage;
