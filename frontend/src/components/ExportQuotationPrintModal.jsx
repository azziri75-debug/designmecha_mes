import React, { useRef, useState, useEffect } from 'react';
import { X, Printer, Download } from 'lucide-react';
import api from '../lib/api';

/**
 * 수출 견적서 인쇄 모달
 * - 첨부 이미지(QUOTATION) 양식 그대로 재현
 * - PDF 다운로드 / 인쇄 기능 포함
 */
const ExportQuotationPrintModal = ({ isOpen, onClose, estimate }) => {
    const printRef = useRef(null);
    const [stampUrl, setStampUrl] = useState(null);

    useEffect(() => {
        if (isOpen) {
            api.get('/basics/staff/').then(res => {
                // 직책에 '대표'가 포함된 사원의 stamp_image 사용
                const ceo = (res.data || []).find(s =>
                    s.role && (s.role.includes('대표') || s.role.toLowerCase().includes('ceo') || s.role.toLowerCase().includes('president'))
                );
                const raw = ceo?.stamp_image?.url;
                if (raw) {
                    // http(s):// → 그대로, /로 시작 → 그대로, 나머지 → / 추가
                    const resolved = raw.startsWith('http') || raw.startsWith('/') ? raw : `/${raw}`;
                    setStampUrl(resolved);
                }
            }).catch(() => {});
        }
    }, [isOpen]);

    if (!isOpen || !estimate) return null;

    const terms = estimate.export_terms || {};
    const items = estimate.items || [];
    const freight = estimate.freight || 0;
    const subTotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const total = subTotal + freight;

    const fmtUSD = (v) =>
        Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const handlePrint = () => {
        const win = window.open('', '_blank');
        const content = printRef.current?.innerHTML || '';
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8" />
                <title>QUOTATION - ${estimate.offer_no || ''}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; background: #fff; }
                    .page { width: 210mm; min-height: 297mm; padding: 20mm 18mm; margin: 0 auto; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #000; padding: 3px 6px; font-size: 9pt; }
                    .no-border td, .no-border th { border: none; }
                    @media print {
                        body { margin: 0; }
                        .no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>${content}</body>
            </html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 400);
    };

    const TERM_INCOTERMS = terms.incoterms || 'FOB';

    // Terms rows
    const termRows = [
        ['Origin', terms.origin || 'KOREA'],
        ['Packing', terms.packing || 'Wooden Box'],
        ['Terms', `${TERM_INCOTERMS}${terms.incoterms_other ? ` (${terms.incoterms_other})` : ''}`],
        ['Shipment', terms.shipment || ''],
        ['Shipping Port', terms.shipping_port || 'INCHEON'],
        ['Destination', terms.destination || ''],
        ['Payment', terms.payment || ''],
        ['Bank Name', terms.bank_name || 'KOOKMIN BANK'],
        ['Bank Address', terms.bank_address || ''],
        ['Account No.', terms.account_no || ''],
        ['SWIFT Code', terms.swift_code || 'CZNBKRSE'],
        ['Validity', terms.validity || 'Two weeks from the date of issue'],
        ['Remarks', terms.remarks || 'VAT is NOT included.'],
        ['Contacts', terms.contacts || 'clkjh@designmecha.co.kr  +82-10-9510-4767'],
    ];

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center overflow-y-auto py-4">
            {/* 컨트롤 바 */}
            <div className="no-print fixed top-4 right-4 flex gap-2 z-[101]">
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium shadow-lg"
                >
                    <Printer className="w-4 h-4" /> 인쇄 / PDF
                </button>
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm shadow-lg"
                >
                    <X className="w-4 h-4" /> 닫기
                </button>
            </div>

            {/* A4 용지 미리보기 */}
            <div
                ref={printRef}
                className="bg-white shadow-2xl"
                style={{
                    width: '210mm',
                    minHeight: '297mm',
                    padding: '20mm 18mm',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '10pt',
                    color: '#000',
                    marginTop: '48px',
                }}
            >
                {/* ── 헤더 ── */}
                <table style={{ borderCollapse: 'collapse', width: '100%', border: 'none' }}>
                    <tbody>
                        <tr>
                            <td style={{ border: 'none', verticalAlign: 'top' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '13pt' }}>DESIGNMECHA CO., LTD.</div>
                                <div style={{ fontSize: '8pt', marginTop: '2px' }}>
                                    336-35 Woram-ro, Eumbong-myeon, Asan-si, Chungcheongnam-do, Korea
                                </div>
                                <div style={{ fontSize: '8pt' }}>Tel 82-41-544-6220  FAX: 82-41-544-6207</div>
                            </td>
                            <td style={{ border: 'none', textAlign: 'right', verticalAlign: 'top' }}>
                                <div style={{ fontSize: '9pt' }}>CONFIDENTIAL</div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── QUOTATION 제목 ── */}
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16pt', textDecoration: 'underline', margin: '10px 0 12px' }}>
                    QUOTATION
                </div>

                {/* ── Messrs / Offer No / Date / Ref No ── */}
                <table style={{ borderCollapse: 'collapse', width: '100%', border: 'none', marginBottom: '8px' }}>
                    <tbody>
                        <tr>
                            <td style={{ border: 'none', width: '55%', verticalAlign: 'top' }}>
                                <span style={{ fontWeight: 'bold' }}>Messrs.</span>&nbsp;&nbsp;
                                <span>{estimate.messrs || estimate.partner?.name || ''}</span>
                            </td>
                            <td style={{ border: 'none', verticalAlign: 'top', fontSize: '9pt' }}>
                                <table style={{ borderCollapse: 'collapse', border: 'none' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ border: 'none', paddingRight: '6px' }}>Offer No.</td>
                                            <td style={{ border: 'none' }}>: {estimate.offer_no || ''}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ border: 'none', paddingRight: '6px' }}>Date</td>
                                            <td style={{ border: 'none' }}>: {estimate.estimate_date || ''}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── 인사말 ── */}
                <div style={{ fontSize: '8.5pt', marginBottom: '6px' }}>
                    We are pleased to offer the under-mentioned article(s) as per conditions and details described as follows.
                </div>

                {/* ── 품목 테이블 ── */}
                <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '8px', fontSize: '9pt' }}>
                    <thead>
                        <tr style={{ background: '#f0f0f0' }}>
                            <th style={{ border: '1px solid #000', padding: '3px 6px', width: '7%', textAlign: 'center' }}>No.</th>
                            <th style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'left' }}>Commodity &amp; Description</th>
                            <th style={{ border: '1px solid #000', padding: '3px 6px', width: '12%', textAlign: 'center' }}>Quantity</th>
                            <th style={{ border: '1px solid #000', padding: '3px 6px', width: '18%', textAlign: 'center' }}>Unit Price(USD)</th>
                            <th style={{ border: '1px solid #000', padding: '3px 6px', width: '18%', textAlign: 'center' }}>Amount(USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => (
                            <tr key={idx}>
                                <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center' }}>
                                    {idx + 1}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px' }}>
                                    <div style={{ fontWeight: 'bold' }}>
                                        {item.product?.name || item.product_name || ''}
                                    </div>
                                    {(item.product?.specification || item.specification) && (
                                        <div style={{ fontSize: '8.5pt', color: '#333' }}>
                                            - {item.product?.specification || item.specification}
                                        </div>
                                    )}
                                    {item.note && (
                                        <div style={{ fontSize: '8.5pt', color: '#333' }}>- {item.note}</div>
                                    )}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center' }}>
                                    {item.quantity}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right' }}>
                                    {fmtUSD(item.unit_price)}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right' }}>
                                    {fmtUSD(item.quantity * item.unit_price)}
                                </td>
                            </tr>
                        ))}
                        {/* 빈 행 (여백) */}
                        {[...Array(Math.max(0, 4 - items.length))].map((_, i) => (
                            <tr key={`empty-${i}`}>
                                <td style={{ border: '1px solid #000', padding: '3px 6px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                                <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right', color: '#999' }}>-</td>
                            </tr>
                        ))}
                        {/* Sub Total */}
                        <tr>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: 'bold' }}>Sub Total</td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right' }}>
                                {fmtUSD(subTotal)}
                            </td>
                        </tr>
                        {/* Freight */}
                        <tr>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: 'bold' }}>Freight</td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right' }}>
                                {freight > 0 ? fmtUSD(freight) : '-'}
                            </td>
                        </tr>
                        {/* Total */}
                        <tr style={{ fontWeight: 'bold' }}>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px', fontWeight: 'bold' }}>Total</td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
                            <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right', fontWeight: 'bold', fontSize: '10.5pt' }}>
                                {fmtUSD(total)}
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── Terms 섹션 ── */}
                <table style={{ borderCollapse: 'collapse', width: '100%', border: 'none', fontSize: '9pt', marginTop: '10px' }}>
                    <tbody>
                        {termRows.map(([label, value], i) => (
                            <tr key={i}>
                                <td style={{ border: 'none', width: '100px', paddingBottom: '2px', verticalAlign: 'top', fontWeight: label === 'Accepted By' || label === 'Contacts' ? 'bold' : 'normal', color: label === 'Contacts' ? '#1a56db' : 'inherit' }}>
                                    {label}
                                </td>
                                <td style={{ border: 'none', paddingBottom: '2px', verticalAlign: 'top', color: label === 'Contacts' ? '#1a56db' : 'inherit' }}>
                                    {label === 'Payment' ? (
                                        <span>: <strong>{value}</strong></span>
                                    ) : label === 'Terms' ? (
                                        <span>: Ex-work ({TERM_INCOTERMS === 'Ex-work' ? 'O' : ' '})  FOB ({TERM_INCOTERMS === 'FOB' ? 'O' : ' '})  CIF ({TERM_INCOTERMS === 'CIF' ? 'O' : ' '})  Others ({TERM_INCOTERMS === 'Others' ? 'O' : ' '})</span>
                                    ) : (
                                        <span>: {value}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* ── 서명 섹션 ── */}
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ textAlign: 'center', minWidth: '200px' }}>
                        <div style={{ fontSize: '9pt', marginBottom: '4px' }}>Very Truly Yours,</div>
                        <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '2px' }}>DESIGNMECHA CO., LTD.</div>
                        <div style={{
                            borderBottom: '1px solid #000',
                            width: '180px',
                            height: '60px',
                            margin: '4px auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            {stampUrl ? (
                                <img
                                    src={stampUrl}
                                    alt="signature"
                                    style={{ maxHeight: '55px', maxWidth: '170px', objectFit: 'contain', opacity: 0.9 }}
                                />
                            ) : (
                                <span style={{ fontSize: '8pt', color: '#aaa' }}>( Signature )</span>
                            )}
                        </div>
                        <div style={{ fontSize: '9pt', fontWeight: 'bold' }}>{terms.accepted_by || 'IN HO, CHO'}</div>
                        <div style={{ fontSize: '8.5pt' }}>President &amp; CEO</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportQuotationPrintModal;
