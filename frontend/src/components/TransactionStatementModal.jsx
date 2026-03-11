import React, { useState, useRef, useEffect } from 'react';
import {
    Modal, Box, Typography, Button, IconButton,
    Table, TableBody, TableCell, TableHead, TableRow,
    Grid, Divider
} from '@mui/material';
import { X, Download, Printer, Save } from 'lucide-react';
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
        address: '경기도 안산시 단원구 산단로 123',
        biz_type: '제조업',
        biz_item: '기계부품, 금형'
    });
    const [note, setNote] = useState(data.note || '');

    const printRef = useRef();

    // Calculate totals
    const totalSupplyValue = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalTax = Math.floor(totalSupplyValue * 0.1);
    const totalAmount = totalSupplyValue + totalTax;

    const handleDownloadPDF = async () => {
        const element = printRef.current;
        const canvas = await html2canvas(element, {
            scale: 4, // High resolution for clear Korean font
            useCORS: true,
            logging: false
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape for side-by-side
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`거래명세서_${data.order_no || 'No'}.pdf`);
    };

    const StatementForm = ({ type, color }) => {
        const primaryColor = color === 'blue' ? '#003399' : '#cc0000';
        const lightColor = color === 'blue' ? '#ebf4ff' : '#fff5f5';

        return (
            <Box sx={{
                width: '100%',
                height: '100%',
                border: `2px solid ${primaryColor}`,
                p: 1.5,
                backgroundColor: '#fff',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: '"Malgun Gothic", Dotum, sans-serif'
            }}>
                {/* Title Section */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography sx={{
                        fontSize: '22px',
                        fontWeight: 'bold',
                        color: primaryColor,
                        borderBottom: `2px double ${primaryColor}`,
                        pb: 0.5,
                        flexGrow: 1,
                        textAlign: 'center',
                        letterSpacing: 4
                    }}>
                        거 래 명 세 표
                    </Typography>
                    <Typography sx={{ fontSize: '12px', fontWeight: 'bold', color: primaryColor, ml: 1, border: `1px solid ${primaryColor}`, p: 0.5 }}>
                        {type === 'receiver' ? '공급받는자 보관용' : '공급자 보관용'}
                    </Typography>
                </Box>

                {/* Top Info Section (Supplier & Receiver Side-by-Side) */}
                <Grid container sx={{ border: `1px solid ${primaryColor}`, borderBottom: 'none' }}>
                    <Grid item xs={6} sx={{ borderRight: `1px solid ${primaryColor}`, p: 0.5 }}>
                        <Box sx={{ display: 'flex', height: '100%' }}>
                            <Box sx={{ bgcolor: lightColor, width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${primaryColor}` }}>
                                <Typography sx={{ fontSize: '11px', fontWeight: 'bold', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>공급받는자</Typography>
                            </Box>
                            <Box sx={{ flexGrow: 1, p: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <Typography sx={{ fontSize: '16px', fontWeight: 'bold', mb: 1 }}>{data.partner?.name || '귀하'}</Typography>
                                <Typography sx={{ fontSize: '11px' }}>일자: {data.delivery_date || data.order_date || '-'}</Typography>
                            </Box>
                        </Box>
                    </Grid>
                    <Grid item xs={6}>
                        <Box sx={{ display: 'flex' }}>
                            <Box sx={{ bgcolor: lightColor, width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${primaryColor}` }}>
                                <Typography sx={{ fontSize: '11px', fontWeight: 'bold', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>공급자</Typography>
                            </Box>
                            <Box sx={{ flexGrow: 1 }}>
                                <Grid container>
                                    <Grid item xs={3} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '10px', textAlign: 'center' }}>등록번호</Grid>
                                    <Grid item xs={9} sx={{ borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '11px', fontWeight: 'bold' }}>{supplierInfo.biz_no}</Grid>

                                    <Grid item xs={3} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '10px', textAlign: 'center' }}>상호</Grid>
                                    <Grid item xs={4} sx={{ borderRight: `1px solid ${primaryColor}`, borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '10px' }}>{supplierInfo.company_name}</Grid>
                                    <Grid item xs={2} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '10px', textAlign: 'center' }}>성명</Grid>
                                    <Grid item xs={3} sx={{ borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '10px' }}>{supplierInfo.owner_name}</Grid>

                                    <Grid item xs={3} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '10px', textAlign: 'center' }}>사업장주소</Grid>
                                    <Grid item xs={9} sx={{ borderBottom: `1px solid ${primaryColor}`, p: 0.5, fontSize: '9px' }}>{supplierInfo.address}</Grid>

                                    <Grid item xs={3} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, p: 0.5, fontSize: '10px', textAlign: 'center' }}>업태/종목</Grid>
                                    <Grid item xs={9} sx={{ p: 0.5, fontSize: '10px' }}>{supplierInfo.biz_type} / {supplierInfo.biz_item}</Grid>
                                </Grid>
                            </Box>
                        </Box>
                    </Grid>
                </Grid>

                {/* Total Amount Box */}
                <Box sx={{ border: `1px solid ${primaryColor}`, p: 0.8, bgcolor: lightColor, display: 'flex', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '11px', fontWeight: 'bold', mr: 2 }}>합계 금액</Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 'bold', flexGrow: 1 }}>일금 {toKoreanCurrency(totalAmount)} 정</Typography>
                    <Typography sx={{ fontSize: '13px', fontWeight: 'bold' }}>(\ {formatNumber(totalAmount)})</Typography>
                </Box>

                {/* Items Table */}
                <Box sx={{ flexGrow: 1, mt: 1, border: `1px solid ${primaryColor}` }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                        <thead style={{ backgroundColor: lightColor }}>
                            <tr>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '30px' }}>월</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '30px' }}>일</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px' }}>품명 및 규격</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '40px' }}>단위</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '40px' }}>수량</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '70px' }}>단가</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '80px' }}>공급가액</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '70px' }}>세액</th>
                                <th style={{ border: `1px solid ${primaryColor}`, padding: '4px', width: '60px' }}>비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...Array(12)].map((_, idx) => {
                                const item = items[idx];
                                const dateToUse = data.delivery_date || data.order_date || '';
                                return (
                                    <tr key={idx} style={{ height: '22px' }}>
                                        <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'center' }}>{item ? (dateToUse?.split('-')[1] || '') : ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'center' }}>{item ? (dateToUse?.split('-')[2] || '') : ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, padding: '0 4px' }}>{item?.product?.name || item?.item_name || ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'center' }}>{item ? (item.unit || 'EA') : ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'right', padding: '0 4px' }}>{item ? formatNumber(item.quantity) : ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'right', padding: '0 4px' }}>{item ? formatNumber(item.unit_price) : ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'right', padding: '0 4px' }}>{item ? formatNumber(item.quantity * item.unit_price) : ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'right', padding: '0 4px' }}>{item ? formatNumber(Math.floor(item.quantity * item.unit_price * 0.1)) : ''}</td>
                                        <td style={{ border: `1px solid ${primaryColor}`, padding: '0 4px' }}>{item?.note || ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot style={{ backgroundColor: lightColor, fontWeight: 'bold' }}>
                            <tr style={{ height: '24px' }}>
                                <td colSpan={6} style={{ border: `1px solid ${primaryColor}`, textAlign: 'center' }}>합 계</td>
                                <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'right', padding: '0 4px' }}>{formatNumber(totalSupplyValue)}</td>
                                <td style={{ border: `1px solid ${primaryColor}`, textAlign: 'right', padding: '0 4px' }}>{formatNumber(totalTax)}</td>
                                <td style={{ border: `1px solid ${primaryColor}` }}></td>
                            </tr>
                        </tfoot>
                    </table>
                </Box>

                {/* Footer Section */}
                <Grid container sx={{ mt: 1, border: `1px solid ${primaryColor}` }}>
                    <Grid item xs={2} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, p: 0.5, textAlign: 'center', fontSize: '10px' }}>공급가액</Grid>
                    <Grid item xs={2} sx={{ borderRight: `1px solid ${primaryColor}`, p: 0.5, textAlign: 'right', fontSize: '11px', fontWeight: 'bold' }}>{formatNumber(totalSupplyValue)}</Grid>
                    <Grid item xs={2} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, p: 0.5, textAlign: 'center', fontSize: '10px' }}>세액</Grid>
                    <Grid item xs={2} sx={{ borderRight: `1px solid ${primaryColor}`, p: 0.5, textAlign: 'right', fontSize: '11px', fontWeight: 'bold' }}>{formatNumber(totalTax)}</Grid>
                    <Grid item xs={2} sx={{ bgcolor: lightColor, borderRight: `1px solid ${primaryColor}`, p: 0.5, textAlign: 'center', fontSize: '10px' }}>합계</Grid>
                    <Grid item xs={2} sx={{ p: 0.5, textAlign: 'right', fontSize: '11px', fontWeight: 'bold' }}>{formatNumber(totalAmount)}</Grid>
                </Grid>

                <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666' }}>
                    <Box>※ 본 거래명세표는 {type === 'receiver' ? '공급받는자' : '공급자'} 보관용입니다.</Box>
                    <Box>{data.order_no || ''}</Box>
                </Box>
            </Box>
        );
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '1200px', maxHeight: '95vh', bgcolor: 'background.paper', boxShadow: 24, borderRadius: 2, display: 'flex', flexDirection: 'column'
            }}>
                <Box sx={{ p: 2, bgcolor: '#1a237e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>거래명세표 발행 (고해상도 Parallel 레이아웃)</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant="contained" color="success" startIcon={<Download />} onClick={handleDownloadPDF} size="small">
                            PDF 다운로드
                        </Button>
                        <IconButton onClick={onClose} sx={{ color: '#fff' }}><X size={20} /></IconButton>
                    </Box>
                </Box>

                <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3, bgcolor: '#f0f2f5' }}>
                    <Box ref={printRef} sx={{
                        width: 'auto',
                        minWidth: '1000px',
                        display: 'flex',
                        gap: 2,
                        p: 4,
                        backgroundColor: '#fff',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <Box sx={{ flex: 1, height: '700px' }}>
                            <StatementForm type="receiver" color="blue" />
                        </Box>
                        <Box sx={{ flex: 1, height: '700px' }}>
                            <StatementForm type="supplier" color="red" />
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ p: 2, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 1, bgcolor: '#fafafa' }}>
                    <Button variant="outlined" startIcon={<Save />} onClick={() => onSave({ items, supplierInfo, note })}>발행 설정 저장</Button>
                    <Button variant="contained" color="primary" onClick={onClose}>인쇄 완료/닫기</Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default TransactionStatementModal;
