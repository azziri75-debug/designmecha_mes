import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Modal, Box, Button, IconButton,
    CircularProgress, Alert
} from '@mui/material';
import { X, Printer, FileDown, CheckCircle2 } from 'lucide-react';
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
            @page { size: A4 landscape; margin: 5mm !important; }
            
            /* 핵심: visibility 대신 display: none 사용 (React Portal/Modal 백화 현상 방지) */
            .tsm-no-print, .MuiBackdrop-root, .MuiModal-backdrop { display: none !important; }
            
            .tsm-print-container {
                display: flex !important;
                position: fixed !important; 
                left: 0 !important;
                top: 0 !important;
                width: 297mm !important;
                height: 210mm !important;
                margin: 0 !important;
                padding: 10mm !important;
                box-sizing: border-box !important;
                transform: none !important;
                background-color: white !important;
                z-index: 9999 !important;
            }
            .tsm-print-container > div { flex: 1 !important; height: auto !important; }
            
            /* 테이블 및 텍스트 최적화 */
            .tsm-print-container table { width: 100% !important; table-layout: fixed !important; }
            .tsm-print-container td, .tsm-print-container th { height: auto !important; }
            .tsm-remarks-textarea { border: none !important; resize: none !important; overflow: hidden !important; background: transparent !important; }
            
            /* 컬러 강제 출력 */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
    padding: '2px 3px',
    fontSize: '11px',
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
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [pdfStatus, setPdfStatus] = useState(null);
    const [companyStampUrl, setCompanyStampUrl] = useState(null); // DB 직인 이미지 URL
    const printRef = useRef();

    // ── Resizable Columns State & Logic ───────────────────────
    const [colWidths, setColWidths] = useState({
        date: 45,
        name: 180,
        spec: 90,
        qty: 40,
        price: 75,
        supply: 85,
        tax: 70
    });
    const resizingCol = useRef(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const onResizerMouseDown = (col, e) => {
        e.preventDefault();
        resizingCol.current = col;
        startX.current = e.pageX;
        startWidth.current = colWidths[col];
        document.addEventListener('mousemove', onResizerMouseMove);
        document.addEventListener('mouseup', onResizerMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const onResizerMouseMove = useCallback((e) => {
        if (!resizingCol.current) return;
        const diff = e.pageX - startX.current;
        const MAX_W = 500;
        setColWidths(prev => ({
            ...prev,
            [resizingCol.current]: Math.min(MAX_W, Math.max(30, startWidth.current + diff))
        }));
    }, []);

    const onResizerMouseUp = useCallback(() => {
        resizingCol.current = null;
        document.removeEventListener('mousemove', onResizerMouseMove);
        document.removeEventListener('mouseup', onResizerMouseUp);
        document.body.style.cursor = 'default';
    }, [onResizerMouseMove]);

    // 모달 열릴 때: (1) 인쇄 CSS 주입, (2) 회사 직인 이미지 로드
    useEffect(() => {
        if (!open) { removePrintCSS(); return; }
        injectPrintCSS();
        // GET /api/v1/basics/company → stamp_image.url 가져오기
        api.get('/basics/company').then(res => {
            const stamp = res.data?.stamp_image;
            if (stamp?.url) {
                // stamp.url이 상대경로(/uploads/...)면 backend 기본 주소를 붙여준다
                const apiBase = import.meta.env.VITE_API_URL || '';
                // '/api/v1' 접미사를 제거해서 backend origin만 추출
                const backendOrigin = apiBase.replace(/\/api\/v1\/?$/, '');
                const fullUrl = stamp.url.startsWith('http')
                    ? stamp.url
                    : `${backendOrigin}${stamp.url}`;
                setCompanyStampUrl(fullUrl);
            }
        }).catch(() => {/* 실패해도 SVG fallback 사용 */ });
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

    const [remarks, setRemarks] = useState(data.remarks || '');

    // ── PDF 다운로드 ────────────────────────────
    const handleDownloadPDF = async () => {
        setIsGeneratingPdf(true);
        try {
            // 캡처용 high-scale 캔버스 생성
            const cvs = await html2canvas(printRef.current, {
                scale: 2.5,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            const pdf = new jsPDF('l', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(
                cvs.toDataURL('image/png'),
                'PNG',
                0, 0,
                pageWidth, pageHeight,
                undefined, 'FAST'
            );

            const fileName = `거래명세서_${data.partner?.name || '공급처'}_${data.delivery_date || ''}.pdf`;
            pdf.save(fileName);

            setPdfStatus('success');
            setTimeout(() => setPdfStatus(null), 3000);
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            setPdfStatus('error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // ════════════════════════════════════════
    // 단일 양식 (blue / red)
    // ════════════════════════════════════════
    const StatementForm = ({ color }) => {
        const C = color === 'blue' ? '#003AC1' : '#C10000';
        const sealSrc = companyStampUrl || makeSealURI(supplierInfo.company_name);

        const ROW_H = '24px';

        return (
            <div style={{
                border: `1.8px solid ${C}`,
                width: '100%', height: '100%',
                backgroundColor: '#fff',
                display: 'flex', flexDirection: 'column',
                fontFamily: '"Malgun Gothic","맑은 고딕",sans-serif',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}>
                {/* ── 상단: No/일자 + 거래명세표 타이틀 + 공급자 테이블 ── */}
                <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1.2px solid ${C}` }}>

                    {/* 왼쪽: No, 일자, 거래명세표, 귀하 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {/* No 행 */}
                        <div style={{ display: 'flex', height: '22px', borderBottom: `0.8px solid ${C}` }}>
                            <div style={{ width: '40px', borderRight: `0.8px solid ${C}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', fontStyle: 'italic', color: C }}>No.</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '13px', fontWeight: 'bold', color: C }}>{data.delivery_no?.slice(-8) || '00000000'}</div>
                        </div>
                        {/* 일자 행 */}
                        <div style={{ display: 'flex', height: '22px', borderBottom: `0.8px solid ${C}` }}>
                            <div style={{ width: '40px', borderRight: `0.8px solid ${C}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: C }}>일자</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '12px', color: C }}>{data.delivery_date || ''}</div>
                        </div>
                        {/* 거래명세표 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0 10px' }}>
                            <span style={{ fontSize: '30px', fontWeight: '900', letterSpacing: '8px', borderBottom: `3px double ${C}`, color: C, lineHeight: 1.1, whiteSpace: 'nowrap', wordBreak: 'keep-all' }}>거래명세표</span>
                        </div>
                        {/* 귀하 */}
                        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', paddingBottom: '12px', gap: '8px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '20px', fontWeight: '900', color: C, borderBottom: `1.5px solid ${C}`, minWidth: '160px', textAlign: 'center', whiteSpace: 'nowrap' }}>{data.partner?.name || ''}</span>
                            <span style={{ fontSize: '18px', fontWeight: '900', color: C }}>귀하</span>
                        </div>
                    </div>

                    {/* 오른쪽: 공급자 정보 table */}
                    <div style={{ borderLeft: `1.2px solid ${C}`, display: 'flex', flexDirection: 'column' }}>
                        <table style={{ ...tblStyle(C), width: '300px', flex: 1, tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '18px' }} />
                                <col style={{ width: '56px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '28px' }} />
                                <col style={{ width: '78px' }} />
                            </colgroup>
                            <tbody>
                                {/* 등록번호 행 */}
                                <tr style={{ height: '26px' }}>
                                    <td rowSpan={4} style={{ ...td(C), textAlign: 'center', padding: '0', writingMode: 'vertical-rl', textOrientation: 'upright', letterSpacing: '4px', fontSize: '11px', fontWeight: 'bold', width: '18px', borderLeft: 'none' }}>공급자</td>
                                    <td colSpan={1} style={{ ...td(C), textAlign: 'center', fontSize: '11px' }}>등록번호</td>
                                    <td colSpan={3} style={{ ...td(C), textAlign: 'center', fontSize: '18px', fontWeight: '900', letterSpacing: '1.5px' }}>{supplierInfo.biz_no}</td>
                                </tr>
                                {/* 상호 + 성명 행 */}
                                <tr style={{ height: '30px' }}>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px' }}>상호</td>
                                    <td style={{ ...td(C), fontWeight: 'bold', fontSize: '13px' }}>{supplierInfo.company_name}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px' }}>성명</td>
                                    <td style={{ ...td(C), fontSize: '13px', fontWeight: 'bold', position: 'relative', overflow: 'visible' }}>
                                        {supplierInfo.owner_name}
                                        <img
                                            src={sealSrc}
                                            alt="직인"
                                            style={{
                                                position: 'absolute',
                                                right: '10px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '50px',
                                                height: '50px',
                                                opacity: 0.9,
                                                objectFit: 'contain',
                                                mixBlendMode: 'multiply',
                                                pointerEvents: 'none',
                                                zIndex: 10
                                            }}
                                        />
                                    </td>
                                </tr>
                                {/* 사업장주소 행 */}
                                <tr style={{ height: '28px' }}>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '10.5px', lineHeight: '1.2' }}>사업장주소</td>
                                    <td colSpan={3} style={{ ...td(C), fontSize: '11px', whiteSpace: 'normal', lineHeight: '1.2' }}>{supplierInfo.address}</td>
                                </tr>
                                {/* 업태 + 종목 행 */}
                                <tr style={{ height: '30px' }}>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '10px' }}>업태</td>
                                    <td style={{ ...td(C), fontSize: '10px' }}>{supplierInfo.biz_type}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '10px' }}>종목</td>
                                    <td style={{ ...td(C), fontSize: '10px', borderRight: 'none' }}>{supplierInfo.biz_item}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── 합계 행 ── */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderBottom: `1.5px solid ${C}` }}>
                    <span style={{ fontSize: '15px', fontWeight: '900', color: C, marginRight: '10px' }}>합계</span>
                    <span style={{ flex: 1, fontSize: '14px', fontWeight: 'bold', color: C }}>{toKoreanCurrency(totalAmount)} (￦{formatNumber(totalAmount)})</span>
                    <span style={{ fontSize: '10px', color: C }}>(전잔금+금기)</span>
                </div>

                {/* ── 품목 테이블 ── */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <table style={{ ...tblStyle(C), tableLayout: 'fixed', width: '100%' }}>
                        <colgroup>
                            <col style={{ width: colWidths.date }} />
                            <col style={{ width: colWidths.name }} />
                            <col style={{ width: colWidths.spec }} />
                            <col style={{ width: colWidths.qty }} />
                            <col style={{ width: colWidths.price }} />
                            <col style={{ width: colWidths.supply }} />
                            <col style={{ width: colWidths.tax }} />
                        </colgroup>
                        <thead>
                            <tr style={{ backgroundColor: 'rgba(0,0,0,0.03)', height: '24px' }}>
                                {[
                                    { key: 'date', label: '월/일' },
                                    { key: 'name', label: '내  역' },
                                    { key: 'spec', label: '규  격' },
                                    { key: 'qty', label: '수량' },
                                    { key: 'price', label: '단  가' },
                                    { key: 'supply', label: '공급가액' },
                                    { key: 'tax', label: '세  액' }
                                ].map((h, i) => (
                                    <th
                                        key={h.key}
                                        style={{
                                            ...td(C, { textOverflow: 'ellipsis' }),
                                            width: colWidths[h.key],
                                            textAlign: 'center',
                                            fontWeight: '900',
                                            fontSize: '12px',
                                            borderRight: i === 6 ? 'none' : `0.8px solid ${C}`,
                                            position: 'relative'
                                        }}
                                    >
                                        {h.label}
                                        {/* Resizer Handle */}
                                        {i < 6 && (
                                            <div
                                                onMouseDown={(e) => onResizerMouseDown(h.key, e)}
                                                className="tsm-no-print"
                                                style={{
                                                    position: 'absolute',
                                                    right: -3,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: 6,
                                                    cursor: 'col-resize',
                                                    zIndex: 10
                                                }}
                                            />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ height: ROW_H }}>
                                    <td style={{ ...td(C, { textOverflow: 'ellipsis' }), textAlign: 'center', fontSize: '11px' }}>{(item.date || '').slice(5)}</td>
                                    <td style={{ ...td(C, { textOverflow: 'ellipsis' }), fontWeight: 'bold', fontSize: '11.5px' }}>{item.product?.name || item.item_name || ''}</td>
                                    <td style={{ ...td(C, { textOverflow: 'ellipsis' }), textAlign: 'center', fontSize: '11px' }}>{item.product?.spec || ''}</td>
                                    <td style={{ ...td(C, { textOverflow: 'ellipsis' }), textAlign: 'center', fontSize: '11.5px' }}>{formatNumber(item.quantity)}</td>
                                    <td style={{ ...td(C, { textOverflow: 'ellipsis' }), textAlign: 'right', fontSize: '11.5px' }}>{formatNumber(item.unit_price)}</td>
                                    <td style={{ ...td(C, { textOverflow: 'ellipsis' }), textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>{formatNumber(item.quantity * item.unit_price)}</td>
                                    <td style={{ ...td(C, { textOverflow: 'ellipsis' }), textAlign: 'right', fontSize: '12px', borderRight: 'none' }}>{formatNumber(Math.floor(item.quantity * item.unit_price * 0.1))}</td>
                                </tr>
                            ))}
                            {/* 이하여백 행 + 격자 유지 */}
                            {emptyCount > 0 && (
                                <tr style={{ height: ROW_H }}>
                                    <td style={{ ...td(C), textAlign: 'center', borderBottom: `0.8px dotted ${C}` }} />
                                    <td colSpan={6} style={{ ...td(C), color: '#bbb', fontSize: '11.5px', borderBottom: `0.8px dotted ${C}`, borderRight: 'none', textAlign: 'center' }}>= 이하여백 =</td>
                                </tr>
                            )}
                            {Array(Math.max(0, emptyCount - 1)).fill(null).map((_, i) => (
                                <tr key={i} style={{ height: ROW_H }}>
                                    <td style={{ ...td(C), borderBottom: i === emptyCount - 2 ? 'none' : `0.8px dotted ${C}` }} />
                                    <td style={{ ...td(C), borderBottom: i === emptyCount - 2 ? 'none' : `0.8px dotted ${C}` }} />
                                    <td style={{ ...td(C), borderBottom: i === emptyCount - 2 ? 'none' : `0.8px dotted ${C}` }} />
                                    <td style={{ ...td(C), borderBottom: i === emptyCount - 2 ? 'none' : `0.8px dotted ${C}` }} />
                                    <td style={{ ...td(C), borderBottom: i === emptyCount - 2 ? 'none' : `0.8px dotted ${C}` }} />
                                    <td style={{ ...td(C), borderBottom: i === emptyCount - 2 ? 'none' : `0.8px dotted ${C}` }} />
                                    <td style={{ ...td(C), borderBottom: i === emptyCount - 2 ? 'none' : `0.8px dotted ${C}`, borderRight: 'none' }} />
                                </tr>
                            ))}
                            {/* 비고란 추가 */}
                            <tr style={{ height: '60px' }}>
                                <td colSpan={7} style={{ ...td(C), borderTop: `1.2px solid ${C}`, borderRight: 'none', padding: '4px 8px', verticalAlign: 'top' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>비고:</div>
                                    <textarea
                                        value={remarks}
                                        onChange={(e) => setRemarks(e.target.value)}
                                        placeholder="비고 사항을 입력하세요..."
                                        style={{
                                            width: '100%',
                                            height: '35px',
                                            border: 'none',
                                            resize: 'none',
                                            background: 'transparent',
                                            fontSize: '11px',
                                            color: C,
                                            outline: 'none',
                                            padding: '0',
                                            fontFamily: 'inherit'
                                        }}
                                        className="tsm-remarks-textarea"
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── 하단 Footer 테이블 ── */}
                <table style={{ ...tblStyle(C), borderTop: `1.8px solid ${C}` }}>
                    <colgroup>
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '48%' }} />
                    </colgroup>
                    <tbody>
                        <tr style={{ height: '26px' }}>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>전잔금</td>
                            <td style={{ ...td(C) }}>
                                <input
                                    value={formatNumber(footerInfo.prev_balance)}
                                    onChange={e => setFooterInfo(p => ({ ...p, prev_balance: Number(e.target.value.replace(/,/g, '')) || 0 }))}
                                    style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: C, fontSize: '13px', background: 'transparent', fontWeight: 'bold' }}
                                />
                            </td>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>합계</td>
                            <td style={{ ...td(C), textAlign: 'right', fontWeight: '900', fontSize: '15px', paddingRight: '12px', borderRight: 'none', whiteSpace: 'nowrap' }}>￦{formatNumber(totalAmount)}</td>
                        </tr>
                        <tr style={{ height: '26px' }}>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>입금</td>
                            <td style={{ ...td(C) }}>
                                <input
                                    value={formatNumber(footerInfo.paid_amount)}
                                    onChange={e => setFooterInfo(p => ({ ...p, paid_amount: Number(e.target.value.replace(/,/g, '')) || 0 }))}
                                    style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: C, fontSize: '13px', background: 'transparent', fontWeight: 'bold' }}
                                />
                            </td>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>잔금</td>
                            <td style={{ ...td(C), textAlign: 'right', fontWeight: '900', fontSize: '15px', paddingRight: '12px', borderRight: 'none', whiteSpace: 'nowrap' }}>
                                ￦{formatNumber(balance)}
                                <span style={{ fontSize: '11px', marginLeft: '12px', fontWeight: 'bold' }}>인수자&nbsp;</span>
                                <input
                                    value={footerInfo.receiver_name}
                                    onChange={e => setFooterInfo(p => ({ ...p, receiver_name: e.target.value }))}
                                    placeholder="성함"
                                    style={{ border: 'none', width: '80px', outline: 'none', color: C, fontSize: '12px', background: 'transparent', borderBottom: `0.5px solid ${C}`, textAlign: 'center' }}
                                />
                                <span style={{ fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>(인)</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── 하단 감사 문구 ── */}
                <div style={{ textAlign: 'center', padding: '2px 0', borderTop: `0.7px solid ${C}`, fontSize: '9.5px', fontWeight: '900', color: C }}>
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
        <Modal
            open={open}
            onClose={onClose}
            sx={{ '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.9)' } }}
            slotProps={{
                backdrop: { className: 'tsm-no-print' }
            }}
        >
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
                <Box ref={wrapRef} sx={{ flexGrow: 1, overflowY: 'auto', p: 3, bgcolor: '#334155', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {pdfStatus === 'success' && <Alert severity="success" icon={<CheckCircle2 />} sx={{ mb: 2, borderRadius: 2, width: '100%' }}>✅ PDF 파일이 성공적으로 생성되었습니다.</Alert>}
                    {pdfStatus === 'error' && <Alert severity="error" sx={{ mb: 2, borderRadius: 2, width: '100%' }}>PDF 생성에 실패했습니다. 다시 시도해 주세요.</Alert>}

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
                            position: 'relative', // For perforation line
                            /* 화면에서 축소 표시 */
                            transform: `scale(${scale})`,
                            transformOrigin: 'top center',
                            /* 실제 렌더링 높이를 scale에 맞게 확보 */
                            marginBottom: `calc(210mm * ${scale} - 210mm)`,
                            /* 표시용 */
                            display: 'flex',
                            flexDirection: 'row',
                            gap: '12mm', // 여백 확대
                            padding: '10mm', // 여백 확대
                            backgroundColor: '#fff',
                            boxShadow: '0 12px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* 중앙 절취선 */}
                        <div style={{
                            position: 'absolute',
                            left: '50%', top: '5mm', bottom: '5mm',
                            borderRight: '1.5px dashed #999',
                            pointerEvents: 'none',
                            zIndex: 1,
                            transform: 'translateX(-50%)'
                        }} className="tsm-no-print" />

                        <div style={{ flex: 1, minWidth: 0 }}><StatementForm color="blue" /></div>
                        <div style={{ flex: 1, minWidth: 0 }}><StatementForm color="red" /></div>
                    </div>
                </Box>

                {/* 하단 버튼 */}
                <Box className="tsm-no-print" sx={{ px: 2, py: 1.5, borderTop: '1px solid #475569', display: 'flex', justifyContent: 'center', gap: 2, bgcolor: '#1e293b', flexShrink: 0 }}>
                    <Button variant="contained" size="large"
                        startIcon={isGeneratingPdf ? <CircularProgress size={16} color="inherit" /> : <FileDown />}
                        onClick={handleDownloadPDF} disabled={isGeneratingPdf}
                        sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 4, borderRadius: 2 }}>
                        PDF 다운로드
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
