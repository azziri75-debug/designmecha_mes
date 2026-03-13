import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Modal, Box, Button, IconButton,
    CircularProgress, Alert
} from '@mui/material';
import { X, Printer, Save, CheckCircle2 } from 'lucide-react';
import { formatNumber, toKoreanCurrency } from '../lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';

// ────────────────────────────────────────────
// A4 Landscape 전용 인쇄 CSS
// ────────────────────────────────────────────
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
                left: 0 !important; top: 0 !important;
                width: 297mm !important; height: 210mm !important;
                transform: none !important;
                display: flex !important; flex-direction: row !important;
                gap: 5mm !important; padding: 4mm !important;
                background: #fff !important; box-shadow: none !important;
                overflow: hidden !important; box-sizing: border-box !important;
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

// ────────────────────────────────────────────
// 직인 SVG (인라인 Data URI — 외부 의존 없음)
// ────────────────────────────────────────────
const makeSealURI = (companyName = '(주)디자인메카') =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<circle cx="50" cy="50" r="46" fill="none" stroke="#c00" stroke-width="6"/>` +
        `<circle cx="50" cy="50" r="37" fill="none" stroke="#c00" stroke-width="1.5"/>` +
        `<text x="50" y="35" text-anchor="middle" font-size="10" fill="#c00" font-family="Malgun Gothic,serif" font-weight="bold">${companyName}</text>` +
        `<text x="50" y="54" text-anchor="middle" font-size="22" fill="#c00" font-family="Malgun Gothic,serif" font-weight="900">인</text>` +
        `<text x="50" y="70" text-anchor="middle" font-size="8.5" fill="#c00" font-family="Malgun Gothic,serif">대표이사</text>` +
        `</svg>`
    )}`;

// ────────────────────────────────────────────
// 공통 table CSS
// ────────────────────────────────────────────
const tblStyle = (c) => ({
    borderCollapse: 'collapse',
    width: '100%',
    fontFamily: '"Malgun Gothic","맑은 고딕",sans-serif',
    color: c,
    tableLayout: 'fixed',
});
const td = (c, extra = {}) => ({
    border: `0.7px solid ${c}`,
    padding: '1px 2px',
    fontSize: '8.5px',
    color: c,
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    ...extra,
});

