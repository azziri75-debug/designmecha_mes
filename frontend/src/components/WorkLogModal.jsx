import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Select, MenuItem, IconButton, Autocomplete
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon, Upload as UploadIcon, FilePresent as FileIcon } from '@mui/icons-material';
import { X } from 'lucide-react';
import api from '../lib/api';
import FileViewerModal from './FileViewerModal';

const WorkLogModal = ({ isOpen, onClose, log, onSuccess }) => {
    const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
    const [workerId, setWorkerId] = useState('');
    const [note, setNote] = useState('');
    const [items, setItems] = useState([]);
    const [attachmentFile, setAttachmentFile] = useState([]);
    const [fileViewerOpen, setFileViewerOpen] = useState(false);

    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(false);

    // Plan/Item selection state
    const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
    const [availablePlans, setAvailablePlans] = useState([]);
    const [selectedPlanForLog, setSelectedPlanForLog] = useState(null);

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
                setAttachmentFile(log.attachment_file ? (typeof log.attachment_file === 'string' ? JSON.parse(log.attachment_file) : log.attachment_file) : []);
            } else {
                setWorkDate(new Date().toISOString().split('T')[0]);
                setWorkerId('');
                setNote('');
                setItems([]);
                setAttachmentFile([]);
            }
        }
    }, [isOpen, log]);

    const handleOpenPlanSelector = async () => {
        try {
            const res = await api.get('/production/plans');
            const plans = res.data.filter(plan => plan.status !== 'CANCELED');
            setAvailablePlans(plans);
            setSelectedPlanForLog(null);
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
            unit_price: planItem.cost / (planItem.quantity || 1), // Default price
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

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        try {
            const uploadedFiles = [];
            for (const file of files) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', file);

                const res = await api.post('/upload', uploadFormData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                uploadedFiles.push({
                    name: res.data.filename,
                    url: res.data.url
                });
            }

            setAttachmentFile(prev => [...prev, ...uploadedFiles]);
        } catch (error) {
            console.error("Upload failed", error);
            alert("파일 업로드 실패");
        }
    };

    const removeAttachment = (index) => {
        setAttachmentFile(prev => prev.filter((_, i) => i !== index));
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
                attachment_file: attachmentFile,
                items: items.map(i => ({
                    plan_item_id: i.plan_item_id,
                    worker_id: i.worker_id || null,
                    start_time: i.start_time || null,
                    end_time: i.end_time || null,
                    good_quantity: parseInt(i.good_quantity) || 0,
                    bad_quantity: parseInt(i.bad_quantity) || 0,
                    unit_price: parseFloat(i.unit_price) || 0,
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

                <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="textSecondary">첨부파일</Typography>
                        <Button
                            component="label"
                            variant="outlined"
                            size="small"
                            startIcon={<UploadIcon />}
                            sx={{ fontSize: '0.75rem' }}
                        >
                            파일 추가
                            <input type="file" multiple hidden onChange={handleFileUpload} />
                        </Button>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {attachmentFile.length > 0 ? (
                            attachmentFile.map((file, idx) => (
                                <Paper
                                    key={idx}
                                    variant="outlined"
                                    sx={{
                                        p: 0.5, px: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        backgroundColor: '#f8f9fa'
                                    }}
                                >
                                    <FileIcon sx={{ fontSize: '1.2rem', color: 'primary.main' }} />
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            cursor: 'pointer',
                                            '&:hover': { textDecoration: 'underline', color: 'primary.main' }
                                        }}
                                        onClick={() => setFileViewerOpen(true)}
                                    >
                                        {file.name}
                                    </Typography>
                                    <IconButton size="small" onClick={() => removeAttachment(idx)}>
                                        <X style={{ width: '14px', height: '14px' }} />
                                    </IconButton>
                                </Paper>
                            ))
                        ) : (
                            <Typography variant="caption" color="textSecondary">등록된 첨부파일이 없습니다.</Typography>
                        )}
                    </Box>
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
                <DialogTitle>
                    {selectedPlanForLog ? "생산 세부 공정 선택" : "생산 계획 선택"}
                    {selectedPlanForLog && (
                        <Button size="small" sx={{ ml: 2 }} onClick={() => setSelectedPlanForLog(null)}>
                            ← 뒤로 가기 (생산계획 다시 선택)
                        </Button>
                    )}
                </DialogTitle>
                <DialogContent dividers>
                    {!selectedPlanForLog ? (
                        <ListPlans plans={availablePlans} onSelectPlan={setSelectedPlanForLog} />
                    ) : (
                        <ListPlanItems
                            plan={selectedPlanForLog}
                            onSelect={handleAddPlanItem}
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPlanSelectorOpen(false)}>닫기</Button>
                </DialogActions>
            </Dialog>

            <FileViewerModal
                isOpen={fileViewerOpen}
                onClose={() => setFileViewerOpen(false)}
                files={attachmentFile}
                title="작업일지 첨부파일"
                onDeleteFile={removeAttachment}
            />
        </Dialog>
    );
};

// Helper component for Plan selection list
const ListPlans = ({ plans, onSelectPlan }) => {
    return (
        <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>생산 번호</TableCell>
                        <TableCell>계획 일자</TableCell>
                        <TableCell>거래처/분류</TableCell>
                        <TableCell>상태</TableCell>
                        <TableCell>선택</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {plans.length === 0 ? (
                        <TableRow><TableCell colSpan={5} align="center">진행 가능한 생산계획이 없습니다.</TableCell></TableRow>
                    ) : plans.map(plan => {
                        let orderNo = '-';
                        let partner = '-';
                        if (plan?.order?.order_no) {
                            orderNo = `[수주] ${plan.order.order_no}`;
                            partner = plan.order.partner?.name || '-';
                        } else if (plan?.stock_production?.production_no) {
                            orderNo = `[재고] ${plan.stock_production.production_no}`;
                            partner = '사내 생산';
                        }

                        return (
                            <TableRow key={plan.id} hover>
                                <TableCell>{orderNo}</TableCell>
                                <TableCell>{plan.plan_date}</TableCell>
                                <TableCell>{partner}</TableCell>
                                <TableCell>
                                    <span style={{
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        backgroundColor: plan.status === 'COMPLETED' ? '#e8f5e9' : '#e3f2fd',
                                        color: plan.status === 'COMPLETED' ? '#2e7d32' : '#1565c0'
                                    }}>
                                        {plan.status}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <Button size="small" variant="contained" onClick={() => onSelectPlan(plan)}>조회</Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

// Helper component for Plan Item selection list
const ListPlanItems = ({ plan, onSelect }) => {
    const items = plan.items.filter(pi =>
        pi.course_type === 'INTERNAL' &&
        (pi.status === 'PLANNED' || pi.status === 'IN_PROGRESS')
    );

    return (
        <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>품명 (단위)</TableCell>
                        <TableCell>순서</TableCell>
                        <TableCell>공정명</TableCell>
                        <TableCell>목표 수량</TableCell>
                        <TableCell>선택</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.length === 0 ? (
                        <TableRow><TableCell colSpan={5} align="center">진행 가능한 사내 세부 공정이 없습니다.</TableCell></TableRow>
                    ) : items.map(pi => {
                        return (
                            <TableRow key={pi.id} hover>
                                <TableCell>{pi.product?.name || '-'} ({pi.product?.unit || 'EA'})</TableCell>
                                <TableCell>{pi.sequence}</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>{pi.process_name}</TableCell>
                                <TableCell>{pi.quantity}</TableCell>
                                <TableCell>
                                    <Button size="small" variant="contained" onClick={() => onSelect({ ...pi, plan })}>선택</Button>
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
