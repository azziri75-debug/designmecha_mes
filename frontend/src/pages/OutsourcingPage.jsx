import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import api from '../lib/api';
// Reusing PurchaseOrderModal for now or create new one if fields differ significantly
// Outsourcing needs linkage to Production Plan Items. 
// For MVP, let's use a placeholder or basic form if strict linking is complex to UI right now.
// Let's create a specific modal for Outsourcing later.
// For now, simple page structure.

const OutsourcingPage = () => {
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const response = await api.get('/purchasing/outsourcing/orders');
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch outsourcing orders", error);
        }
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
                <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
                    외주 가공 발주 관리
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} disabled>
                    신규 외주 발주 (준비중)
                </Button>
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
                            <TableRow><TableCell colSpan={7} align="center">외주 발주 내역이 없습니다.</TableCell></TableRow>
                        ) : (
                            orders.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell>{order.order_no}</TableCell>
                                    <TableCell>{order.order_date}</TableCell>
                                    <TableCell>{order.partner?.name}</TableCell>
                                    <TableCell>{order.items.length}</TableCell>
                                    <TableCell>{order.delivery_date}</TableCell>
                                    <TableCell>
                                        <Chip label={order.status} size="small" />
                                    </TableCell>
                                    <TableCell>
                                        <IconButton size="small">
                                            <EditIcon />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default OutsourcingPage;