// ════════════════════════════════════════════════════════════════
const TransactionStatementModal = ({ open, onClose, data, onSuccess }) => {
    if (!data) return null;

    const [items] = useState(data.items || []);
    const [supplierInfo] = useState(data.supplier_info || {
        biz_no: '312-81-38446',
        company_name: '(주)디자인메카',
        owner_name: '조인호',
        address: '충남 아산시 음봉면 월암로 336-35',
        biz_type: '제조업',
        biz_item: '나이프,베어링',
    });
    const [footerInfo, setFooterInfo] = useState({
        prev_balance: data.prev_balance || 0,
        paid_amount: data.paid_amount || 0,
        receiver_name: data.receiver_name || '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const printRef = useRef();

    useEffect(() => {
        if (open) injectPrintCSS();
        return () => removePrintCSS();
    }, [open]);

    // ── 계산 ──────────────────────────────────
    const totalSupply = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const totalTax = Math.floor(totalSupply * 0.1);
    const totalAmount = totalSupply + totalTax;
    const balance = (footerInfo.prev_balance + totalAmount) - footerInfo.paid_amount;

    const ROWS = 13;
    const filledRows = items.length;
    const emptyCount = Math.max(0, ROWS - filledRows);

    // ── PDF / 저장 ────────────────────────────
    const generatePDFBlob = async () => {
        const cvs = await html2canvas(printRef.current, { scale: 3, useCORS: true, logging: false });
        const pdf = new jsPDF('l', 'mm', 'a4');
        const w = pdf.internal.pageSize.getWidth();
        pdf.addImage(cvs.toDataURL('image/png'), 'PNG', 0, 0, w, (cvs.height * w) / cvs.width);
        return pdf.output('blob');
    };
    const handleSaveAndAttach = async (silent = false) => {
        setIsSaving(true);
        try {
            const blob = await generatePDFBlob();
            const fd = new FormData();
            fd.append('file', blob, `Statement_${data.delivery_no || 'No'}.pdf`);
            await api.post(`/sales/delivery-histories/${data.id}/attach-statement`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
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
            if (window.confirm('인쇄 완료 후 명세서를 납품 내역에 자동 첨부하시겠습니까?'))
                handleSaveAndAttach(true);
        };
        window.addEventListener('afterprint', after);
        setTimeout(() => window.removeEventListener('afterprint', after), 5000);
    };

    // ════════════════════════════════════════
    // 단일 양식 (blue / red)
    // ════════════════════════════════════════
    const StatementForm = ({ color }) => {
        const C = color === 'blue' ? '#003AC1' : '#C10000';
        const sealSrc = data.company_seal || makeSealURI(supplierInfo.company_name);

        const ROW_H = '17px';

        return (
            <div style={{
                border: `1.5px solid ${C}`,
                width: '100%', height: '100%',
                backgroundColor: '#fff',
                display: 'flex', flexDirection: 'column',
                fontFamily: '"Malgun Gothic","맑은 고딕",sans-serif',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}>
                {/* ── 상단: No/일자 + 거래명세표 타이틀 + 공급자 테이블 ── */}
                <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${C}` }}>

                    {/* 왼쪽: No, 일자, 거래명세표, 귀하 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {/* No 행 */}
                        <div style={{ display: 'flex', height: '17px', borderBottom: `0.7px solid ${C}` }}>
                            <div style={{ width: '28px', borderRight: `0.7px solid ${C}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 'bold', fontStyle: 'italic', color: C }}>No.</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '4px', fontSize: '9px', fontWeight: 'bold', color: C }}>{data.delivery_no?.slice(-6) || '000000'}</div>
                        </div>
                        {/* 일자 행 */}
                        <div style={{ display: 'flex', height: '17px', borderBottom: `0.7px solid ${C}` }}>
                            <div style={{ width: '28px', borderRight: `0.7px solid ${C}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 'bold', color: C }}>일자</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '4px', fontSize: '8.5px', color: C }}>{data.delivery_date || ''}</div>
                        </div>
                        {/* 거래명세표 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0 2px' }}>
                            <span style={{ fontSize: '22px', fontWeight: '900', letterSpacing: '4px', borderBottom: `2.5px double ${C}`, color: C, lineHeight: 1.1 }}>거래명세표</span>
                        </div>
                        {/* 귀하 */}
                        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '6px', paddingBottom: '4px', gap: '6px' }}>
                            <span style={{ fontSize: '15px', fontWeight: '900', color: C, borderBottom: `1px solid ${C}`, minWidth: '90px', textAlign: 'center' }}>{data.partner?.name || ''}</span>
                            <span style={{ fontSize: '14px', fontWeight: '900', color: C }}>귀하</span>
                        </div>
                    </div>

                    {/* 오른쪽: 공급자 정보 table */}
                    <div style={{ borderLeft: `1px solid ${C}` }}>
                        <table style={{ ...tblStyle(C), width: '220px' }}>
                            <colgroup>
                                {/* "공급자" 세로 레이블 */}
                                <col style={{ width: '14px' }} />
                                {/* 항목 레이블 */}
                                <col style={{ width: '36px' }} />
                                {/* 값 (왼쪽) */}
                                <col style={{ width: '90px' }} />
                                {/* 성명 레이블 */}
                                <col style={{ width: '22px' }} />
                                {/* 성명 + 도장 */}
                                <col style={{ width: '58px' }} />
                            </colgroup>
                            <tbody>
                                {/* 등록번호 행 */}
                                <tr>
                                    <td rowSpan={4} style={{ ...td(C), textAlign: 'center', padding: '0', writingMode: 'vertical-rl', textOrientation: 'upright', letterSpacing: '3px', fontSize: '9px', fontWeight: 'bold', width: '14px' }}>공급자</td>
                                    <td colSpan={1} style={{ ...td(C), textAlign: 'center', fontSize: '8px' }}>등록번호</td>
                                    <td colSpan={3} style={{ ...td(C), textAlign: 'center', fontSize: '11px', fontWeight: '900', letterSpacing: '1px' }}>{supplierInfo.biz_no}</td>
                                </tr>
                                {/* 상호 + 성명 행 */}
                                <tr>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '8px' }}>상호</td>
                                    <td style={{ ...td(C), fontWeight: 'bold', fontSize: '8.5px' }}>{supplierInfo.company_name}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '8px' }}>성명</td>
                                    <td style={{ ...td(C), fontSize: '8.5px', fontWeight: 'bold', position: 'relative', overflow: 'visible' }}>
                                        {supplierInfo.owner_name}
                                        {/* ★ 직인 이미지 — <img> 태그만 사용, CSS 동그라미 없음 */}
                                        <img
                                            src={sealSrc}
                                            alt="직인"
                                            style={{
                                                position: 'absolute',
                                                right: '-4px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '40px',
                                                height: '40px',
                                                opacity: 0.85,
                                                objectFit: 'contain',
                                                mixBlendMode: 'multiply',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                    </td>
                                </tr>
                                {/* 사업장주소 행 */}
                                <tr>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '7.5px', lineHeight: '1.1' }}>사업장주소</td>
                                    <td colSpan={3} style={{ ...td(C), fontSize: '7.5px' }}>{supplierInfo.address}</td>
                                </tr>
                                {/* 업태 + 종목 행 */}
                                <tr>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '8px' }}>업태</td>
                                    <td style={{ ...td(C), fontSize: '8px' }}>{supplierInfo.biz_type}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '8px' }}>종목</td>
                                    <td style={{ ...td(C), fontSize: '8px' }}>{supplierInfo.biz_item}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── 합계 행 ── */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px', borderBottom: `1px solid ${C}` }}>
                    <span style={{ fontSize: '11px', fontWeight: '900', color: C, marginRight: '6px' }}>합계</span>
                    <span style={{ flex: 1, fontSize: '10px', fontWeight: 'bold', color: C }}>{toKoreanCurrency(totalAmount)} (￦{formatNumber(totalAmount)})</span>
                    <span style={{ fontSize: '7.5px', color: C }}>(전잔금+금기)</span>
                </div>

                {/* ── 품목 테이블 ── */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <table style={{ ...tblStyle(C) }}>
                        <colgroup>
                            <col style={{ width: '32px' }} />
                            <col /> {/* 내역: 나머지 */}
                            <col style={{ width: '70px' }} />
                            <col style={{ width: '32px' }} />
                            <col style={{ width: '60px' }} />
                            <col style={{ width: '68px' }} />
                            <col style={{ width: '55px' }} />
                        </colgroup>
                        <thead>
                            <tr style={{ backgroundColor: 'rgba(0,0,0,0.03)', height: '18px' }}>
                                {['월/일', '내  역', '규  격', '수량', '단  가', '공급가액', '세  액'].map((h, i) => (
                                    <th key={i} style={{ ...td(C), textAlign: 'center', fontWeight: '900', fontSize: '8.5px', borderRight: i === 6 ? 'none' : `0.7px solid ${C}` }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ height: ROW_H }}>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '8px' }}>{(item.date || '').slice(5)}</td>
                                    <td style={{ ...td(C), fontWeight: 'bold', fontSize: '8px' }}>{item.product?.name || item.item_name || ''}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '7.5px' }}>{item.product?.spec || ''}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '8px' }}>{formatNumber(item.quantity)}</td>
                                    <td style={{ ...td(C), textAlign: 'right', fontSize: '8px' }}>{formatNumber(item.unit_price)}</td>
                                    <td style={{ ...td(C), textAlign: 'right', fontWeight: 'bold', fontSize: '8px' }}>{formatNumber(item.quantity * item.unit_price)}</td>
                                    <td style={{ ...td(C), textAlign: 'right', fontSize: '8px', borderRight: 'none' }}>{formatNumber(Math.floor(item.quantity * item.unit_price * 0.1))}</td>
                                </tr>
                            ))}
                            {/* 이하여백 행 */}
                            {emptyCount > 0 && (
                                <tr style={{ height: ROW_H }}>
                                    <td style={{ ...td(C), borderBottom: `0.7px dotted ${C}` }} />
                                    <td colSpan={6} style={{ ...td(C), color: '#bbb', fontSize: '8px', borderBottom: `0.7px dotted ${C}`, borderRight: 'none' }}>= 이하여백 =</td>
                                </tr>
                            )}
                            {Array(Math.max(0, emptyCount - 1)).fill(null).map((_, i) => (
                                <tr key={i} style={{ height: ROW_H }}>
                                    <td colSpan={7} style={{ borderBottom: `0.7px dotted ${C}`, borderLeft: `0.7px solid ${C}`, borderRight: `0.7px solid ${C}` }} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── 하단 Footer 테이블 ── */}
                <table style={{ ...tblStyle(C), borderTop: `1.5px solid ${C}` }}>
                    <colgroup>
                        <col style={{ width: '40px' }} />
                        <col />
                        <col style={{ width: '36px' }} />
                        <col style={{ width: '110px' }} />
                    </colgroup>
                    <tbody>
                        <tr style={{ height: '19px' }}>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '8.5px' }}>전잔금</td>
                            <td style={{ ...td(C) }}>
                                <input
                                    value={formatNumber(footerInfo.prev_balance)}
                                    onChange={e => setFooterInfo(p => ({ ...p, prev_balance: Number(e.target.value.replace(/,/g, '')) || 0 }))}
                                    style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: C, fontSize: '9px', background: 'transparent' }}
                                />
                            </td>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '8.5px' }}>합계</td>
                            <td style={{ ...td(C), textAlign: 'right', fontWeight: '900', fontSize: '10px', paddingRight: '4px', borderRight: 'none' }}>￦{formatNumber(totalAmount)}</td>
                        </tr>
                        <tr style={{ height: '19px' }}>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '8.5px' }}>입금</td>
                            <td style={{ ...td(C) }}>
                                <input
                                    value={formatNumber(footerInfo.paid_amount)}
                                    onChange={e => setFooterInfo(p => ({ ...p, paid_amount: Number(e.target.value.replace(/,/g, '')) || 0 }))}
                                    style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: C, fontSize: '9px', background: 'transparent' }}
                                />
                            </td>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '8.5px' }}>잔금</td>
                            <td style={{ ...td(C), textAlign: 'right', fontWeight: '900', fontSize: '10px', paddingRight: '4px', borderRight: 'none' }}>
                                ￦{formatNumber(balance)}
                                <span style={{ fontSize: '7px', marginLeft: '4px' }}>인수자&nbsp;&nbsp;<input value={footerInfo.receiver_name} onChange={e => setFooterInfo(p => ({ ...p, receiver_name: e.target.value }))} style={{ border: 'none', width: '40px', outline: 'none', color: C, fontSize: '8.5px', background: 'transparent' }} /></span>
                                <span style={{ fontSize: '9px', marginLeft: '4px' }}>(인)</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── 하단 감사 문구 ── */}
                <div style={{ textAlign: 'center', padding: '2px 0', borderTop: `0.7px solid ${C}`, fontSize: '8.5px', fontWeight: '900', color: C }}>
                    상기와 같이 계산합니다. 감사합니다.
                </div>
            </div>
        );
    };

    // ────────────────────────────────────────────────────────────
    // 화면 비율 = 뷰포트 너비를 기준으로 297mm 폼이 꽉 차도록 scale
    // ────────────────────────────────────────────────────────────
    const [scale, setScale] = useState(1);
    const wrapRef = useRef();
    useEffect(() => {
        const calc = () => {
            if (!wrapRef.current) return;
            // 297mm ≈ 1122px @ 96dpi, 두 폼 + 패딩
            const availW = wrapRef.current.clientWidth - 32;
            const formNaturalW = 1122; // 297mm at 96dpi
            setScale(Math.min(1, availW / formNaturalW));
        };
        calc();
        window.addEventListener('resize', calc);
        return () => window.removeEventListener('resize', calc);
    }, [open]);

    return (
        <Modal open={open} onClose={onClose} sx={{ '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.9)' } }}>
            <Box sx={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '96vw', maxWidth: '1200px',
                maxHeight: '98vh', display: 'flex', flexDirection: 'column',
                bgcolor: '#1e293b', boxShadow: 24, borderRadius: 2, overflow: 'hidden',
            }}>
                {/* 헤더 */}
                <Box className="tsm-no-print" sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Printer size={16} /> 거래명세서 출력 및 관리
                    </span>
                    <IconButton onClick={onClose} sx={{ color: '#fff' }}><X size={20} /></IconButton>
                </Box>

                {/* 본문 */}
                <Box ref={wrapRef} sx={{ flexGrow: 1, overflowY: 'auto', p: 2, bgcolor: '#334155', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {saveStatus === 'success' && <Alert severity="success" icon={<CheckCircle2 />} sx={{ mb: 2, borderRadius: 2, width: '100%' }}>✅ 명세서가 정상적으로 첨부되었습니다.</Alert>}
                    {saveStatus === 'error' && <Alert severity="error" sx={{ mb: 2, borderRadius: 2, width: '100%' }}>저장에 실패했습니다. 다시 시도해 주세요.</Alert>}

                    {/* ── A4 고정 블록: 297mm × 210mm, 화면에서는 scale로 축소 ── */}
                    <div
                        ref={printRef}
                        className="tsm-print-container"
                        style={{
                            /* 절대 297×210mm 고수 */
                            width: '297mm',
                            height: '210mm',
                            minWidth: '297mm',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            /* 화면에서 축소 표시 */
                            transform: `scale(${scale})`,
                            transformOrigin: 'top center',
                            /* 실제 렌더링 높이를 scale에 맞게 확보 */
                            marginBottom: `calc(210mm * ${scale} - 210mm)`,
                            /* 표시용 */
                            display: 'flex',
                            flexDirection: 'row',
                            gap: '5mm',
                            padding: '4mm',
                            backgroundColor: '#fff',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}><StatementForm color="blue" /></div>
                        <div style={{ flex: 1, minWidth: 0 }}><StatementForm color="red" /></div>
                    </div>
                </Box>

                {/* 하단 버튼 */}
                <Box className="tsm-no-print" sx={{ px: 2, py: 1.5, borderTop: '1px solid #475569', display: 'flex', justifyContent: 'center', gap: 2, bgcolor: '#1e293b', flexShrink: 0 }}>
                    <Button variant="contained" size="large"
                        startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <Save />}
                        onClick={() => handleSaveAndAttach(false)} disabled={isSaving}
                        sx={{ bgcolor: '#0f172a', fontWeight: 'bold', px: 4, borderRadius: 2 }}>
                        저장 및 첨부
                    </Button>
                    <Button variant="contained" size="large" startIcon={<Printer />} onClick={handlePrint}
                        sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 4, borderRadius: 2 }}>
                        인쇄
                    </Button>
                    <Button variant="outlined" size="large" onClick={onClose}
                        sx={{ borderColor: '#475569', color: '#94a3b8', fontWeight: 'bold', px: 4, borderRadius: 2 }}>
                        닫기
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default TransactionStatementModal;
