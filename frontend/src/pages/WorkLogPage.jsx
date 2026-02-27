import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Collapse } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import api from '../lib/api';
import WorkLogModal from '../components/WorkLogModal';

const WorkLogPage = () => {
    const [workLogs, setWorkLogs] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const fetchWorkLogs = async () => {
        try {
            const response = await api.get('/production/work-logs');
            setWorkLogs(response.data);
        } catch (error) {
            console.error("Failed to fetch work logs", error);
        }
    };

    useEffect(() => {
        fetchWorkLogs();
    }, []);

    const handleCreateClick = () => {
        setSelectedLog(null);
        setModalOpen(true);
    };

    const handleEditClick = (log) => {
        setSelectedLog(log);
        setModalOpen(true);
    };

    const handleDeleteClick = async (id) => {
        if (!window.confirm("정말로 이 작업일지를 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/production/work-logs/${id}`);
            alert('삭제되었습니다.');
            fetchWorkLogs();
        } catch (error) {
            console.error("Failed to delete work log", error);
            alert('삭제 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleSuccess = () => {
        fetchWorkLogs();
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
                    작업일지 관리
                </Typography>
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={handleCreateClick}
                    sx={{ boxShadow: 2 }}
                >
                    새 작업일지 등록
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ mb: 4, boxShadow: 3, borderRadius: 2 }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                            <TableCell width="50px" />
                            <TableCell>작업일자</TableCell>
                            <TableCell>작성자</TableCell>
                            <TableCell>세부 작업 수</TableCell>
                            <TableCell>비고</TableCell>
                            <TableCell align="center" width="120px">관리</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {workLogs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>등록된 작업일지가 없습니다.</TableCell>
                            </TableRow>
                        ) : (
                            workLogs.map(log => (
                                <WorkLogRow
                                    key={log.id}
                                    log={log}
                                    onEdit={() => handleEditClick(log)}
                                    onDelete={() => handleDeleteClick(log.id)}
                                />
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {modalOpen && (
                <WorkLogModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    log={selectedLog}
                    onSuccess={handleSuccess}
                />
            )}
        </Box>
    );
};

const WorkLogRow = ({ log, onEdit, onDelete }) => {
    const [open, setOpen] = useState(false);

    return (
        <React.Fragment>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' }, cursor: 'pointer', '&:hover': { backgroundColor: '#fafafa' } }} onClick={() => setOpen(!open)}>
                <TableCell>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                        {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{log.work_date}</TableCell>
                <TableCell>{log.worker?.name || '<미지정>'}</TableCell>
                <TableCell>{log.items?.length || 0}건</TableCell>
                <TableCell>{log.note || '-'}</TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" color="primary" onClick={onEdit} title="수정">
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={onDelete} title="삭제">
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2, p: 2, backgroundColor: '#f8f9fa', borderRadius: 1, border: '1px solid #eee' }}>
                            <Typography variant="subtitle2" gutterBottom sx={{ color: '#555', fontWeight: 'bold' }}>
                                세부 작업 내역
                            </Typography>
                            <Table size="small" sx={{ mt: 1 }}>
                                <TableHead>
                                    <TableRow sx={{ backgroundColor: '#fff' }}>
                                        <TableCell>관련 수주/재고번호</TableCell>
                                        <TableCell>품명</TableCell>
                                        <TableCell>공정명</TableCell>
                                        <TableCell>개별 작업자</TableCell>
                                        <TableCell align="right">양품수량</TableCell>
                                        <TableCell align="right">불량수량</TableCell>
                                        <TableCell>비고</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(!log.items || log.items.length === 0) ? (
                                        <TableRow><TableCell colSpan={7} align="center">세부 작업 내역이 없습니다.</TableCell></TableRow>
                                    ) : (
                                        log.items.map(item => {
                                            const plan = item.plan_item?.plan;
                                            let orderNo = '-';
                                            if (plan?.order?.order_no) {
                                                orderNo = `[수주] ${plan.order.order_no}`;
                                            } else if (plan?.stock_production?.production_no) {
                                                orderNo = `[재고] ${plan.stock_production.production_no}`;
                                            }

                                            return (
                                                <TableRow key={item.id} sx={{ backgroundColor: '#fff' }}>
                                                    <TableCell>{orderNo}</TableCell>
                                                    <TableCell>{item.plan_item?.product?.name || '-'}</TableCell>
                                                    <TableCell>{item.plan_item?.process_name || '-'}</TableCell>
                                                    <TableCell>{item.worker?.name || '-'}</TableCell>
                                                    <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 500 }}>{item.good_quantity}</TableCell>
                                                    <TableCell align="right" sx={{ color: '#d32f2f', fontWeight: 500 }}>{item.bad_quantity}</TableCell>
                                                    <TableCell>{item.note || '-'}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

export default WorkLogPage;
