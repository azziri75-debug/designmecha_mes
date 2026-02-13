import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, Tabs, Tab, IconButton, Collapse
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp, Add as AddIcon } from '@mui/icons-material';
import api from '../lib/api';

const ProductionPage = () => {
    const [tabIndex, setTabIndex] = useState(0);
    const [orders, setOrders] = useState([]);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchOrders();
        fetchPlans();
    }, []);

    const fetchOrders = async () => {
        try {
            const response = await api.get('/sales/orders?status=CONFIRMED');
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        }
    };

    const fetchPlans = async () => {
        try {
            const response = await api.get('/production/plans');
            setPlans(response.data);
        } catch (error) {
            console.error("Failed to fetch plans", error);
        }
    };

    const handleCreatePlan = async (orderId) => {
        if (!window.confirm("이 수주에 대한 생산 계획을 수립하시겠습니까?")) return;

        try {
            await api.post('/production/plans', {
                order_id: orderId,
                plan_date: new Date().toISOString().split('T')[0]
            });
            alert("생산 계획이 생성되었습니다.");
            fetchOrders();
            fetchPlans();
            setTabIndex(1);
        } catch (error) {
            console.error("Failed to create plan", error);
            alert("생산 계획 생성 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabIndex(newValue);
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h4" gutterBottom component="div" sx={{ mb: 4, fontWeight: 'bold', color: '#1a237e' }}>
                생산 관리
            </Typography>

            <Paper sx={{ width: '100%', mb: 2 }}>
                <Tabs value={tabIndex} onChange={handleTabChange} indicatorColor="primary" textColor="primary">
                    <Tab label="생산 대기 수주" />
                    <Tab label="진행 중인 생산 계획" />
                </Tabs>

                <Box sx={{ p: 3 }}>
                    {tabIndex === 0 && (
                        <UnplannedOrdersTable orders={orders} plans={plans} onCreatePlan={handleCreatePlan} />
                    )}
                    {tabIndex === 1 && (
                        <ProductionPlansTable plans={plans} orders={orders} />
                    )}
                </Box>
            </Paper>
        </Box>
    );
};

const UnplannedOrdersTable = ({ orders, plans, onCreatePlan }) => {
    const planOrderIds = plans.map(p => p.order_id);
    const unplannedOrders = orders.filter(o => !planOrderIds.includes(o.id));

    return (
        <TableContainer>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>수주번호</TableCell>
                        <TableCell>거래처</TableCell>
                        <TableCell>수주일</TableCell>
                        <TableCell>납기일</TableCell>
                        <TableCell>금액</TableCell>
                        <TableCell>작업</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {unplannedOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center">생산 대기 중인 수주가 없습니다.</TableCell></TableRow>
                    ) : (
                        unplannedOrders.map((order) => (
                            <TableRow key={order.id}>
                                <TableCell>{order.order_no}</TableCell>
                                <TableCell>{order.partner?.name}</TableCell>
                                <TableCell>{order.order_date}</TableCell>
                                <TableCell>{order.delivery_date}</TableCell>
                                <TableCell>{order.total_amount?.toLocaleString()}</TableCell>
                                <TableCell>
                                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => onCreatePlan(order.id)}>
                                        계획 수립
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const ProductionPlansTable = ({ plans, orders }) => {
    return (
        <TableContainer>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>계획일</TableCell>
                        <TableCell>수주번호</TableCell>
                        <TableCell>상태</TableCell>
                        <TableCell>생성일</TableCell>
                        <TableCell>관리</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {plans.map((plan) => (
                        <Row key={plan.id} plan={plan} orders={orders} />
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const Row = ({ plan, orders }) => {
    const [open, setOpen] = useState(false);
    const order = orders?.find(o => o.id === plan.order_id);

    return (
        <React.Fragment>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                <TableCell>{plan.plan_date}</TableCell>
                <TableCell>{order ? order.order_no : plan.order_id}</TableCell>
                <TableCell><Chip label={plan.status} color="primary" variant="outlined" /></TableCell>
                <TableCell>{new Date(plan.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                    <IconButton size="small" onClick={() => setOpen(!open)}>
                        {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">
                                생산 공정 목록
                            </Typography>
                            <Table size="small" aria-label="purchases">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>공정명</TableCell>
                                        <TableCell>순서</TableCell>
                                        <TableCell>제품</TableCell>
                                        <TableCell>수량</TableCell>
                                        <TableCell>상태</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {plan.items?.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.process_name}</TableCell>
                                            <TableCell>{item.sequence}</TableCell>
                                            <TableCell>{item.product_id}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{item.status}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    )
}

export default ProductionPage;
