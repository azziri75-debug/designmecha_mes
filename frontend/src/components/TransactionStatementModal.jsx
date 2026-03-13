import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Modal, Box, Typography, Button, IconButton,
    CircularProgress, Alert
} from '@mui/material';
import { X, Printer, Save, CheckCircle2 } from 'lucide-react';
import { formatNumber, toKoreanCurrency } from '../lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';

// A4 Landscape 인쇄용 CSS - .print-container 기반 완전 교체
const PRINT_STYLE_ID = 'tsm-print-style';
const injectPrintCSS = () => {
    if (document.getElementById(PRINT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    style.innerHTML = `
        @media print {
            @page { size: A4 landscape; margin: 0; }
            body * { visibility: hidden !important; }
            .tsm-print-container,
            .tsm-print-container * { visibility: visible !important; }
            .tsm-print-container {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 297mm !important;
                height: 210mm !important;
                display: flex !important;
                flex-direction: row !important;
                gap: 8mm !important;
                padding: 6mm !important;
                background: #fff !important;
                box-shadow: none !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
            }
            .tsm-print-container > * { flex: 1 !important; }
            .tsm-no-print { display: none !important; }
        }
    `;
    document.head.appendChild(style);
};
const removePrintCSS = () => {
    const el = document.getElementById(PRINT_STYLE_ID);
    if (el) el.remove();
};

// 도장(직인) SVG - 인라인 Data URI로 외부 의존성 없이 항상 표시
const SEAL_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#c00" stroke-width="5"/><circle cx="50" cy="50" r="38" fill="none" stroke="#c00" stroke-width="1.5"/><text x="50" y="38" text-anchor="middle" font-size="11" fill="#c00" font-family="Malgun Gothic,serif" font-weight="bold">(주)디자인메카</text><text x="50" y="55" text-anchor="middle" font-size="13" fill="#c00" font-family="Malgun Gothic,serif" font-weight="900">인</text><text x="50" y="70" text-anchor="middle" font-size="9" fill="#c00" font-family="Malgun Gothic,serif">대표이사</text></svg>`)}`;

const TransactionStatementModal = ({ open, onClose, data, onSuccess }) => {
    if (!data) return null;

    const [items] = useState(data.items || []);
    const [supplierInfo] = useState(data.supplier_info || {
        biz_no: '312-81-38446',
        company_name: '(주)디자인메카',
        owner_name: '조인호',
        address: '충남 아산시 음봉면 월암로 336-35',
        biz_type: '제조업',
        biz_item: '나이프,베어링'
    });

    const [footerInfo, setFooterInfo] = useState({
        prev_balance: data.prev_balance || 0,
        paid_amount: data.paid_amount || 0,
        receiver_name: data.receiver_name || ''
    });

    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const printRef = useRef();

    // Inject/remove A4 landscape print CSS when modal is open
    useEffect(() => {
        if (open) injectPrintCSS();
        return () => removePrintCSS();
    }, [open]);

    // Column Resizing
    const [colWidths, setColWidths] = useState({ date: 40, name: 160, spec: 100, qty: 45, price: 80, supply: 95, tax: 75 });
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
        setColWidths(prev => ({ ...prev, [resizingCol.current]: Math.max(25, startWidth.current + (e.pageX - startX.current)) }));
    }, []);
    const onMouseUp = useCallback(() => {
        resizingCol.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    const totalSupplyValue = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalTax = Math.floor(totalSupplyValue * 0.1);
    const totalAmount = totalSupplyValue + totalTax;
    const currentBalance = (footerInfo.prev_balance + totalAmount) - footerInfo.paid_amount;

    const generatePDFBlob = async () => {
        const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, logging: false });
        const pdf = new jsPDF('l', 'mm', 'a4');
        const w = pdf.internal.pageSize.getWidth();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width);
        return pdf.output('blob');
    };

    const handleSaveAndAttach = async (silent = false) => {
        setIsSaving(true);
        try {
            const blob = await generatePDFBlob();
            const fd = new FormData();
            fd.append('file', blob, `Statement_${data.delivery_no || 'No'}.pdf`);
            await api.post(`/sales/delivery-histories/${data.id}/attach-statement`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            setSaveStatus('success');
            if (!silent && onSuccess) setTimeout(() => onSuccess(), 1000);
        } catch (err) {
            console.error('Failed to save statement:', err);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const handlePrint = () => {
        window.print();
        const after = () => {
            window.removeEventListener('afterprint', after);
            if (window.confirm('인쇄를 완료하셨습니까? 명세서를 납품 내역에 자동 첨부하시겠습니까?')) handleSaveAndAttach(true);
        };
        window.addEventListener('afterprint', after);
        setTimeout(() => window.removeEventListener('afterprint', after), 5000);
    };

    const ROW_H = '21px';
    const ROWS = 13;
    const emptyRows = Array(Math.max(0, ROWS - items.length)).fill(null);

    const StatementForm = ({ color }) => {
        const pColor = color === 'blue' ? '#003AC1' : '#C10000';

        return (
            <Box sx={{
                width: '100%', border: `1.5px solid ${pColor}`, bgcolor: '#fff', p: '3px',
                '& *': { color: pColor, borderColor: pColor, fontFamily: '"Malgun Gothic", "맑은 고딕", sans-serif' }
            }}>
                {/* TOP HEADER */}
                <Box sx={{ display: 'flex', mb: '2px', alignItems: 'flex-start' }}>
                    {/* Left column: No, Date, Title */}
                    <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', height: '20px', border: `1px solid ${pColor}`, mb: '-1px' }}>
                            <Box sx={{ width: '32px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold', fontStyle: 'italic' }}>No.</Box>
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', px: 1, fontSize: '11px', fontWeight: 'bold' }}>{data.delivery_no?.slice(-6) || '000000'}</Box>
                        </Box>
                        <Box sx={{ display: 'flex', height: '20px', border: `1px solid ${pColor}`, mb: '4px' }}>
                            <Box sx={{ width: '32px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>일자</Box>
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', px: 1, fontSize: '10px' }}>{data.delivery_date || ''}</Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: '6px' }}>
                            <Typography sx={{ fontSize: '26px', fontWeight: '900', letterSpacing: 6, borderBottom: `2.5px double ${pColor}`, lineHeight: 1.1, pb: '2px' }}>거래명세표</Typography>
                        </Box>
                    </Box>

                    {/* Right column: 공급자 block */}
                    <Box sx={{ width: '295px', border: `1.5px solid ${pColor}`, ml: '6px' }}>
                        <Box sx={{ display: 'flex' }}>
                            {/* Vertical 공급자 label */}
                            <Box sx={{
                                width: '16px', writingMode: 'vertical-rl', textOrientation: 'upright', letterSpacing: 2,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRight: `1px solid ${pColor}`, fontSize: '9px', fontWeight: 'bold', py: '4px'
                            }}>공급자</Box>
                            <Box sx={{ flex: 1 }}>
                                {/* Reg No */}
                                <Box sx={{ display: 'flex', height: '20px', borderBottom: `1px solid ${pColor}`, alignItems: 'center' }}>
                                    <Box sx={{ width: '42px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', height: '100%', textAlign: 'center', lineHeight: 1 }}>등록번호</Box>
                                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '900', letterSpacing: 1 }}>{supplierInfo.biz_no}</Box>
                                </Box>
                                {/* 상호 + 성명 */}
                                <Box sx={{ display: 'flex', height: '22px', borderBottom: `1px solid ${pColor}`, alignItems: 'center' }}>
                                    <Box sx={{ width: '22px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8.5px', height: '100%' }}>상호</Box>
                                    <Box sx={{ flex: 1, borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', px: '3px', fontSize: '9.5px', fontWeight: 'bold', height: '100%' }}>{supplierInfo.company_name}</Box>
                                    <Box sx={{ width: '22px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8.5px', height: '100%' }}>성명</Box>
                                    {/* Owner + Seal */}
                                    <Box sx={{ width: '75px', display: 'flex', alignItems: 'center', px: '3px', fontSize: '9.5px', fontWeight: 'bold', position: 'relative', height: '100%', overflow: 'visible' }}>
                                        {supplierInfo.owner_name}
                                        {/* 직인 이미지 오버레이 - SVG 도장 */}
                                        <img
                                            src={data.company_seal || SEAL_DATA_URI}
                                            alt="직인"
                                            style={{
                                                position: 'absolute',
                                                right: -4,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: 44,
                                                height: 44,
                                                opacity: 0.82,
                                                objectFit: 'contain',
                                                mixBlendMode: 'multiply',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                    </Box>
                                </Box>
                                {/* Address */}
                                <Box sx={{ display: 'flex', height: '20px', borderBottom: `1px solid ${pColor}`, alignItems: 'center' }}>
                                    <Box sx={{ width: '42px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', textAlign: 'center', lineHeight: 1.1, height: '100%' }}>사업장주소</Box>
                                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', px: '3px', fontSize: '8.5px', height: '100%' }}>{supplierInfo.address}</Box>
                                </Box>
                                {/* 업태 + 종목 */}
                                <Box sx={{ display: 'flex', height: '20px', alignItems: 'center' }}>
                                    <Box sx={{ width: '22px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8.5px', height: '100%' }}>업태</Box>
                                    <Box sx={{ flex: 1, borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', px: '3px', fontSize: '8.5px', height: '100%' }}>{supplierInfo.biz_type}</Box>
                                    <Box sx={{ width: '22px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8.5px', height: '100%' }}>종목</Box>
                                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', px: '3px', fontSize: '8.5px', height: '100%' }}>{supplierInfo.biz_item}</Box>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* 귀하 */}
                <Box sx={{ display: 'flex', alignItems: 'flex-end', mb: '3px', px: 0.5 }}>
                    <Typography sx={{ fontSize: '20px', fontWeight: '900', borderBottom: `1px solid ${pColor}`, minWidth: '140px', textAlign: 'center', mr: 1 }}>{data.partner?.name || ''}</Typography>
                    <Typography sx={{ fontSize: '18px', fontWeight: '900' }}>귀하</Typography>
                </Box>

                {/* Total line */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: '2px', borderTop: `2px solid ${pColor}`, pt: '2px' }}>
                    <Typography sx={{ fontSize: '13px', fontWeight: '900', mr: 1 }}>합계</Typography>
                    <Typography sx={{ flex: 1, fontSize: '12px', fontWeight: 'bold' }}>{toKoreanCurrency(totalAmount)} (￦{formatNumber(totalAmount)})</Typography>
                    <Typography sx={{ fontSize: '8px', fontWeight: 'bold' }}>(전잔금+금기)</Typography>
                </Box>

                {/* Main table */}
                <Box sx={{ border: `1.5px solid ${pColor}`, borderBottom: 'none' }}>
                    <Box sx={{ display: 'flex', height: '22px', borderBottom: `1px solid ${pColor}`, bgcolor: '#f5f5f5', '& > div': { borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9.5px', fontWeight: '900', position: 'relative' } }}>
                        <div style={{ width: colWidths.date }}>월/일</div>
                        <div style={{ width: colWidths.name }}>내&nbsp;&nbsp;&nbsp;역<Box onMouseDown={e => onMouseDown('name', e)} sx={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }} /></div>
                        <div style={{ width: colWidths.spec }}>규&nbsp;&nbsp;격<Box onMouseDown={e => onMouseDown('spec', e)} sx={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }} /></div>
                        <div style={{ width: colWidths.qty }}>수량</div>
                        <div style={{ width: colWidths.price }}>단&nbsp;&nbsp;가</div>
                        <div style={{ width: colWidths.supply }}>공급가액</div>
                        <div style={{ width: colWidths.tax, borderRight: 'none' }}>세&nbsp;&nbsp;액</div>
                    </Box>
                    <Box sx={{ minHeight: '280px' }}>
                        {items.map((item, idx) => (
                            <Box key={idx} sx={{ display: 'flex', height: ROW_H, borderBottom: `1px dotted ${pColor}`, '& > div': { borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', fontSize: '9px', px: '3px' } }}>
                                <div style={{ width: colWidths.date, justifyContent: 'center' }}>{(item.date || '').slice(5)}</div>
                                <div style={{ width: colWidths.name, fontWeight: 'bold' }}>{item.product?.name || item.item_name || ''}</div>
                                <div style={{ width: colWidths.spec, justifyContent: 'center' }}>{item.product?.spec || ''}</div>
                                <div style={{ width: colWidths.qty, justifyContent: 'center' }}>{formatNumber(item.quantity)}</div>
                                <div style={{ width: colWidths.price, justifyContent: 'flex-end' }}>{formatNumber(item.unit_price)}</div>
                                <div style={{ width: colWidths.supply, justifyContent: 'flex-end', fontWeight: 'bold' }}>{formatNumber(item.quantity * item.unit_price)}</div>
                                <div style={{ width: colWidths.tax, borderRight: 'none', justifyContent: 'flex-end' }}>{formatNumber(Math.floor(item.quantity * item.unit_price * 0.1))}</div>
                            </Box>
                        ))}
                        {items.length < ROWS && (
                            <Box sx={{ display: 'flex', height: ROW_H, borderBottom: `1px dotted ${pColor}` }}>
                                <Box sx={{ width: colWidths.date, borderRight: `1px solid ${pColor}` }} />
                                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', px: '6px', fontSize: '9px', color: '#aaa' }}>= 이하여백 =</Box>
                            </Box>
                        )}
                        {emptyRows.slice(1).map((_, i) => (
                            <Box key={i} sx={{ height: ROW_H, borderBottom: `1px dotted ${pColor}` }} />
                        ))}
                    </Box>
                </Box>

                {/* Footer */}
                <Box sx={{ border: `1.5px solid ${pColor}`, borderTop: 'none' }}>
                    <Box sx={{ display: 'flex', height: '22px', borderBottom: `1px solid ${pColor}` }}>
                        <Box sx={{ width: '50px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>전잔금</Box>
                        <Box sx={{ flex: 1, borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', px: 1 }}>
                            <input value={formatNumber(footerInfo.prev_balance)} onChange={e => setFooterInfo(p => ({ ...p, prev_balance: Number(e.target.value.replace(/,/g, '')) || 0 }))} style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: pColor, fontSize: '10px' }} />
                        </Box>
                        <Box sx={{ width: '42px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>합계</Box>
                        <Box sx={{ width: '150px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 1, fontSize: '11px', fontWeight: '900' }}>￦{formatNumber(totalAmount)}</Box>
                    </Box>
                    <Box sx={{ display: 'flex', height: '22px' }}>
                        <Box sx={{ width: '50px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>입금</Box>
                        <Box sx={{ flex: 1, borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', px: 1 }}>
                            <input value={formatNumber(footerInfo.paid_amount)} onChange={e => setFooterInfo(p => ({ ...p, paid_amount: Number(e.target.value.replace(/,/g, '')) || 0 }))} style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: pColor, fontSize: '10px' }} />
                        </Box>
                        <Box sx={{ width: '42px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>잔금</Box>
                        <Box sx={{ width: '90px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 1, fontSize: '11px', fontWeight: '900' }}>￦{formatNumber(currentBalance)}</Box>
                        <Box sx={{ width: '38px', borderRight: `1px solid ${pColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold' }}>인수자</Box>
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', px: 1, justifyContent: 'space-between' }}>
                            <input value={footerInfo.receiver_name} onChange={e => setFooterInfo(p => ({ ...p, receiver_name: e.target.value }))} placeholder="성함" style={{ border: 'none', width: '80px', outline: 'none', color: pColor, fontSize: '10px' }} />
                            <Typography sx={{ fontSize: '10px', fontWeight: 'bold' }}>(인)</Typography>
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'center', py: '3px', borderTop: `1px solid ${pColor}` }}>
                    <Typography sx={{ fontSize: '10px', fontWeight: '900' }}>상기와 같이 계산합니다. 감사합니다.</Typography>
                </Box>
            </Box>
        );
    };

    return (
        <Modal open={open} onClose={onClose} sx={{ '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.88)' } }}>
            {/* 모달 전체 컨테이너: 세로 중앙 정렬, 화면 높이 안에서 스크롤 가능 */}
            <Box sx={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                maxHeight: '98vh', display: 'flex', flexDirection: 'column',
                bgcolor: '#fff', boxShadow: 24, borderRadius: 1.5, overflow: 'hidden',
                // A4 landscape 고정 너비
                width: '315mm',
            }}>
                {/* 상단 헤더 - 인쇄시 숨김 */}
                <Box className="tsm-no-print" sx={{ p: 1.5, bgcolor: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Printer size={18} /> 거래명세서 출력 및 관리
                    </Typography>
                    <IconButton onClick={onClose} sx={{ color: '#fff' }}><X size={20} /></IconButton>
                </Box>

                {/* 본문 스크롤 영역 */}
                <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2, bgcolor: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {saveStatus === 'success' && <Alert severity="success" icon={<CheckCircle2 />} sx={{ mb: 2, borderRadius: 2, width: '100%' }}>✅ 명세서가 정상적으로 첨부되었습니다.</Alert>}
                    {saveStatus === 'error' && <Alert severity="error" sx={{ mb: 2, borderRadius: 2, width: '100%' }}>저장에 실패했습니다. 다시 시도해 주세요.</Alert>}

                    {/* A4 고정 크기 인쇄 영역 */}
                    <Box
                        ref={printRef}
                        className="tsm-print-container"
                        sx={{
                            // 화면에서 A4 landscape 비율로 고정
                            width: '297mm',
                            minHeight: '210mm',
                            display: 'flex',
                            flexDirection: 'row',
                            gap: '8mm',
                            padding: '6mm',
                            backgroundColor: '#fff',
                            boxSizing: 'border-box',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                            flexShrink: 0,
                        }}
                    >
                        <Box sx={{ flex: 1 }}><StatementForm color="blue" /></Box>
                        <Box sx={{ flex: 1 }}><StatementForm color="red" /></Box>
                    </Box>
                </Box>

                {/* 하단 버튼 - 인쇄시 숨김 */}
                <Box className="tsm-no-print" sx={{ p: 2, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: 2, bgcolor: '#f8fafc', flexShrink: 0 }}>
                    <Button variant="contained" size="large" startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <Save />} onClick={() => handleSaveAndAttach(false)} disabled={isSaving} sx={{ bgcolor: '#0f172a', fontWeight: 'bold', px: 4, borderRadius: 2 }}>저장 및 첨부</Button>
                    <Button variant="contained" size="large" startIcon={<Printer />} onClick={handlePrint} sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 4, borderRadius: 2 }}>인쇄</Button>
                    <Button variant="outlined" size="large" onClick={onClose} sx={{ borderColor: '#e2e8f0', color: '#64748b', fontWeight: 'bold', px: 4, borderRadius: 2 }}>닫기</Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default TransactionStatementModal;
