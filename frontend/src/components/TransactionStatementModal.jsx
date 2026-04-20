import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Modal, Box, Button, IconButton,
    CircularProgress, Alert, Checkbox, FormControlLabel
} from '@mui/material';
import { X, Printer, FileDown, CheckCircle2 } from 'lucide-react';
import { formatNumber, toKoreanCurrency, getImageUrl } from '../lib/utils';
import html2canvas from 'html2canvas';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
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
            @page { size: A4 landscape !important; margin: 0 !important; }
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
    border: `1.5px solid ${c}`,
    padding: '2px 3px',
    fontSize: '10.5px',
    color: c,
    borderStyle: 'solid',
    verticalAlign: 'middle',
    wordBreak: 'break-all',
    whiteSpace: 'normal',
    overflow: 'visible',
    lineHeight: '1.1',
    ...extra,
});

// ════════════════════════════════════════════════════════════════
const TransactionStatementModal = ({ open, onClose, data, onSuccess }) => {
    if (!data) return null;

    // ── Data State ────────────────────────────────
    const [items, setItems] = useState([]);
    
    // Initialize items from snapshot or props
    useEffect(() => {
        if (!open) return;
        if (data.statement_json?.items) {
            setItems(data.statement_json.items);
        } else {
            setItems(data.items || []);
        }
    }, [open, data]);

    const [supplierInfo, setSupplierInfo] = useState(data.supplier_info || {
        biz_no: '312-81-38446',
        company_name: '(주)디자인메카',
        owner_name: '조인호',
        address: '충남 아산시 음봉면 월암로 336-39',
        biz_type: '제조업',
        biz_item: '나이프,베어링',
    });
    const [footerInfo, setFooterInfo] = useState({
        prev_balance: data.prev_balance || 0,
        paid_amount: data.paid_amount || 0,
        receiver_name: data.receiver_name || '',
    });
    const [showRecipient, setShowRecipient] = useState(true);
    const [showSupplier, setShowSupplier] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [pdfStatus, setPdfStatus] = useState(null);
    const [companyStampUrl, setCompanyStampUrl] = useState(null); // DB 직인 이미지 URL
    const [isSaving, setIsSaving] = useState(false);
    const printRef = useRef();

    // ── Resizable Columns State & Logic ───────────────────────
    const [colWidths, setColWidths] = useState({
        date: 35,
        name: 160,
        spec: 75,
        qty: 35,
        price: 60,
        supply: 65,
        tax: 50
    });
    const resizingCol = useRef(null);
    const startX = useRef(0);
    const startWidth = useRef(0);
    const startNextWidth = useRef(0);
    const colOrder = ['date', 'name', 'spec', 'qty', 'price', 'supply', 'tax'];

    const onResizerMouseDown = (col, e) => {
        e.preventDefault();
        resizingCol.current = col;
        startX.current = e.pageX;
        startWidth.current = colWidths[col];
        
        const nextIdx = colOrder.indexOf(col) + 1;
        if (nextIdx < colOrder.length) {
            startNextWidth.current = colWidths[colOrder[nextIdx]];
        }

        document.addEventListener('mousemove', onResizerMouseMove);
        document.addEventListener('mouseup', onResizerMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const onResizerMouseMove = useCallback((e) => {
        if (!resizingCol.current) return;
        const diff = e.pageX - startX.current;
        const nextIdx = colOrder.indexOf(resizingCol.current) + 1;
        if (nextIdx >= colOrder.length) return;

        const nextCol = colOrder[nextIdx];
        
        // Calculate potential new widths
        let newWidth = startWidth.current + diff;
        let newNextWidth = startNextWidth.current - diff;

        // Apply minimum width constraints (30px)
        if (newWidth < 30) {
            newWidth = 30;
            newNextWidth = startWidth.current + startNextWidth.current - 30;
        } else if (newNextWidth < 30) {
            newNextWidth = 30;
            newWidth = startWidth.current + startNextWidth.current - 30;
        }

        setColWidths(prev => ({
            ...prev,
            [resizingCol.current]: newWidth,
            [nextCol]: newNextWidth
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
            const comp = res.data;
            if (comp) {
                if (!data.supplier_info) {
                    setSupplierInfo({
                        biz_no: comp.business_no || '312-81-38446',
                        company_name: comp.name || '(주)디자인메카',
                        owner_name: comp.ceo_name || '조인호',
                        address: comp.address || '충남 아산시 음봉면 월암로 336-39',
                        biz_type: comp.business_type || '제조업',
                        biz_item: comp.business_item || '나이프,베어링',
                    });
                }
                const stamp = comp.stamp_image;
                if (stamp?.url) {
                    setCompanyStampUrl(getImageUrl(stamp.url));
                }
            }
        }).catch(() => {/* 실패해도 SVG fallback 사용 */ });
        return () => removePrintCSS();
    }, [open, data.supplier_info]);
 
    // ── 품목 조작 ──────────────────────────────
    const addItem = () => {
        setItems(prev => [...prev, {
            date: new Date().toISOString().split('T')[0],
            product_name: '새 항목',
            specification: '',
            quantity: 1,
            unit_price: 0
        }]);
    };
 
    const updateItem = (idx, field, val) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
    };
 
    const removeItem = (idx) => {
        if (window.confirm("항목을 삭제하시겠습니까?")) {
            setItems(prev => prev.filter((_, i) => i !== idx));
        }
    };
 
    const handleSaveStatement = async () => {
        if (!data.delivery_id && !data.id) {
            return alert("납품 이력 ID가 없어 저장할 수 없습니다.");
        }
        setIsSaving(true);
        try {
            const historyId = data.delivery_id || data.id;
            const orderId = data.order_id || data.id; // data contains order if opened from page
            
            const payload = {
                statement_json: {
                    items,
                    totalSupply,
                    totalTax,
                    totalAmount,
                    prev_balance: footerInfo.prev_balance,
                    paid_amount: footerInfo.paid_amount,
                    receiver_name: footerInfo.receiver_name,
                    remarks
                }
            };
 
            // Delivery ID is usually part of the data or passed separately
            await api.put(`/sales/orders/${orderId}/delivery/${historyId}`, payload);
            alert("거래명세서 정보가 저장되었습니다.");
            if (onSuccess) onSuccess();
        } catch (err) {
            console.error("Save failed:", err);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            setIsSaving(false);
        }
    };


    // ── 계산 ──────────────────────────────────
    const totalSupply = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const totalTax = Math.floor(totalSupply * 0.1);
    const totalAmount = totalSupply + totalTax;
    const balance = (footerInfo.prev_balance + totalAmount) - footerInfo.paid_amount;

    const ROWS = 13;
    const filledRows = items.length;
    const emptyCount = Math.max(0, ROWS - filledRows);

    const [remarks, setRemarks] = useState(data.remarks || data.note || '');

    // ── PDF 다운로드 ────────────────────────────
    const handleDownloadPDF = async () => {
        if (!printRef.current) return;
        setIsGeneratingPdf(true);
        try {
            const partnerName = data.partner?.name || '고객사';
            const firstItemName = items[0]?.product?.name || items[0]?.product_name || items[0]?.item_name || '품명';
            const extraCount = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
            const deliveryDate = data.delivery_date || '날짜';
            const fileName = `거래명세서-${partnerName}-${firstItemName}${extraCount}-${deliveryDate}.pdf`;
            await generateA4PDF(printRef.current, {
                fileName,
                orientation: 'landscape',
                action: 'download',
                pixelRatio: 3,
                multiPage: false
            });
            setPdfStatus('success');
            setTimeout(() => setPdfStatus(null), 3000);
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            setPdfStatus('error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handlePrint = async () => {
        await printAsImage(printRef.current, { title: '거래명세표', orientation: 'landscape', pixelRatio: 3 });
    };

    // ════════════════════════════════════════
    // 단일 양식 (blue / red)
    // ════════════════════════════════════════
    const StatementForm = ({ color, typeLabel, remarks, onRemarksChange }) => {
        const C = color === 'blue' ? '#0000ff' : '#ff0000';
        const sealSrc = companyStampUrl || makeSealURI(supplierInfo.company_name);

        const ROW_H = '24px';

        return (
            <div 
                className="tsm-form-paper print-safe-area"
                style={{
                border: `1.8px solid ${C}`,
                width: '100%', height: '100%',
                backgroundColor: 'white',
                background: 'white',
                color: 'black',
                display: 'flex', flexDirection: 'column',
                fontFamily: '"Malgun Gothic","맑은 고딕",sans-serif',
                boxSizing: 'border-box',
                padding: '15px !important',
                overflow: 'hidden',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
            }}>
                <style>{`
                    .tsm-form-paper {
                        background-color: white !important;
                    }
                    .tsm-form-paper td, .tsm-form-paper th, .tsm-form-paper span, .tsm-form-paper div {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    /* fix: prevent html-to-image SVG culling on mathematically empty cells */
                    .tsm-form-paper td:empty::before { 
                        content: "\\00a0"; 
                        visibility: hidden; 
                    }
                `}</style>
                {/* ── 상단: No/일자 + 거래명세표 타이틀 + 공급자 테이블 ── */}
                <div style={{ padding: '2px 8px', fontSize: '10px', fontWeight: '900', color: C, textAlign: 'left' }}>{typeLabel}</div>
                <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1.5px solid ${C}` }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', height: '22px', borderBottom: `1.5px solid ${C}` }}>
                            <div style={{ width: '40px', borderRight: `1.5px solid ${C}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', fontStyle: 'italic', color: C }}>No.</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '13px', fontWeight: 'bold', color: C }}>{data.delivery_no?.slice(-8) || '00000000'}</div>
                        </div>
                        <div style={{ display: 'flex', height: '22px', borderBottom: `1.5px solid ${C}` }}>
                            <div style={{ width: '40px', borderRight: `1.5px solid ${C}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: C }}>일자</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '12px', color: C }}>{data.delivery_date || ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0 6px' }}>
                            <span style={{ fontSize: '16px', fontWeight: '900', borderBottom: `3px double ${C}`, color: C, lineHeight: 1.1, whiteSpace: 'nowrap', wordBreak: 'keep-all' }}>{"거\u00A0\u00A0\u00A0래\u00A0\u00A0\u00A0명\u00A0\u00A0\u00A0세\u00A0\u00A0\u00A0표"}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', paddingBottom: '8px', gap: '8px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '150px', alignItems: 'center' }}>
                                <div style={{ 
                                    fontSize: '14px', 
                                    fontWeight: '900', 
                                    color: C, 
                                    textAlign: 'center', 
                                    whiteSpace: 'nowrap',
                                    paddingBottom: '2px',
                                    lineHeight: '1.2'
                                }}>
                                    {data.partner?.name || ''}
                                </div>
                                <div style={{ width: '100%', height: '2.5px', backgroundColor: C, marginTop: '-1px' }} className="tsm-no-bg-override" />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '900', color: C }}>귀하</span>
                        </div>
                    </div>

                    <div style={{ borderLeft: `1.5px solid ${C}`, display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                        <table style={{ ...tblStyle(C), width: '300px', flex: 1, tableLayout: 'fixed' }}>
                            <colgroup>
                                <col style={{ width: '18px' }} />
                                <col style={{ width: '56px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '28px' }} />
                                <col style={{ width: '78px' }} />
                            </colgroup>
                            <tbody>
                                <tr style={{ height: '26px' }}>
                                    <td rowSpan={4} style={{ ...td(C), textAlign: 'center', padding: '0', writingMode: 'vertical-rl', textOrientation: 'upright', fontSize: '11px', fontWeight: 'bold', width: '18px' }}>{"공\u00A0\u00A0급\u00A0\u00A0자"}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px' }}>등록번호</td>
                                    <td colSpan={3} style={{ ...td(C), textAlign: 'center', fontSize: '18px', fontWeight: '900' }}>{supplierInfo.biz_no}</td>
                                </tr>
                                <tr style={{ height: '30px' }}>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px' }}>상호</td>
                                    <td style={{ ...td(C), fontWeight: 'bold', fontSize: '13px', overflow: 'hidden' }}>{supplierInfo.company_name}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px' }}>성명</td>
                                    <td style={{ ...td(C), fontSize: '13px', fontWeight: 'bold', position: 'relative', overflow: 'visible' }}>
                                        {supplierInfo.owner_name}
                                        <img src={sealSrc} alt="직인" style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', width: '45px', height: '45px', opacity: 0.9, objectFit: 'contain', mixBlendMode: 'multiply', pointerEvents: 'none', zIndex: 9999 }} />
                                    </td>
                                </tr>
                                <tr style={{ height: '28px' }}>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '10.5px' }}>사업장주소</td>
                                    <td colSpan={3} style={{ ...td(C), fontSize: '11px', whiteSpace: 'nowrap' }}>{supplierInfo.address}</td>
                                </tr>
                                <tr style={{ height: '30px' }}>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '10px' }}>업태</td>
                                    <td style={{ ...td(C), fontSize: '10px' }}>{supplierInfo.biz_type}</td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '10px' }}>종목</td>
                                    <td style={{ ...td(C), fontSize: '10px' }}>{supplierInfo.biz_item}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderBottom: `1.5px solid ${C}` }}>
                    <span style={{ fontSize: '12px', fontWeight: '900', color: C, marginRight: '10px' }}>합계</span>
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: 'bold', color: C }}>{toKoreanCurrency(totalAmount)} (￦{formatNumber(totalAmount)})</span>
                    <span style={{ fontSize: '9px', color: C }}>(전잔금+금기)</span>
                </div>

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
                                    { key: 'name', label: '내역' },
                                    { key: 'spec', label: '규격' },
                                    { key: 'qty', label: '수량' },
                                    { key: 'price', label: '단가' },
                                    { key: 'supply', label: '공급가액' },
                                    { key: 'tax', label: '세액' }
                                ].map((h, i) => (
                                    <th key={h.key} style={{ ...td(C, { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }), width: colWidths[h.key], textAlign: 'center', fontWeight: '900', fontSize: '12px', borderRight: `1.5px solid ${C}`, position: 'relative', overflow: 'hidden' }}>
                                        {h.label}
                                        {i < 6 && (
                                            <div onMouseDown={(e) => onResizerMouseDown(h.key, e)} className="tsm-no-print" style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 10 }} />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ minHeight: ROW_H, height: 'auto' }} className="tsm-item-row group">
                                    <td style={{ ...td(C), padding: '0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: ROW_H, height: '100%' }}>
                                            <textarea 
                                                value={(item.date || data.delivery_date || '').slice(5)} 
                                                onChange={e => updateItem(idx, 'date', e.target.value)}
                                                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                style={{ width: '100%', border: 'none', textAlign: 'center', background: 'transparent', color: C, fontSize: '11px', outline: 'none', resize: 'none', padding: '0', height: 'auto', fontFamily: 'inherit', overflow: 'hidden', display: 'block' }}
                                            />
                                        </div>
                                    </td>
                                    <td style={{ ...td(C, { whiteSpace: 'normal', wordBreak: 'break-all' }), fontWeight: 'bold', fontSize: '11.5px', position: 'relative', padding: '0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', minHeight: ROW_H, height: '100%', padding: '0 4px' }}>
                                            <textarea 
                                                value={item.product?.name || item.product_name || item.item_name || ''} 
                                                onChange={e => updateItem(idx, 'product_name', e.target.value)}
                                                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                style={{ width: '100%', border: 'none', background: 'transparent', color: C, fontSize: '11.5px', fontWeight: 'bold', outline: 'none', resize: 'none', padding: '0', height: 'auto', fontFamily: 'inherit', overflow: 'hidden', display: 'block' }}
                                            />
                                        </div>
                                        <button 
                                            onClick={() => removeItem(idx)}
                                            className="tsm-no-print"
                                            style={{ position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', padding: '2px 4px', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s' }}
                                        >삭제</button>
                                        <style>{`.tsm-item-row:hover button { opacity: 0.8 !important; }`}</style>
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px', padding: '0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: ROW_H, height: '100%' }}>
                                            <textarea 
                                                value={item.specification || item.product?.specification || ''} 
                                                onChange={e => updateItem(idx, 'specification', e.target.value)}
                                                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                style={{ width: '100%', border: 'none', textAlign: 'center', background: 'transparent', color: C, fontSize: '11px', outline: 'none', resize: 'none', padding: '0', height: 'auto', fontFamily: 'inherit', overflow: 'hidden', display: 'block' }}
                                            />
                                        </div>
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11.5px', padding: '0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: ROW_H, height: '100%' }}>
                                            <textarea 
                                                value={item.quantity} 
                                                onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                style={{ width: '100%', border: 'none', textAlign: 'center', background: 'transparent', color: C, fontSize: '11.5px', outline: 'none', resize: 'none', padding: '0', height: 'auto', fontFamily: 'inherit', overflow: 'hidden', display: 'block' }}
                                            />
                                        </div>
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'right', fontSize: '11.5px', padding: '0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: ROW_H, height: '100%', padding: '0 4px' }}>
                                            <input 
                                                value={formatNumber(item.unit_price)} 
                                                onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value.replace(/,/g, '')) || 0)}
                                                style={{ width: '100%', border: 'none', textAlign: 'right', background: 'transparent', color: C, fontSize: '11.5px', outline: 'none', fontWeight: 'bold' }}
                                            />
                                        </div>
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>{formatNumber((item.quantity || 0) * (item.unit_price || 0))}</td>
                                    <td style={{ ...td(C), textAlign: 'right', fontSize: '12px' }}>{formatNumber(Math.floor((item.quantity || 0) * (item.unit_price || 0) * 0.1))}</td>
                                </tr>
                            ))}
                            {emptyCount > 0 && (
                                <tr style={{ height: ROW_H }}>
                                    <td style={{ ...td(C), textAlign: 'center' }}>{"\u00A0"}</td>
                                    <td colSpan={6} style={{ ...td(C), color: '#bbb', fontSize: '11.5px', textAlign: 'center' }}>= 이하여백 =</td>
                                </tr>
                            )}
                            {Array(Math.max(0, emptyCount - 1)).fill(null).map((_, i) => (
                                <tr key={i} style={{ height: ROW_H }}>
                                    <td style={{ ...td(C) }}>{"\u00A0"}</td>
                                    <td style={{ ...td(C) }}>{"\u00A0"}</td>
                                    <td style={{ ...td(C) }}>{"\u00A0"}</td>
                                    <td style={{ ...td(C) }}>{"\u00A0"}</td>
                                    <td style={{ ...td(C) }}>{"\u00A0"}</td>
                                    <td style={{ ...td(C) }}>{"\u00A0"}</td>
                                    <td style={{ ...td(C) }}>{"\u00A0"}</td>
                                </tr>
                            ))}
                            <tr style={{ height: '60px' }}>
                                <td colSpan={7} style={{ ...td(C), padding: '4px 8px', verticalAlign: 'top' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>비고:</div>
                                    <textarea value={remarks} onChange={(e) => onRemarksChange(e.target.value)} placeholder="비고 사항을 입력하세요..." style={{ width: '100%', height: '35px', border: 'none', resize: 'none', background: 'transparent', fontSize: '11px', color: C, outline: 'none', padding: '0', fontFamily: 'inherit' }} className="tsm-remarks-textarea" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <table style={{ ...tblStyle(C), borderTop: `1.8px solid ${C}` }}>
                    <colgroup>
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '48%' }} />
                    </colgroup>
                    <tbody>
                        <tr style={{ height: '22px' }}>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>전잔금</td>
                            <td style={{ ...td(C) }}>
                                <input value={formatNumber(footerInfo.prev_balance)} onChange={e => setFooterInfo(p => ({ ...p, prev_balance: Number(e.target.value.replace(/,/g, '')) || 0 }))} style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: C, fontSize: '11px', background: 'transparent', fontWeight: 'bold' }} />
                            </td>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>합계</td>
                            <td style={{ ...td(C), textAlign: 'right', fontWeight: '900', fontSize: '13px', paddingRight: '12px', whiteSpace: 'nowrap' }}>￦{formatNumber(totalAmount)}</td>
                        </tr>
                        <tr style={{ height: '22px' }}>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>입금</td>
                            <td style={{ ...td(C) }}>
                                <input value={formatNumber(footerInfo.paid_amount)} onChange={e => setFooterInfo(p => ({ ...p, paid_amount: Number(e.target.value.replace(/,/g, '')) || 0 }))} style={{ border: 'none', width: '100%', textAlign: 'right', outline: 'none', color: C, fontSize: '11px', background: 'transparent', fontWeight: 'bold' }} />
                            </td>
                            <td style={{ ...td(C), textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>잔금</td>
                            <td style={{ ...td(C), textAlign: 'right', fontWeight: '900', fontSize: '13px', paddingRight: '15px', whiteSpace: 'nowrap' }}>
                                ￦{formatNumber(balance)}
                                <span style={{ fontSize: '10px', marginLeft: '12px', fontWeight: 'bold' }}>인수자&nbsp;</span>
                                <input value={footerInfo.receiver_name} onChange={e => setFooterInfo(p => ({ ...p, receiver_name: e.target.value }))} placeholder="성함" style={{ border: 'none', width: '60px', outline: 'none', color: C, fontSize: '11px', background: 'transparent', borderBottom: `1px solid ${C}`, textAlign: 'center', padding: '0 4px' }} />
                                <span style={{ fontSize: '11px', marginLeft: '6px', fontWeight: 'bold' }}>(인)</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div style={{ textAlign: 'center', padding: '2px 0', borderTop: `1.5px solid ${C}`, fontSize: '9.5px', fontWeight: '900', color: C }}>상기와 같이 계산합니다. 감사합니다.</div>
            </div>
        );
    };

    const [scale, setScale] = useState(1);
    const wrapRef = useRef();
    useEffect(() => {
        const calc = () => {
            if (!wrapRef.current) return;
            const availW = wrapRef.current.clientWidth - 48;
            const formNaturalW = 1122.5; 
            setScale(Math.min(1, availW / formNaturalW));
        };
        calc();
        window.addEventListener('resize', calc);
        return () => window.removeEventListener('resize', calc);
    }, [open]);

    return (
        <Modal open={open} onClose={onClose} sx={{ '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.9)' } }} slotProps={{ backdrop: { className: 'tsm-no-print' } }}>
            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '96vw', maxWidth: '1200px', maxHeight: '98vh', display: 'flex', flexDirection: 'column', bgcolor: '#ffffff', boxShadow: 24, borderRadius: 2, overflow: 'hidden' }}>
                <Box className="tsm-no-print" sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                    <span style={{ color: '#1e293b', fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}><Printer size={16} /> 거래명세서 출력 및 관리</span>
                    <IconButton onClick={onClose} sx={{ color: '#64748b' }}><X size={20} /></IconButton>
                </Box>
                <Box ref={wrapRef} sx={{ flexGrow: 1, overflowY: 'auto', p: 3, bgcolor: '#ffffff !important', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {pdfStatus === 'success' && <Alert severity="success" icon={<CheckCircle2 />} sx={{ mb: 2, borderRadius: 2, width: '100%' }}>✅ PDF 파일이 성공적으로 생성되었습니다.</Alert>}
                    {pdfStatus === 'error' && <Alert severity="error" sx={{ mb: 2, borderRadius: 2, width: '100%' }}>PDF 생성에 실패했습니다. 다시 시도해 주세요.</Alert>}
                    <div ref={printRef} className="tsm-print-container print-safe-area a4-paper-root landscape" style={{ width: '297mm', height: '210mm', boxSizing: 'border-box', overflow: 'hidden', position: 'relative', transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: `calc(210mm * ${scale} - 210mm)`, display: 'flex', flexDirection: 'row', boxShadow: '0 12px 60px rgba(0,0,0,0.5)', padding: '10mm', backgroundColor: 'white' }}>
                        {/* 좌측 폼 (500px) */}
                        <div style={{ width: '500px', flexShrink: 0, visibility: showRecipient ? 'visible' : 'hidden' }}><StatementForm color="blue" typeLabel="<공급받는자용>" remarks={remarks} onRemarksChange={setRemarks} /></div>
                        
                        {/* 중앙 절개선 (46px - 고정 픽셀) */}
                        <div style={{ width: '46px', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'stretch', visibility: (showRecipient && showSupplier) ? 'visible' : 'hidden' }}>
                            <div style={{ 
                                width: '2px', 
                                height: '100%', 
                                backgroundImage: `linear-gradient(to bottom, #666 40%, rgba(255,255,255,0) 0%)`,
                                backgroundSize: '2px 10px',
                                backgroundRepeat: 'repeat-y',
                                backgroundPosition: 'center'
                            }} />
                        </div>

                        {/* 우측 폼 (500px) */}
                        <div style={{ width: '500px', flexShrink: 0, visibility: showSupplier ? 'visible' : 'hidden' }}><StatementForm color="red" typeLabel="<공급자용>" remarks={remarks} onRemarksChange={setRemarks} /></div>
                    </div>
                </Box>
                <Box className="tsm-no-print" sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'center', gap: 3, borderTop: '1px solid #e2e8f0', bgcolor: '#f1f5f9' }}>
                    <FormControlLabel
                        control={<Checkbox checked={showRecipient} onChange={(e) => {
                            if (!e.target.checked && !showSupplier) return;
                            setShowRecipient(e.target.checked);
                        }} color="primary" />}
                        label={<span style={{ fontSize: '14px', fontWeight: 'bold' }}>공급받는자용 (좌)</span>}
                    />
                    <FormControlLabel
                        control={<Checkbox checked={showSupplier} onChange={(e) => {
                            if (!e.target.checked && !showRecipient) return;
                            setShowSupplier(e.target.checked);
                        }} color="error" />}
                        label={<span style={{ fontSize: '14px', fontWeight: 'bold' }}>공급자용 (우)</span>}
                    />
                </Box>
                <Box className="tsm-no-print" sx={{ px: 2, py: 1.5, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: 2, bgcolor: '#f8fafc', flexShrink: 0 }}>
                    <Button variant="contained" size="large" onClick={addItem} sx={{ bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }, fontWeight: 'bold', px: 3, borderRadius: 2 }}>항목 추가</Button>
                    <Button variant="contained" size="large" startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 />} onClick={handleSaveStatement} disabled={isSaving} sx={{ bgcolor: '#4f46e5', fontWeight: 'bold', px: 3, borderRadius: 2 }}>저장</Button>
                    <Button variant="contained" size="large" startIcon={isGeneratingPdf ? <CircularProgress size={16} color="inherit" /> : <FileDown />} onClick={handleDownloadPDF} disabled={isGeneratingPdf} sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 3, borderRadius: 2 }}>PDF 다운로드</Button>
                    <Button variant="contained" size="large" startIcon={<Printer />} onClick={handlePrint} sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 3, borderRadius: 2 }}>인쇄</Button>
                    <Button variant="outlined" size="large" onClick={onClose} sx={{ borderColor: '#cbd5e1', color: '#64748b', fontWeight: 'bold', px: 3, borderRadius: 2 }}>닫기</Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default TransactionStatementModal;
