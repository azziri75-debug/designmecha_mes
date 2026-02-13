import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tabs, Tab, Checkbox
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Print as PrintIcon } from '@mui/icons-material';
import api from '../lib/api';
import OutsourcingOrderModal from '../components/OutsourcingOrderModal';

const OutsourcingPage = () => {
    const [tabValue, setTabValue] = useState(0);
    const [orders, setOrders] = useState([]);
    const [pendingItems, setPendingItems] = useState([]);
    const [selectedPendingItems, setSelectedPendingItems] = useState([]);

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [initialModalItems, setInitialModalItems] = useState([]);

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
                                    <TableRow><TableCell colSpan={8} align="center">발주 대기 중인 품목이 없습니다.</TableCell></TableRow>
                                ) : (
                                    pendingItems.map((item) => (
                                        <TableRow key={item.id} hover onClick={() => handleSelectPendingItem(item.id)} sx={{ cursor: 'pointer' }}>
                                            <TableCell padding="checkbox">
                                                <Checkbox checked={selectedPendingItems.includes(item.id)} />
                                            </TableCell>
                                            <TableCell>{item.process_name || item.product?.name}</TableCell>
                                            <TableCell>{item.product?.specification}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{item.product?.unit}</TableCell>
                                            <TableCell>{item.start_date || '-'}</TableCell>
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
                                        <TableRow key={order.id}>
                                            <TableCell>{order.order_no}</TableCell>
                                            <TableCell>{order.order_date}</TableCell>
                                            <TableCell>{order.partner?.name}</TableCell>
                                            <TableCell>{order.items.length}</TableCell>
                                            <TableCell>{order.delivery_date}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={order.status}
                                                    size="small"
                                                    color={order.status === 'COMPLETED' ? "success" : order.status === 'PENDING' ? "warning" : "primary"}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <IconButton size="small" onClick={() => handleEditClick(order)}>
                                                    <EditIcon />
                                                </IconButton>
                                                <IconButton size="small">
                                                    <PrintIcon />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
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
        </Box>
    );
};

export default OutsourcingPage;
