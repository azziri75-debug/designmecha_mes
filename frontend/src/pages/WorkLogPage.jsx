import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Collapse, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, KeyboardArrowDown, KeyboardArrowUp, AttachFile as AttachFileIcon, TrendingUp as PerformanceIcon, List as ListIcon, Save as SaveIcon } from '@mui/icons-material';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';
import ResizableTable from '../components/ResizableTable';
import WorkLogModal from '../components/WorkLogModal';
import FileViewerModal from '../components/FileViewerModal';
import { Tabs, Tab } from '@mui/material';



const LOG_COLS = [
    { key: 'expand', label: '', width: 50, noResize: true },
    { key: 'date', label: '작업일자', width: 120 },
    { key: 'worker', label: '작성자', width: 120 },
    { key: 'count', label: '세부 작업 수', width: 120 },
    { key: 'note', label: '비고', width: 300 },
    { key: 'actions', label: '관리', width: 100, noResize: true },
];

const PERF_COLS = [
    { key: 'expand', label: '', width: 50, noResize: true },
    { key: 'worker', label: '작업자', width: 180 },
    { key: 'cost', label: '누적 공정비용 (실적)', width: 250 },
    { key: 'days', label: '작업 일수', width: 120 },
    { key: 'note', label: '비고', width: 250 },
];

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

    // Table Resize States



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
                parsedFiles = safeParseJSON(files, []);
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
                <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#e2e8f0' }}>
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

            <Tabs
                value={tabValue}
                onChange={(e, v) => setTabValue(v)}
                sx={{
                    mb: 3,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '& .MuiTab-root': { color: 'rgba(255, 255, 255, 0.7)' },
                    '& .Mui-selected': { color: '#fff !important' },
                }}
            >
                <Tab icon={<ListIcon />} iconPosition="start" label="작업일지 목록" />
                <Tab icon={<PerformanceIcon />} iconPosition="start" label="실적 관리 (작업자별)" />
            </Tabs>

            {/* Shared Filters */}
            <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center', boxShadow: 2, borderRadius: 2, bgcolor: '#1e293b', border: '1px solid #334155' }}>
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
                <ResizableTable
                    columns={LOG_COLS}
                    className="w-full text-left text-sm"
                    theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                    thClassName="px-4 py-3"
                >
                    {filteredLogs.length === 0 ? (
                        <tr><td colSpan={LOG_COLS.length} className="px-4 py-12 text-center text-gray-500">등록된 (또는 검색된) 작업일지가 없습니다.</td></tr>
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
                </ResizableTable>
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
            <tr 
                className={cn(
                    "hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300",
                    open && "bg-gray-800/30"
                )}
                onClick={() => setOpen(!open)}
            >
                <td className="px-4 py-4 w-[50px] text-center">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                        {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </td>
                <td className="px-4 py-4 font-bold text-gray-200">{log.work_date}</td>
                <td className="px-4 py-4 text-gray-300">{log.worker?.name || '<미지정>'}</td>
                <td className="px-4 py-4 font-semibold text-blue-400">{log.items?.length || 0}건</td>
                <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                        <span className="truncate max-w-[300px]" title={log.note}>{log.note || '-'}</span>
                        {log.attachment_file && safeParseJSON(log.attachment_file, []).length > 0 && (
                            <IconButton size="small" color="info" onClick={(e) => { e.stopPropagation(); onViewFiles(); }} title="첨부파일 보기">
                                <AttachFileIcon fontSize="small" />
                            </IconButton>
                        )}
                    </div>
                </td>
                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                        <IconButton size="small" color="primary" onClick={onEdit} title="수정">
                            <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={onDelete} title="삭제">
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </div>
                </td>
            </tr>
            {open && (
                <tr className="bg-gray-800/50">
                    <td colSpan={LOG_COLS.length} className="p-0 border-none">
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 mx-4 my-2">
                                <h4 className="text-sm font-semibold mb-2 text-gray-300">세부 작업 내역</h4>
                                <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded-md">
                                    <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                        <tr>
                                            <th className="px-3 py-2">수주/재고번호</th>
                                            <th className="px-3 py-2">고객사</th>
                                            <th className="px-3 py-2">수주일/납기일</th>
                                            <th className="px-3 py-2">품명</th>
                                            <th className="px-3 py-2">공정명</th>
                                            <th className="px-3 py-2 text-right">양품</th>
                                            <th className="px-3 py-2 text-right">불량</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700 text-gray-300">
                                        {(!log.items || log.items.length === 0) ? (
                                            <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">세부 작업 내역이 없습니다.</td></tr>
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
                                                    <tr key={item.id} className="hover:bg-gray-700/40">
                                                        <td className="px-3 py-2">{orderNo}</td>
                                                        <td className="px-3 py-2">{plan?.order?.partner?.name || plan?.stock_production?.product?.name || '-'}</td>
                                                        <td className="px-3 py-2 text-[0.7rem] leading-tight">
                                                            {plan?.order?.order_date ? (
                                                                <div>
                                                                    <div>오더: {plan.order.order_date}</div>
                                                                    <div className="text-blue-700">납기: {plan.order.delivery_date || '-'}</div>
                                                                </div>
                                                            ) : (plan?.stock_production ? '재고생산' : '-')}
                                                        </td>
                                                        <td className="px-3 py-2 font-bold">{item.plan_item?.product?.name || '-'}</td>
                                                        <td className="px-3 py-2">{item.plan_item?.process_name || '-'}</td>
                                                        <td className="px-3 py-2 text-right font-bold text-green-700">{item.good_quantity}</td>
                                                        <td className="px-3 py-2 text-right font-bold text-red-600">{item.bad_quantity}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Collapse>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

const PerformanceManagementList = ({ data, onUpdate, startDate, endDate }) => {
    return (
        <ResizableTable
            columns={PERF_COLS}
            className="w-full text-left text-sm"
            theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
            thClassName="px-4 py-3"
        >
            {data.length === 0 ? (
                <tr><td colSpan={PERF_COLS.length} className="px-4 py-12 text-center text-gray-500">표시할 실적 데이터가 없습니다.</td></tr>
            ) : (
                data.map(row => (
                    <PerformanceRow key={row.worker_id} row={row} onUpdate={onUpdate} startDate={startDate} endDate={endDate} />
                ))
            )}
        </ResizableTable>
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
            <tr 
                className={cn(
                    "hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300",
                    open && "bg-gray-800/30"
                )}
                onClick={() => setOpen(!open)}
            >
                <td className="px-4 py-4 w-[50px] text-center">
                    <IconButton size="small">
                        {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                </td>
                <td className="px-4 py-4 font-bold text-gray-200">{row.worker_name}</td>
                <td className="px-4 py-4 text-right font-bold text-blue-400">
                    {(row.total_cost || 0).toLocaleString()}원
                </td>
                <td className="px-4 py-4 text-right font-medium text-gray-300">{row.log_days}일</td>
                <td className="px-4 py-4 text-gray-500">-</td>
            </tr>
            {open && (
                <tr className="bg-gray-800/50">
                    <td colSpan={PERF_COLS.length} className="p-0 border-none">
                        <Collapse in={open} timeout="auto" unmountOnExit>
                            <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 mx-4 my-2">
                                <h4 className="text-sm font-semibold mb-2 text-gray-300">[{row.worker_name}] 상세 실적 내역 및 단가 수정</h4>
                                <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded-md">
                                    <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                        <tr>
                                            <th className="px-3 py-2">작업일자</th>
                                            <th className="px-3 py-2">수주/재고번호</th>
                                            <th className="px-3 py-2">고객사</th>
                                            <th className="px-3 py-2 text-right">수주일/납기일</th>
                                            <th className="px-3 py-2">공정명 (품명)</th>
                                            <th className="px-3 py-2 text-right">양품수량</th>
                                            <th className="px-3 py-2 text-right">공정단가</th>
                                            <th className="px-3 py-2 text-right">합계</th>
                                            <th className="px-3 py-2 text-center">저장</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700 text-gray-300">
                                        {details.length === 0 ? (
                                            <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">조회된 상세 내역이 없습니다.</td></tr>
                                        ) : (
                                            details.map(item => (
                                                <PerformanceDetailRow key={item.id} item={item} onUpdate={() => { fetchDetails(); onUpdate(); }} />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Collapse>
                    </td>
                </tr>
            )}
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
        <tr className="hover:bg-gray-800/40 text-gray-300">
            <td className="px-3 py-2 text-gray-400 font-medium">{item.work_log?.work_date}</td>
            <td className="px-3 py-2 text-[0.75rem]">{orderNo}</td>
            <td className="px-3 py-2 text-[0.75rem]">{plan?.order?.partner?.name || plan?.stock_production?.product?.name || '-'}</td>
            <td className="px-3 py-2 text-[0.7rem] leading-tight text-right">
                {plan?.order?.order_date ? (
                    <div>
                        <div>{plan.order.order_date}</div>
                        <div className="text-blue-400">({plan.order.delivery_date || '-'})</div>
                    </div>
                ) : (plan?.stock_production ? '재고생산' : '-')}
            </td>
            <td className="px-3 py-2">
                <div className="font-bold text-gray-200">{item.plan_item?.process_name}</div>
                <div className="text-xs text-gray-500">({item.plan_item?.product?.name})</div>
            </td>
            <td className="px-3 py-2 text-right">
                <input
                    type="number"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="w-16 px-1 py-1 bg-gray-700 border border-gray-600 rounded text-right text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none"
                />
            </td>
            <td className="px-3 py-2 text-right">
                <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-20 px-1 py-1 bg-gray-700 border border-gray-600 rounded text-right text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none"
                />
            </td>
            <td className="px-3 py-2 text-right font-bold text-blue-400">
                {(editQty * editPrice).toLocaleString()}원
            </td>
            <td className="px-3 py-2 text-center">
                <IconButton size="small" color="primary" onClick={handleSave} disabled={saving}>
                    <SaveIcon fontSize="small" />
                </IconButton>
            </td>
        </tr>
    );
};

export default WorkLogPage;
