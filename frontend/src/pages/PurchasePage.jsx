import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Print as PrintIcon } from '@mui/icons-material';
import api from '../lib/api';
import PurchaseOrderModal from '../components/PurchaseOrderModal';

const PurchasePage = () => {
    const [orders, setOrders] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const response = await api.get('/purchasing/purchase/orders');
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch purchase orders", error);
        }
    };

    const handleCreateClick = () => {
        setSelectedOrder(null);
        setModalOpen(true);
    };

    const handleEditClick = (order) => {
        setSelectedOrder(order);
        setModalOpen(true);
    };

    const handleSuccess = () => {
        fetchOrders();
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
                <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
                    구매 자재 발주 관리
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateClick}>
                    신규 발주 등록
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>발주번호</TableCell>
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
                            <TableRow><TableCell colSpan={7} align="center">발주 내역이 없습니다.</TableCell></TableRow>
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
                                            color={order.status === 'COMPLETED' ? "success" : order.status === 'PENDING' ? "warning" : "primary"}
                                            size="small"
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

            <PurchaseOrderModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                order={selectedOrder}
            />
        </Box>
    );
};

export default PurchasePage;
