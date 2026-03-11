import React, { useState, useRef, useEffect } from 'react';
import {
    Modal, Box, Typography, Button, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    Grid, Divider, TextField
} from '@mui/material';
import { X, Download, Printer, Save, Plus, Trash2 } from 'lucide-react';
import { formatNumber, toKoreanCurrency } from '../lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const TransactionStatementModal = ({ open, onClose, data, onSave }) => {
    if (!data) return null;

    const [items, setItems] = useState(data.items || []);
    const [supplierInfo, setSupplierInfo] = useState(data.supplier_info || {
        biz_no: '123-45-67890',
        company_name: '(주)디자인메카',
        owner_name: '홍길동',
        address: '경기도 안산시 단원구 ...',
        biz_type: '제조업',
        biz_item: '기계부품'
    });
    const [note, setNote] = useState(data.note || '');
    const [columns, setColumns] = useState([
        { id: 'month', label: '월', width: 40 },
        { id: 'day', label: '일', width: 40 },
        { id: 'item', label: '품목 / 규격', width: 200 },
        { id: 'qty', label: '수량', width: 60 },
        { id: 'price', label: '단가', width: 100 },
        { id: 'supply_value', label: '공급가액', width: 120 },
        { id: 'tax', label: '세액', width: 100 },
        { id: 'remark', label: '비고', width: 100 },
    ]);

    const printRef = useRef();

    // Calculate totals
    const totalSupplyValue = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalTax = Math.floor(totalSupplyValue * 0.1);
    const totalAmount = totalSupplyValue + totalTax;

    const handleDownloadPDF = async () => {
        const element = printRef.current;
        const canvas = await html2canvas(element, { scale: 3 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`거래명세서_${data.order_no || 'No'}.pdf`);
    };

    const handleResize = (index, newWidth) => {
        const newCols = [...columns];
        newCols[index].width = Math.max(30, newWidth);
        setColumns(newCols);
    };

    const StatementPage = ({ type, color }) => {
        const borderColor = color === 'blue' ? '#2563eb' : '#dc2626';
        const bgColor = color === 'blue' ? '#eff6ff' : '#fef2f2';

        return (
            <Box sx={{
                p: 2, mb: 4, border: `2px solid ${borderColor}`, borderRadius: 1,
                backgroundColor: '#fff', fontSize: '11px', fontFamily: 'Pretendard, sans-serif'
            }}>
                <Typography variant="h5" align="center" sx={{ fontWeight: 'bold', color: borderColor, mb: 2, letterSpacing: 8 }}>
                    거 래 명 세 표
                    <Typography component="span" sx={{ fontSize: '14px', ml: 1, fontWeight: 'normal' }}>
                        ({type === 'supplier' ? '공급자 보관용' : '공급 받는자 보관용'})
                    </Typography>
                </Typography>

                <Grid container spacing={0} sx={{ border: `1px solid ${borderColor}`, borderBottom: 'none' }}>
                    {/* Date / Total Row */}
                    <Grid item xs={6} sx={{ borderRight: `1px solid ${borderColor}`, p: 1, display: 'flex', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 'bold', mr: 2 }}>일 자 : {data.delivery_date || new Date().toISOString().split('T')[0]}</Typography>
                        <Divider orientation="vertical" flexItem sx={{ mx: 2, bgcolor: borderColor }} />
                        <Typography sx={{ fontWeight: 'bold' }}>{data.partner?.name} 귀하</Typography>
                    </Grid>
                    <Grid item xs={6} sx={{ p: 1, display: 'flex', alignItems: 'center', bgcolor: bgColor }}>
                        <Typography sx={{ fontWeight: 'bold' }}>합계금액 : </Typography>
                        <Typography sx={{ flexGrow: 1, textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>
                            {toKoreanCurrency(totalAmount)}
                        </Typography>
                        <Typography sx={{ fontWeight: 'bold' }}>(\ {formatNumber(totalAmount)})</Typography>
                    </Grid>
                </Grid>

                <Grid container spacing={0} sx={{ border: `1px solid ${borderColor}` }}>
                    {/* Supplier Info */}
                    <Grid item xs={1} sx={{ bgcolor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${borderColor}` }}>
                        <Typography sx={{ fontWeight: 'bold', writingMode: 'vertical-rl', letterSpacing: 4 }}>공급자</Typography>
                    </Grid>
                    <Grid item xs={11}>
                        <Grid container spacing={0}>
                            <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}`, textAlign: 'center' }}>등록번호</Grid>
                            <Grid item xs={10} sx={{ p: 0.5, borderBottom: `1px solid ${borderColor}`, fontWeight: 'bold', fontSize: '14px' }}>{supplierInfo.biz_no}</Grid>

                            <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}`, textAlign: 'center' }}>상호(성명)</Grid>
                            <Grid item xs={4} sx={{ p: 0.5, borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}` }}>{supplierInfo.company_name} (인)</Grid>
                            <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}`, textAlign: 'center' }}>성 명</Grid>
                            <Grid item xs={4} sx={{ p: 0.5, borderBottom: `1px solid ${borderColor}` }}>{supplierInfo.owner_name}</Grid>

                            <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}`, textAlign: 'center' }}>사업장주소</Grid>
                            <Grid item xs={10} sx={{ p: 0.5, borderBottom: `1px solid ${borderColor}` }}>{supplierInfo.address}</Grid>

                            <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, textAlign: 'center' }}>업 태</Grid>
                            <Grid item xs={4} sx={{ p: 0.5, borderRight: `1px solid ${borderColor}` }}>{supplierInfo.biz_type}</Grid>
                            <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, textAlign: 'center' }}>종 목</Grid>
                            <Grid item xs={4} sx={{ p: 0.5 }}>{supplierInfo.biz_item}</Grid>
                        </Grid>
                    </Grid>
                </Grid>

                {/* Main Table */}
                <Box sx={{ mt: 2, border: `1px solid ${borderColor}` }}>
                    <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                        <TableHead sx={{ bgcolor: bgColor }}>
                            <TableRow sx={{ height: 30 }}>
                                {columns.map((col, idx) => (
                                    <TableCell key={col.id}
                                        sx={{
                                            p: 0, border: `1px solid ${borderColor}`, fontWeight: 'bold', textAlign: 'center',
                                            width: col.width, position: 'relative'
                                        }}
                                    >
                                        {col.label}
                                        {idx < columns.length - 1 && (
                                            <Box
                                                onMouseDown={(e) => {
                                                    const startX = e.pageX;
                                                    const startWidth = col.width;
                                                    const moveHandler = (moveEvent) => {
                                                        const delta = moveEvent.pageX - startX;
                                                        handleResize(idx, startWidth + delta);
                                                    };
                                                    const upHandler = () => {
                                                        window.removeEventListener('mousemove', moveHandler);
                                                        window.removeEventListener('mouseup', upHandler);
                                                    };
                                                    window.addEventListener('mousemove', moveHandler);
                                                    window.addEventListener('mouseup', upHandler);
                                                }}
                                                sx={{
                                                    position: 'absolute', right: 0, top: 0, bottom: 0, width: 5,
                                                    cursor: 'col-resize', '&:hover': { bgcolor: borderColor }
                                                }}
                                            />
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {[...Array(Math.max(items.length, 10))].map((_, idx) => {
                                const item = items[idx];
                                const dateToUse = data.delivery_date || data.order_date || '';
                                return (
                                    <TableRow key={idx} sx={{ height: 25 }}>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'center' }}>{item ? (dateToUse?.split('-')[1] || '') : ''}</TableCell>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'center' }}>{item ? (dateToUse?.split('-')[2] || '') : ''}</TableCell>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}` }}>{item?.product?.name || item?.item_name || ''}</TableCell>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'right' }}>{item ? formatNumber(item.quantity) : ''}</TableCell>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'right' }}>{item ? formatNumber(item.unit_price) : ''}</TableCell>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'right' }}>{item ? formatNumber(item.quantity * item.unit_price) : ''}</TableCell>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'right' }}>{item ? formatNumber(Math.floor(item.quantity * item.unit_price * 0.1)) : ''}</TableCell>
                                        <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}` }}>{item?.note || ''}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableHead sx={{ bgcolor: bgColor }}>
                            <TableRow sx={{ height: 30 }}>
                                <TableCell colSpan={3} sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'center', fontWeight: 'bold' }}>소계</TableCell>
                                <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'right' }}>{formatNumber(items.reduce((s, i) => s + i.quantity, 0))}</TableCell>
                                <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}` }}></TableCell>
                                <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'right' }}>{formatNumber(totalSupplyValue)}</TableCell>
                                <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}`, textAlign: 'right' }}>{formatNumber(totalTax)}</TableCell>
                                <TableCell sx={{ p: 0.5, border: `1px solid ${borderColor}` }}></TableCell>
                            </TableRow>
                        </TableHead>
                    </Table>
                </Box>

                <Grid container spacing={0} sx={{ mt: 2, border: `1px solid ${borderColor}` }}>
                    <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, textAlign: 'center', fontWeight: 'bold' }}>미수금</Grid>
                    <Grid item xs={2} sx={{ p: 0.5, borderRight: `1px solid ${borderColor}`, textAlign: 'right' }}>0</Grid>
                    <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, textAlign: 'center', fontWeight: 'bold' }}>합계금액</Grid>
                    <Grid item xs={2} sx={{ p: 0.5, borderRight: `1px solid ${borderColor}`, textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(totalAmount)}</Grid>
                    <Grid item xs={2} sx={{ bgcolor: bgColor, p: 0.5, borderRight: `1px solid ${borderColor}`, textAlign: 'center', fontWeight: 'bold' }}>총잔액</Grid>
                    <Grid item xs={2} sx={{ p: 0.5, textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(totalAmount)}</Grid>
                </Grid>
            </Box>
        );
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 900, maxHeight: '95vh', bgcolor: 'background.paper', boxShadow: 24, borderRadius: 2, display: 'flex', flexDirection: 'column'
            }}>
                <Box sx={{ p: 2, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">거래명세서 미리보기</Typography>
                    <Box>
                        <Button startIcon={<Download />} onClick={handleDownloadPDF} sx={{ mr: 1 }}>PDF 다운로드</Button>
                        <IconButton onClick={onClose}><X size={20} /></IconButton>
                    </Box>
                </Box>

                <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 4, bgcolor: '#f3f4f6' }}>
                    <div ref={printRef} style={{ width: '100%', padding: '20px', backgroundColor: '#fff' }}>
                        <StatementPage type="receiver" color="blue" />
                        <Divider sx={{ borderStyle: 'dashed', my: 2 }} />
                        <StatementPage type="supplier" color="red" />
                    </div>
                </Box>

                <Box sx={{ p: 2, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <Button variant="outlined" startIcon={<Save />} onClick={() => onSave({ items, supplierInfo, note })}>발행 정보 저장</Button>
                    <Button variant="contained" onClick={onClose}>닫기</Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default TransactionStatementModal;
