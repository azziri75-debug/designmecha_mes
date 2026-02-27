import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Select, MenuItem, IconButton, Autocomplete
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import api from '../lib/api';

const WorkLogModal = ({ isOpen, onClose, log, onSuccess }) => {
    const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
    const [workerId, setWorkerId] = useState('');
    const [note, setNote] = useState('');
    const [items, setItems] = useState([]);

    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(false);

    // Plan Items selection state
    const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
    const [availablePlanItems, setAvailablePlanItems] = useState([]);

    useEffect(() => {
        if (isOpen) {
            api.get('/basics/staff/').then(res => setStaffList(res.data)).catch(() => { });

            if (log) {
                setWorkDate(log.work_date);
                setWorkerId(log.worker_id || '');
                setNote(log.note || '');
                setItems(log.items.map(i => ({
                    ...i,
                    cid: Math.random().toString(36).substr(2, 9)
                })));
            } else {
                setWorkDate(new Date().toISOString().split('T')[0]);
                setWorkerId('');
                setNote('');
                setItems([]);
            }
        }
    }, [isOpen, log]);

    const handleOpenPlanSelector = async () => {
        try {
            // Fetch plans that are not completed (or all, then filter)
            const res = await api.get('/production/plans');
            const plans = res.data;
            let pItems = [];
            plans.forEach(plan => {
                if (plan.status !== 'CANCELED') {
                    plan.items.forEach(pi => {
                        if (pi.course_type === 'INTERNAL') {
                            // Let's include plan context
                            pItems.push({
                                ...pi,
                                plan: plan
                            });
                        }
                    });
                }
            });
            // Show only In Progress or Planned items
            setAvailablePlanItems(pItems.filter(p => p.status === 'PLANNED' || p.status === 'IN_PROGRESS'));
            setPlanSelectorOpen(true);
        } catch (error) {
            console.error("Failed to fetch plan items", error);
            alert("생산 계획을 불러오는데 실패했습니다.");
        }
    };

    const handleAddPlanItem = (planItem) => {
        const newItem = {
            cid: Math.random().toString(36).substr(2, 9),
            plan_item_id: planItem.id,
            plan_item: planItem, // for display
            worker_id: workerId || '', // Default to main worker
            good_quantity: 0,
            bad_quantity: 0,
            start_time: '',
            end_time: '',
            note: ''
        };
        setItems([...items, newItem]);
        setPlanSelectorOpen(false);
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const handleRemoveItem = (index) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const handleSubmit = async () => {
        if (!workDate) {
            alert('작업일자를 입력해주세요.');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                work_date: workDate,
                worker_id: workerId || null,
                note: note,
                items: items.map(i => ({
                    plan_item_id: i.plan_item_id,
                    worker_id: i.worker_id || null,
                    start_time: i.start_time || null,
                    end_time: i.end_time || null,
                    good_quantity: parseInt(i.good_quantity) || 0,
                    bad_quantity: parseInt(i.bad_quantity) || 0,
                    note: i.note
                }))
            };

            if (log) {
                await api.put(`/production/work-logs/${log.id}`, payload);
            } else {
                await api.post('/production/work-logs', payload);
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Save error", error);
            alert('저장 실패: ' + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                {log ? "작업일지 수정" : "새 작업일지 등록"}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', gap: 2, mb: 3, mt: 1 }}>
                    <TextField
                        label="작업일자"
                        type="date"
                        value={workDate}
                        onChange={(e) => setWorkDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                        required
                    />
                    <Select
                        value={workerId}
                        onChange={(e) => setWorkerId(e.target.value)}
                        size="small"
                        displayEmpty
                        sx={{ minWidth: 200 }}
                    >
                        <MenuItem value=""><em>작성자 (주 작업자)</em></MenuItem>
                        {staffList.filter(s => s.is_active).map(s => (
                            <MenuItem key={s.id} value={s.id}>{s.name} {s.role ? `(${s.role})` : ''}</MenuItem>
                        ))}
                    </Select>
                    <TextField
                        label="비고"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        size="small"
                        fullWidth
                    />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">세부 작업(실적) 내역</Typography>
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={handleOpenPlanSelector} size="small">
                        생산 공정 선택
                    </Button>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: '#f0f0f0' }}>
                                <TableCell>관련 수주/재고</TableCell>
                                <TableCell>품명</TableCell>
                                <TableCell>공정명</TableCell>
                                <TableCell>개별 작업자</TableCell>
                                <TableCell width="10%">양품 수량</TableCell>
                                <TableCell width="10%">불량 수량</TableCell>
                                <TableCell>비고</TableCell>
                                <TableCell width="50px">삭제</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                                        우측 상단의 '생산 공정 선택' 버튼을 눌러 실적을 등록할 공정을 추가하세요.
                                    </TableCell>
                                </TableRow>
                            ) : items.map((item, index) => {
                                const plan = item.plan_item?.plan;
                                let orderNo = '-';
                                if (plan?.order?.order_no) {
                                    orderNo = `[수주] ${plan.order.order_no}`;
                                } else if (plan?.stock_production?.production_no) {
                                    orderNo = `[재고] ${plan.stock_production.production_no}`;
                                }

                                return (
                                    <TableRow key={item.cid}>
                                        <TableCell sx={{ fontSize: '0.8rem' }}>{orderNo}</TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem' }}>{item.plan_item?.product?.name || '-'}</TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{item.plan_item?.process_name || '-'}</TableCell>
                                        <TableCell>
                                            <Select
                                                value={item.worker_id || ''}
                                                onChange={(e) => handleItemChange(index, 'worker_id', e.target.value)}
                                                size="small"
                                                displayEmpty
                                                fullWidth
                                                variant="standard"
                                                sx={{ fontSize: '0.8rem' }}
                                            >
                                                <MenuItem value=""><em>작업자</em></MenuItem>
                                                {staffList.filter(s => s.is_active).map(s => (
                                                    <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                                                ))}
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                type="number"
                                                value={item.good_quantity}
                                                onChange={(e) => handleItemChange(index, 'good_quantity', e.target.value)}
                                                size="small"
                                                variant="standard"
                                                inputProps={{ min: 0 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                type="number"
                                                value={item.bad_quantity}
                                                onChange={(e) => handleItemChange(index, 'bad_quantity', e.target.value)}
                                                size="small"
                                                variant="standard"
                                                inputProps={{ min: 0 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <TextField
                                                value={item.note || ''}
                                                onChange={(e) => handleItemChange(index, 'note', e.target.value)}
                                                size="small"
                                                variant="standard"
                                                fullWidth
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <IconButton size="small" color="error" onClick={() => handleRemoveItem(index)}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={loading}>
                    {loading ? "저장 중..." : "확정"}
                </Button>
            </DialogActions>

            {/* Plan Item Selection Dialog */}
            <Dialog open={planSelectorOpen} onClose={() => setPlanSelectorOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>생산 세부 공정 선택</DialogTitle>
                <DialogContent dividers>
                    <ListPlanItems
                        items={availablePlanItems}
                        onSelect={handleAddPlanItem}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPlanSelectorOpen(false)}>닫기</Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    );
};

// Helper component for Plan Item selection list
const ListPlanItems = ({ items, onSelect }) => {
    return (
        <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>생산 번호</TableCell>
                        <TableCell>품명 (단위)</TableCell>
                        <TableCell>순서</TableCell>
                        <TableCell>공정명</TableCell>
                        <TableCell>목표 수량</TableCell>
                        <TableCell>선택</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center">진행 가능한 사내 공정이 없습니다.</TableCell></TableRow>
                    ) : items.map(pi => {
                        const plan = pi.plan;
                        let orderNo = '-';
                        if (plan?.order?.order_no) {
                            orderNo = `[수주] ${plan.order.order_no}`;
                        } else if (plan?.stock_production?.production_no) {
                            orderNo = `[재고] ${plan.stock_production.production_no}`;
                        }

                        return (
                            <TableRow key={pi.id} hover>
                                <TableCell>{orderNo}</TableCell>
                                <TableCell>{pi.product?.name || '-'} ({pi.product?.unit || 'EA'})</TableCell>
                                <TableCell>{pi.sequence}</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>{pi.process_name}</TableCell>
                                <TableCell>{pi.quantity}</TableCell>
                                <TableCell>
                                    <Button size="small" variant="contained" onClick={() => onSelect(pi)}>선택</Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

export default WorkLogModal;
