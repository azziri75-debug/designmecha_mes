import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Collapse, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, KeyboardArrowDown, KeyboardArrowUp, AttachFile as AttachFileIcon, TrendingUp as PerformanceIcon, List as ListIcon, Save as SaveIcon } from '@mui/icons-material';
import api from '../lib/api';
import WorkLogModal from '../components/WorkLogModal';
import FileViewerModal from '../components/FileViewerModal';
import { Tabs, Tab } from '@mui/material';

const WorkLogPage = () => {
    const [workLogs, setWorkLogs] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const [staffList, setStaffList] = useState([]);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorker, setSelectedWorker] = useState('');

    // File Viewer
    const [fileViewerOpen, setFileViewerOpen] = useState(false);
    const [currentFilesToView, setCurrentFilesToView] = useState([]);

    const [tabValue, setTabValue] = useState(0);
    const [performanceData, setPerformanceData] = useState([]);

    const fetchWorkLogs = async () => {
        try {
            const response = await api.get('/production/work-logs');
            setWorkLogs(response.data);
        } catch (error) {
            console.error("Failed to fetch work logs", error);
        }
    };

    const fetchStaffList = async () => {
        try {
            const response = await api.get('/basics/staff/');
            setStaffList(response.data);
        } catch (error) {
            console.error("Failed to fetch staff list", error);
        }
    };

    const fetchPerformanceData = async () => {
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (selectedWorker) params.append('worker_id', selectedWorker);

            const response = await api.get(`/production/performance/workers?${params.toString()}`);
            setPerformanceData(response.data);
        } catch (error) {
            console.error("Failed to fetch performance data", error);
        }
    };

    useEffect(() => {
        fetchWorkLogs();
        fetchStaffList();
    }, []);

    useEffect(() => {
        fetchPerformanceData();
    }, [startDate, endDate, selectedWorker]);

    // Filter logic for work logs (client-side for now as before)
    const filteredLogs = workLogs.filter(log => {
        let match = true;
        if (startDate && log.work_date < startDate) match = false;
        if (endDate && log.work_date > endDate) match = false;
        if (selectedWorker && log.worker_id !== Number(selectedWorker)) match = false;
        return match;
    });

    const handleViewFiles = (files) => {
        let parsedFiles = files;
        if (typeof files === 'string') {
            try {
                parsedFiles = JSON.parse(files);
            } catch (e) {
                console.error("Failed to parse attachment files", e);
                parsedFiles = [];
            }
        }
        if (parsedFiles && parsedFiles.length > 0) {
            setCurrentFilesToView(parsedFiles);
            setFileViewerOpen(true);
        }
    };

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
            fetchPerformanceData(); // Also refresh performance
        } catch (error) {
            console.error("Failed to delete work log", error);
            alert('삭제 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleSuccess = () => {
        fetchWorkLogs();
        fetchPerformanceData();
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
                    작업일지 및 실적 관리
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

            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Tab icon={<ListIcon />} iconPosition="start" label="작업일지 목록" />
                <Tab icon={<PerformanceIcon />} iconPosition="start" label="실적 관리 (작업자별)" />
            </Tabs>

            {/* Shared Filters */}
            <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center', boxShadow: 2, borderRadius: 2 }}>
                <TextField
                    label="시작일"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <Typography variant="body1">~</Typography>
                <TextField
                    label="종료일"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel id="worker-filter-label">작업자</InputLabel>
                    <Select
                        labelId="worker-filter-label"
                        value={selectedWorker}
                        label="작업자"
                        onChange={(e) => setSelectedWorker(e.target.value)}
                    >
                        <MenuItem value=""><em>전체</em></MenuItem>
                        {staffList.filter(s => s.is_active).map(staff => (
                            <MenuItem key={staff.id} value={staff.id}>{staff.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button variant="outlined" color="secondary" onClick={() => { setStartDate(''); setEndDate(''); setSelectedWorker(''); }} size="small">
                    초기화
                </Button>
            </Paper>

            {tabValue === 0 ? (
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
                            {filteredLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>등록된 (또는 검색된) 작업일지가 없습니다.</TableCell>
                                </TableRow>
                            ) : (
                                filteredLogs.map(log => (
                                    <WorkLogRow
                                        key={log.id}
                                        log={log}
                                        onEdit={() => handleEditClick(log)}
                                        onDelete={() => handleDeleteClick(log.id)}
                                        onViewFiles={() => handleViewFiles(log.attachment_file)}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                <PerformanceManagementList
                    data={performanceData}
                    onUpdate={() => { fetchPerformanceData(); fetchWorkLogs(); }}
                    startDate={startDate}
                    endDate={endDate}
                />
            )}

            {modalOpen && (
                <WorkLogModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    log={selectedLog}
                    onSuccess={handleSuccess}
                />
            )}

            <FileViewerModal
                isOpen={fileViewerOpen}
                onClose={() => setFileViewerOpen(false)}
                files={currentFilesToView}
                title="작업일지 첨부파일"
                readOnly={true}
            />
        </Box>
    );
};

const WorkLogRow = ({ log, onEdit, onDelete, onViewFiles }) => {
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
                <TableCell>
                    {log.note || '-'}
                    {log.attachment_file && (typeof log.attachment_file === 'string' ? JSON.parse(log.attachment_file).length > 0 : log.attachment_file.length > 0) && (
                        <IconButton size="small" color="info" onClick={(e) => { e.stopPropagation(); onViewFiles(); }} title="첨부파일 보기" sx={{ ml: 1 }}>
                            <AttachFileIcon fontSize="small" />
                        </IconButton>
                    )}
                </TableCell>
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

const PerformanceManagementList = ({ data, onUpdate, startDate, endDate }) => {
    return (
        <TableContainer component={Paper} sx={{ mb: 4, boxShadow: 3, borderRadius: 2 }}>
            <Table>
                <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell width="50px" />
                        <TableCell>작업자</TableCell>
                        <TableCell align="right">누적 공정비용 (실적)</TableCell>
                        <TableCell align="right">작업 일수</TableCell>
                        <TableCell>비고</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ py: 3 }}>표시할 실적 데이터가 없습니다.</TableCell>
                        </TableRow>
                    ) : (
                        data.map(row => (
                            <PerformanceRow key={row.worker_id} row={row} onUpdate={onUpdate} startDate={startDate} endDate={endDate} />
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const PerformanceRow = ({ row, onUpdate, startDate, endDate }) => {
    const [open, setOpen] = useState(false);
    const [details, setDetails] = useState([]);

    const fetchDetails = async () => {
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const res = await api.get(`/production/performance/workers/${row.worker_id}/details?${params.toString()}`);
            setDetails(res.data);
        } catch (error) {
            console.error("Failed to fetch performance details", error);
        }
    };

    useEffect(() => {
        if (open) fetchDetails();
    }, [open, startDate, endDate]);

    return (
        <React.Fragment>
            <TableRow sx={{ cursor: 'pointer', '&:hover': { backgroundColor: '#fafafa' } }} onClick={() => setOpen(!open)}>
                <TableCell>
                    <IconButton size="small">
                        {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{row.worker_name}</TableCell>
                <TableCell align="right" sx={{ color: '#1a237e', fontWeight: 500 }}>
                    {(row.total_cost || 0).toLocaleString()}원
                </TableCell>
                <TableCell align="right">{row.log_days}일</TableCell>
                <TableCell>-</TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2, p: 2, backgroundColor: '#f1f3f4', borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom sx={{ color: '#111', fontWeight: 'bold' }}>
                                [{row.worker_name}] 상세 실적 내역 및 단가 수정
                            </Typography>
                            <Table size="small" sx={{ mt: 1, backgroundColor: '#fff' }}>
                                <TableHead>
                                    <TableRow sx={{ backgroundColor: '#eee' }}>
                                        <TableCell>작업일자</TableCell>
                                        <TableCell>수주/재고</TableCell>
                                        <TableCell>공정명 (품명)</TableCell>
                                        <TableCell align="right">양품수량</TableCell>
                                        <TableCell align="right">공정단가</TableCell>
                                        <TableCell align="right">합계</TableCell>
                                        <TableCell align="center">저장</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {details.map(item => (
                                        <PerformanceDetailRow key={item.id} item={item} onUpdate={() => { fetchDetails(); onUpdate(); }} />
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </React.Fragment>
    );
};

const PerformanceDetailRow = ({ item, onUpdate }) => {
    const [editQty, setEditQty] = useState(item.good_quantity);

    // Fallback to plan_item cost if unit_price is 0
    const defaultPrice = item.unit_price || (item.plan_item?.cost / (item.plan_item?.quantity || 1)) || 0;
    const [editPrice, setEditPrice] = useState(defaultPrice);
    const [saving, setSaving] = useState(false);

    const plan = item.plan_item?.plan;
    let orderNo = '-';
    if (plan?.order?.order_no) orderNo = plan.order.order_no;
    else if (plan?.stock_production?.production_no) orderNo = plan.stock_production.production_no;

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch(`/production/work-log-items/${item.id}`, {
                good_quantity: parseInt(editQty),
                unit_price: parseFloat(editPrice)
            });
            alert('수정되었습니다.');
            onUpdate();
        } catch (error) {
            console.error("Update failed", error);
            alert("수정 실패");
        } finally {
            setSaving(false);
        }
    };

    return (
        <TableRow>
            <TableCell>{item.work_log?.work_date}</TableCell>
            <TableCell sx={{ fontSize: '0.75rem' }}>{orderNo}</TableCell>
            <TableCell>
                {item.plan_item?.process_name}
                <Typography variant="caption" display="block" color="textSecondary">
                    ({item.plan_item?.product?.name})
                </Typography>
            </TableCell>
            <TableCell align="right">
                <TextField
                    type="number"
                    size="small"
                    variant="standard"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    inputProps={{ style: { textAlign: 'right', fontSize: '0.85rem' } }}
                    sx={{ width: 60 }}
                />
            </TableCell>
            <TableCell align="right">
                <TextField
                    type="number"
                    size="small"
                    variant="standard"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    inputProps={{ style: { textAlign: 'right', fontSize: '0.85rem' } }}
                    sx={{ width: 80 }}
                />
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 500 }}>
                {(editQty * editPrice).toLocaleString()}
            </TableCell>
            <TableCell align="center">
                <IconButton size="small" color="primary" onClick={handleSave} disabled={saving}>
                    <SaveIcon fontSize="small" />
                </IconButton>
            </TableCell>
        </TableRow>
    );
};

export default WorkLogPage;
