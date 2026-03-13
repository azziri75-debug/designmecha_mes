import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Modal, Box, Typography, Button, IconButton,
    Grid, CircularProgress, Alert
} from '@mui/material';
import { X, Printer, Save, CheckCircle2 } from 'lucide-react';
import { formatNumber, toKoreanCurrency } from '../lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';

const TransactionStatementModal = ({ open, onClose, data }) => {
    if (!data) return null;

    const [items, setItems] = useState(data.items || []);
    const [supplierInfo, setSupplierInfo] = useState(data.supplier_info || {
        biz_no: '312-81-38446',
        company_name: '(주)디자인메카',
        owner_name: '조인호',
        address: '충남 아산시 음봉면 월암로 336-35',
        biz_type: '제조업',
        biz_item: '나이프,베어링'
    });

    // UI Local State for Footer (Pre-filled from data or defaults)
    const [footerInfo, setFooterInfo] = useState({
        prev_balance: data.prev_balance || 0,
        paid_amount: data.paid_amount || 0,
        receiver_name: data.receiver_name || ''
    });

    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const printRef = useRef();

    // Column Resizing Logic
    const [colWidths, setColWidths] = useState({
        date: 45,
        name: 180,
        spec: 120,
        qty: 50,
        price: 80,
        supply: 100,
        tax: 80
    });

    const resizingCol = useRef(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const onMouseDown = (col, e) => {
        resizingCol.current = col;
        startX.current = e.pageX;
        startWidth.current = colWidths[col];
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = useCallback((e) => {
        if (!resizingCol.current) return;
        const diff = e.pageX - startX.current;
        setColWidths(prev => ({
            ...prev,
            [resizingCol.current]: Math.max(30, startWidth.current + diff)
        }));
    }, []);

    const onMouseUp = useCallback(() => {
        resizingCol.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    // Calculate totals
    const totalSupplyValue = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalTax = Math.floor(totalSupplyValue * 0.1);
    const totalAmount = totalSupplyValue + totalTax;
    const currentBalance = (footerInfo.prev_balance + totalAmount) - footerInfo.paid_amount;

    const generatePDFBlob = async () => {
        const element = printRef.current;
        const canvas = await html2canvas(element, {
            scale: 3,
            useCORS: true,
            logging: false
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        return pdf.output('blob');
    };

    const handleSaveAndAttach = async (autoSilent = false) => {
        setIsSaving(true);
        try {
            const pdfBlob = await generatePDFBlob();
            const formData = new FormData();
            formData.append('file', pdfBlob, `Statement_${data.delivery_no || 'No'}.pdf`);

            // Upload the PDF as an attachment to the delivery history record
            await api.post(`/sales/delivery-histories/${data.id}/attach-statement`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setSaveStatus('success');
            if (!autoSilent && onSuccess) {
                setTimeout(() => onSuccess(), 1000);
            }
        } catch (error) {
            console.error('Failed to save statement:', error);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const handlePrint = () => {
        window.print();

        // Use a slight delay or onafterprint to trigger the confirmation
        const afterPrintHandler = () => {
            window.removeEventListener('afterprint', afterPrintHandler);
            if (window.confirm("인쇄를 완료하셨습니까? 생성된 명세서를 납품 내역에 자동으로 첨부하시겠습니까?")) {
                handleSaveAndAttach(true);
            }
        };
        window.addEventListener('afterprint', afterPrintHandler);

        // Fallback for some browsers that don't support afterprint well
        setTimeout(() => {
            window.removeEventListener('afterprint', afterPrintHandler);
        }, 3000);
    };

    const StatementForm = ({ color }) => {
        const pColor = color === 'blue' ? '#003AC1' : '#E50000';
        const rowsCount = 13; // Match image rows
        const emptyRows = Array(Math.max(0, rowsCount - items.length)).fill(null);

        return (
            <Box sx={{
                width: '100%',
                border: `1.5px solid ${pColor}`,
                p: '4px',
                bgcolor: '#fff',
                position: 'relative',
                '& *': { color: pColor, borderColor: pColor, fontFamily: '"Malgun Gothic", sans-serif' }
            }}>
                {/* Top Section: No and Date */}
                <Box sx={{ display: 'flex', mb: 0.5 }}>
                    <Box sx={{ width: '180px' }}>
                        <Box sx={{ display: 'flex', border: '1px solid', height: '24px', alignItems: 'center' }}>
                            <Typography sx={{ width: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', fontStyle: 'italic' }}>No.</Typography>
                            <Typography sx={{ flexGrow: 1, pl: 1, fontSize: '12px', fontWeight: 'bold' }}>{data.delivery_no?.slice(-6) || '000000'}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', border: '1px solid', borderTop: 'none', height: '24px', alignItems: 'center' }}>
                            <Typography sx={{ width: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>일자 :</Typography>
                            <Typography sx={{ flexGrow: 1, pl: 1, fontSize: '12px', fontWeight: 'bold' }}>{data.delivery_date || ''}</Typography>
                        </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography sx={{ fontSize: '28px', fontWeight: '900', letterSpacing: 10, borderBottom: '3px double', lineHeight: 1, pb: 0.5 }}>거래명세표</Typography>
                    </Box>

                    {/* Supplier Info Grid */}
                    <Box sx={{ width: '280px', border: '1.5px solid' }}>
                        <Box sx={{ display: 'flex' }}>
                            <Box sx={{ width: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', borderRight: '1px solid', lineHeight: 1.1 }}>공급자</Box>
                            <Box sx={{ flexGrow: 1 }}>
                                <Grid container>
                                    <Grid item xs={3} sx={{ borderBottom: '1px solid', borderRight: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '22px', lineHeight: 1.1, textAlign: 'center' }}>등록번호</Grid>
                                    <Grid item xs={9} sx={{ borderBottom: '1px solid', fontSize: '14px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 1 }}>{supplierInfo.biz_no}</Grid>

                                    <Grid item xs={3} sx={{ borderBottom: '1px solid', borderRight: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px' }}>상호</Grid>
                                    <Grid item xs={5} sx={{ borderBottom: '1px solid', borderRight: '1px solid', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', pl: 0.5 }}>{supplierInfo.company_name}</Grid>
                                    <Grid item xs={1.5} sx={{ borderBottom: '1px solid', borderRight: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>성명</Grid>
                                    <Grid item xs={2.5} sx={{ borderBottom: '1px solid', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '36px' }}>
                                        {supplierInfo.owner_name}
                                        {/* Company Seal / 직인 */}
                                        <Box sx={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40 }}>
                                            {data.company_seal ? (
                                                <img src={data.company_seal} alt="직인" style={{ width: 40, height: 40, opacity: 0.65, objectFit: 'contain' }} />
                                            ) : (
                                                <Box sx={{
                                                    width: 38, height: 38,
                                                    border: '2px solid #E50000',
                                                    borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#E50000', fontSize: '10px', fontWeight: '900',
                                                    opacity: 0.7,
                                                    background: 'rgba(229,0,0,0.05)'
                                                }}>직인</Box>
                                            )}
                                        </Box>
                                    </Grid>

                                    <Grid item xs={3} sx={{ borderBottom: '1px solid', borderRight: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px', lineHeight: 1, textAlign: 'center' }}>사업장주소</Grid>
                                    <Grid item xs={9} sx={{ borderBottom: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', pl: 0.5 }}>{supplierInfo.address}</Grid>

                                    <Grid item xs={3} sx={{ borderRight: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px' }}>업태</Grid>
                                    <Grid item xs={4} sx={{ borderRight: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', pl: 0.5 }}>{supplierInfo.biz_type}</Grid>
                                    <Grid item xs={1.5} sx={{ borderRight: '1px solid', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>종목</Grid>
                                    <Grid item xs={3.5} sx={{ fontSize: '9px', display: 'flex', alignItems: 'center', pl: 0.5 }}>{supplierInfo.biz_item}</Grid>
                                </Grid>
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* Receiver Info */}
                <Box sx={{ display: 'flex', alignItems: 'flex-end', mb: 0.5, px: 1 }}>
                    <Typography sx={{ fontSize: '18px', fontWeight: '900', borderBottom: '1px solid', minWidth: '150px', textAlign: 'center', mr: 1 }}>{data.partner?.name || ''}</Typography>
                    <Typography sx={{ fontSize: '16px', fontWeight: '900' }}>귀하</Typography>
                </Box>

                {/* Total Summary Line */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, borderTop: '2px solid', pt: 0.5 }}>
                    <Typography sx={{ fontSize: '15px', fontWeight: '900', mr: 2 }}>총계</Typography>
                    <Typography sx={{ flexGrow: 1, fontSize: '13px', fontWeight: 'bold' }}>{toKoreanCurrency(totalAmount)} (￦{formatNumber(totalAmount)})</Typography>
                    <Typography sx={{ fontSize: '9px', fontWeight: 'bold' }}>(전잔금+금기)</Typography>
                </Box>

                {/* Main Table */}
                <Box sx={{ border: '1.5px solid', borderBottom: 'none' }}>
                    <Box sx={{ display: 'flex', borderBottom: '1px solid', bgcolor: '#f8f8f8', height: '28px', '& > div': { borderRight: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '900', position: 'relative' } }}>
                        <div style={{ width: colWidths.date }}>월/일</div>
                        <div style={{ width: colWidths.name }}>내 역
                            <Box onMouseDown={(e) => onMouseDown('name', e)} sx={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }} />
                        </div>
                        <div style={{ width: colWidths.spec }}>규 격
                            <Box onMouseDown={(e) => onMouseDown('spec', e)} sx={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }} />
                        </div>
                        <div style={{ width: colWidths.qty }}>수량</div>
                        <div style={{ width: colWidths.price }}>단 가</div>
                        <div style={{ width: colWidths.supply }}>공급가액</div>
                        <div style={{ width: colWidths.tax, borderRight: 'none' }}>세 액</div>
                    </Box>

                    <Box sx={{ minHeight: '320px' }}>
                        {items.map((item, idx) => (
                            <Box key={idx} sx={{ display: 'flex', borderBottom: '1px dotted', height: '24px', '& > div': { borderRight: '1px solid', display: 'flex', alignItems: 'center', fontSize: '10px', px: 0.5 } }}>
                                <div style={{ width: colWidths.date, justifyContent: 'center' }}>{item.date?.slice(5) || ''}</div>
                                <div style={{ width: colWidths.name, fontWeight: 'bold' }}>{item.product?.name || item.item_name}</div>
                                <div style={{ width: colWidths.spec, justifyContent: 'center' }}>{item.product?.spec || ''}</div>
                                <div style={{ width: colWidths.qty, justifyContent: 'center' }}>{formatNumber(item.quantity)}</div>
                                <div style={{ width: colWidths.price, justifyContent: 'flex-end' }}>{formatNumber(item.unit_price)}</div>
                                <div style={{ width: colWidths.supply, justifyContent: 'flex-end', fontWeight: 'bold' }}>{formatNumber(item.quantity * item.unit_price)}</div>
                                <div style={{ width: colWidths.tax, borderRight: 'none', justifyContent: 'flex-end' }}>{formatNumber(Math.floor(item.quantity * item.unit_price * 0.1))}</div>
                            </Box>
                        ))}
                        {items.length < rowsCount && (
                            <Box sx={{ display: 'flex', borderBottom: '1px dotted', height: '24px', '& > div': { borderRight: '1px solid', borderRightColor: 'transparent' } }}>
                                <div style={{ width: colWidths.date }} />
                                <div style={{ width: colWidths.name, display: 'flex', alignItems: 'center', px: 4, fontSize: '10px', color: '#666' }}>= 이하여백 =</div>
                            </Box>
                        )}
                        {emptyRows.slice(1).map((_, idx) => (
                            <Box key={`e-${idx}`} sx={{ borderBottom: '1px dotted', height: '24px' }} />
                        ))}
                    </Box>
                </Box>

                {/* Footer Gird */}
                <Box sx={{ border: '1.50px solid' }}>
                    <Box sx={{ display: 'flex', height: '24px' }}>
                        <Box sx={{ width: '60px', borderRight: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>전잔금</Box>
                        <Box sx={{ flexGrow: 1, borderRight: '1px solid', display: 'flex', alignItems: 'center', px: 1, fontSize: '11px' }}>
                            <input
                                value={formatNumber(footerInfo.prev_balance)}
                                onChange={(e) => setFooterInfo(p => ({ ...p, prev_balance: Number(e.target.value.replace(/,/g, '')) || 0 }))}
                                style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: pColor }}
                            />
                        </Box>
                        <Box sx={{ width: '60px', borderRight: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>합계</Box>
                        <Box sx={{ width: '200px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 1, fontSize: '12px', fontWeight: '900' }}>
                            ￦{formatNumber(totalAmount)}
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', height: '24px', borderTop: '1px solid' }}>
                        <Box sx={{ width: '60px', borderRight: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>입금</Box>
                        <Box sx={{ flexGrow: 1, borderRight: '1px solid', display: 'flex', alignItems: 'center', px: 1, fontSize: '11px' }}>
                            <input
                                value={formatNumber(footerInfo.paid_amount)}
                                onChange={(e) => setFooterInfo(p => ({ ...p, paid_amount: Number(e.target.value.replace(/,/g, '')) || 0 }))}
                                style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: pColor }}
                            />
                        </Box>
                        <Box sx={{ width: '60px', borderRight: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>잔금</Box>
                        <Box sx={{ flexGrow: 1, borderRight: '1px solid', display: 'flex', alignItems: 'center', px: 1, fontSize: '12px', fontWeight: '900', justifyContent: 'flex-end' }}>
                            ￦{formatNumber(currentBalance)}
                        </Box>
                        <Box sx={{ width: '60px', borderRight: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>인수자</Box>
                        <Box sx={{ width: '120px', display: 'flex', alignItems: 'center', px: 1, fontSize: '11px', justifyContent: 'space-between' }}>
                            <input
                                value={footerInfo.receiver_name}
                                onChange={(e) => setFooterInfo(p => ({ ...p, receiver_name: e.target.value }))}
                                placeholder="성함"
                                style={{ border: 'none', width: '80px', outline: 'none', color: pColor, fontSize: '11px' }}
                            />
                            <Typography sx={{ fontSize: '10px', fontWeight: 'bold' }}>(인)</Typography>
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
                    <Typography sx={{ fontSize: '11px', fontWeight: '900' }}>상기와 같이 계산합니다. 감사합니다.</Typography>
                </Box>
            </Box>
        );
    };

    return (
        <Modal open={open} onClose={onClose} sx={{ '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.8)' } }}>
            <Box sx={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '1280px', maxHeight: '98vh', bgcolor: '#fff', boxShadow: 24, borderRadius: 1.5, display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}>
                {/* Header (Non-printable) */}
                <Box sx={{ p: 1.5, bgcolor: '#334155', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', '@media print': { display: 'none' } }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center' }}>
                        <Printer size={18} style={{ marginRight: 8 }} /> 거래명세서 출력 및 관리
                    </Typography>
                    <IconButton onClick={onClose} sx={{ color: '#fff' }}><X size={20} /></IconButton>
                </Box>

                {/* Main Content Area */}
                <Box sx={{
                    flexGrow: 1, overflowY: 'auto', p: 4, bgcolor: '#f1f5f9',
                    '@media print': { p: 0, bgcolor: '#fff', overflow: 'visible' }
                }}>
                    {saveStatus === 'success' && <Alert severity="success" icon={<CheckCircle2 />} sx={{ mb: 2, borderRadius: 2 }}>실적에 명세서가 정상적으로 첨부되었습니다.</Alert>}

                    <Box ref={printRef} sx={{
                        width: '100%',
                        display: 'flex',
                        gap: '20px',
                        padding: '10px',
                        backgroundColor: '#fff',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        '@media print': { boxShadow: 'none', p: 0, gap: '10px' }
                    }}>
                        <Box sx={{ flex: 1 }}><StatementForm color="blue" /></Box>
                        <Box sx={{ flex: 1 }}><StatementForm color="red" /></Box>
                    </Box>
                </Box>

                {/* Footer Buttons (Non-printable) */}
                <Box sx={{ p: 2, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: 2, bgcolor: '#f8fafc', '@media print': { display: 'none' } }}>
                    <Button
                        variant="contained"
                        size="large"
                        startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <Save />}
                        onClick={() => handleSaveAndAttach()}
                        disabled={isSaving}
                        sx={{ bgcolor: '#0f172a', fontWeight: 'bold', px: 4, borderRadius: 2 }}
                    >
                        저장및첨부
                    </Button>
                    <Button
                        variant="contained"
                        size="large"
                        startIcon={<Printer />}
                        onClick={handlePrint}
                        sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 4, borderRadius: 2 }}
                    >
                        인쇄
                    </Button>
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={onClose}
                        sx={{ borderColor: '#e2e8f0', color: '#64748b', fontWeight: 'bold', px: 4, borderRadius: 2 }}
                    >
                        취소
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default TransactionStatementModal;
