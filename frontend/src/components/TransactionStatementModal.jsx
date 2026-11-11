import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Modal, Box, Button, IconButton,
    CircularProgress, Alert, Checkbox, FormControlLabel
} from '@mui/material';
import { X, Printer, FileDown, CheckCircle2, Plus, FileText, Trash2, RotateCcw } from 'lucide-react';
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

    const normalizeItemsList = useCallback((rawList, fallbackDate) => {
        return (rawList || []).map(item => ({
            date:          item.date || fallbackDate || new Date().toISOString().split('T')[0],
            product_name:  item.product?.name || item.product_name || item.item_name || '',
            specification: item.specification || item.product?.specification || '',
            quantity:      item.quantity  ?? 0,
            unit_price:    item.unit_price ?? 0,
        }));
    }, []);

    const getDefaultBaseNo = useCallback(() => {
        if (data.delivery_no) {
            return data.delivery_no.replace(/^[A-Z]+-/, '');
        }
        const today = (data.delivery_date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
        return `${today}-001`;
    }, [data.delivery_no, data.delivery_date]);

    // ── Data State (Original + Administrative Extra Statements) ────────────────
    const [activeTabId, setActiveTabId] = useState('original'); // 'original' | 'ext_...'
    const [originalDoc, setOriginalDoc] = useState({
        items: [],
        prev_balance: 0,
        paid_amount: 0,
        receiver_name: '',
        remarks: '',
    });
    const [extraStatements, setExtraStatements] = useState([]);

    // Active form fields for whichever tab is currently selected
    const [items, setItems] = useState([]);
    const [remarks, setRemarks] = useState(data.remarks || data.note || '');
    const [footerInfo, setFooterInfo] = useState({
        prev_balance: data.prev_balance || 0,
        paid_amount: data.paid_amount || 0,
        receiver_name: data.receiver_name || '',
    });

    // Header overrides for administrative statements
    const [docTitle, setDocTitle] = useState('');
    const [docDate, setDocDate] = useState('');
    const [docNo, setDocNo] = useState('');
    const [docPartnerName, setDocPartnerName] = useState('');

    // Initialize items & extra statements when modal opens
    useEffect(() => {
        if (!open) return;
        const stmtJson = data.statement_json || {};
        const rawOrigItems = stmtJson.items || data.items || data.original_delivery_items || [];
        const normalizedOrig = normalizeItemsList(rawOrigItems, data.delivery_date);
        const origObj = {
            items: normalizedOrig,
            prev_balance: stmtJson.prev_balance ?? data.prev_balance ?? 0,
            paid_amount: stmtJson.paid_amount ?? data.paid_amount ?? 0,
            receiver_name: stmtJson.receiver_name ?? data.receiver_name ?? '',
            remarks: stmtJson.remarks ?? data.remarks ?? data.note ?? '',
        };
        setOriginalDoc(origObj);

        const rawExtras = stmtJson.extra_statements || data.extra_statements || [];
        const loadedExtras = rawExtras.map((ext, idx) => ({
            id: ext.id || `ext_${idx + 1}`,
            title: ext.title || `행정용 명세서 #${idx + 1}`,
            delivery_date: ext.delivery_date || data.delivery_date || new Date().toISOString().split('T')[0],
            delivery_no: ext.delivery_no || `${getDefaultBaseNo()}-A${idx + 1}`,
            partner_name: ext.partner_name ?? (data.override_partner_name || data.partner?.name || ''),
            items: normalizeItemsList(ext.items || [], ext.delivery_date || data.delivery_date),
            prev_balance: ext.prev_balance ?? 0,
            paid_amount: ext.paid_amount ?? 0,
            receiver_name: ext.receiver_name ?? '',
            remarks: ext.remarks ?? '',
            created_at: ext.created_at || new Date().toISOString(),
        }));

        if (data.initialTabId === '__new_extra__') {
            const nextIdx = loadedExtras.length + 1;
            const newExt = {
                id: `ext_${Date.now()}`,
                title: `행정용 명세서 #${nextIdx}`,
                delivery_date: data.delivery_date || new Date().toISOString().split('T')[0],
                delivery_no: `${getDefaultBaseNo()}-A${nextIdx}`,
                partner_name: data.override_partner_name || data.partner?.name || '',
                items: JSON.parse(JSON.stringify(normalizedOrig)),
                prev_balance: origObj.prev_balance || 0,
                paid_amount: origObj.paid_amount || 0,
                receiver_name: origObj.receiver_name || '',
                remarks: origObj.remarks || '',
                created_at: new Date().toISOString(),
            };
            const updatedExtras = [...loadedExtras, newExt];
            setExtraStatements(updatedExtras);
            setActiveTabId(newExt.id);
            setItems(newExt.items);
            setRemarks(newExt.remarks);
            setFooterInfo({
                prev_balance: newExt.prev_balance,
                paid_amount: newExt.paid_amount,
                receiver_name: newExt.receiver_name,
            });
            setDocTitle(newExt.title);
            setDocDate(newExt.delivery_date);
            setDocNo(newExt.delivery_no);
            setDocPartnerName(newExt.partner_name);
            return;
        }

        setExtraStatements(loadedExtras);

        const targetExt = data.initialTabId && data.initialTabId !== 'original'
            ? loadedExtras.find(e => e.id === data.initialTabId)
            : null;

        if (targetExt) {
            setActiveTabId(targetExt.id);
            setItems(targetExt.items);
            setRemarks(targetExt.remarks);
            setFooterInfo({
                prev_balance: targetExt.prev_balance,
                paid_amount: targetExt.paid_amount,
                receiver_name: targetExt.receiver_name,
            });
            setDocTitle(targetExt.title);
            setDocDate(targetExt.delivery_date);
            setDocNo(targetExt.delivery_no);
            setDocPartnerName(targetExt.partner_name);
        } else {
            setActiveTabId('original');
            setItems(origObj.items);
            setRemarks(origObj.remarks);
            setFooterInfo({
                prev_balance: origObj.prev_balance,
                paid_amount: origObj.paid_amount,
                receiver_name: origObj.receiver_name,
            });
            setDocTitle('원본 거래명세서');
            setDocDate(data.delivery_date || '');
            setDocNo(getDefaultBaseNo());
            setDocPartnerName(data.override_partner_name || data.partner?.name || '');
        }
    }, [open, data, normalizeItemsList, getDefaultBaseNo]);

    const [supplierInfo, setSupplierInfo] = useState(data.supplier_info || {
        biz_no: '312-81-38446',
        company_name: '(주)디자인메카',
        owner_name: '조인호',
        address: '충남 아산시 음봉면 월암로 336-39',
        biz_type: '제조업',
        biz_item: '나이프,베어링',
    });
    const [showRecipient, setShowRecipient] = useState(true);
    const [showSupplier, setShowSupplier] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [pdfStatus, setPdfStatus] = useState(null);
    const [companyStampUrl, setCompanyStampUrl] = useState(null); // DB 직인 이미지 URL
    const [isSaving, setIsSaving] = useState(false);
    const printRef = useRef();

    // ── 현재 탭 편집 내용을 originalDoc / extraStatements에 동기화하는 헬퍼 ──
    const buildUpdatedDocs = useCallback(() => {
        let nextOriginal = { ...originalDoc };
        let nextExtras = extraStatements.map(ext => ({ ...ext }));

        if (activeTabId === 'original') {
            nextOriginal = {
                ...nextOriginal,
                items: JSON.parse(JSON.stringify(items)),
                prev_balance: footerInfo.prev_balance || 0,
                paid_amount: footerInfo.paid_amount || 0,
                receiver_name: footerInfo.receiver_name || '',
                remarks: remarks || '',
            };
        } else {
            nextExtras = nextExtras.map(ext => {
                if (ext.id !== activeTabId) return ext;
                return {
                    ...ext,
                    title: (docTitle || '').trim() || ext.title || '행정용 명세서',
                    delivery_date: docDate || data.delivery_date || '',
                    delivery_no: docNo || ext.delivery_no || '',
                    partner_name: docPartnerName ?? '',
                    items: JSON.parse(JSON.stringify(items)),
                    prev_balance: footerInfo.prev_balance || 0,
                    paid_amount: footerInfo.paid_amount || 0,
                    receiver_name: footerInfo.receiver_name || '',
                    remarks: remarks || '',
                };
            });
        }
        return { nextOriginal, nextExtras };
    }, [activeTabId, originalDoc, extraStatements, items, footerInfo, remarks, docTitle, docDate, docNo, docPartnerName, data.delivery_date]);

    // ── 탭 전환 ──
    const handleSelectTab = (targetTabId) => {
        if (targetTabId === activeTabId) return;
        const { nextOriginal, nextExtras } = buildUpdatedDocs();
        setOriginalDoc(nextOriginal);
        setExtraStatements(nextExtras);

        if (targetTabId === 'original') {
            setActiveTabId('original');
            setItems(nextOriginal.items);
            setRemarks(nextOriginal.remarks);
            setFooterInfo({
                prev_balance: nextOriginal.prev_balance,
                paid_amount: nextOriginal.paid_amount,
                receiver_name: nextOriginal.receiver_name,
            });
            setDocTitle('원본 거래명세서');
            setDocDate(data.delivery_date || '');
            setDocNo(getDefaultBaseNo());
            setDocPartnerName(data.override_partner_name || data.partner?.name || '');
        } else {
            const targetExt = nextExtras.find(e => e.id === targetTabId);
            if (!targetExt) return;
            setActiveTabId(targetExt.id);
            setItems(targetExt.items);
            setRemarks(targetExt.remarks);
            setFooterInfo({
                prev_balance: targetExt.prev_balance,
                paid_amount: targetExt.paid_amount,
                receiver_name: targetExt.receiver_name,
            });
            setDocTitle(targetExt.title);
            setDocDate(targetExt.delivery_date);
            setDocNo(targetExt.delivery_no);
            setDocPartnerName(targetExt.partner_name);
        }
    };

    // ── 행정처리용 추가 거래명세서 생성 ──
    const handleAddExtraStatement = () => {
        const { nextOriginal, nextExtras } = buildUpdatedDocs();
        setOriginalDoc(nextOriginal);

        const nextIdx = nextExtras.length + 1;
        const baseItems = JSON.parse(JSON.stringify(items.length > 0 ? items : nextOriginal.items));
        const newExt = {
            id: `ext_${Date.now()}`,
            title: `행정용 명세서 #${nextIdx}`,
            delivery_date: data.delivery_date || new Date().toISOString().split('T')[0],
            delivery_no: `${getDefaultBaseNo()}-A${nextIdx}`,
            partner_name: data.override_partner_name || data.partner?.name || '',
            items: baseItems,
            prev_balance: footerInfo.prev_balance || 0,
            paid_amount: footerInfo.paid_amount || 0,
            receiver_name: footerInfo.receiver_name || '',
            remarks: remarks || '',
            created_at: new Date().toISOString(),
        };

        const updatedExtras = [...nextExtras, newExt];
        setExtraStatements(updatedExtras);
        setActiveTabId(newExt.id);
        setItems(newExt.items);
        setRemarks(newExt.remarks);
        setFooterInfo({
            prev_balance: newExt.prev_balance,
            paid_amount: newExt.paid_amount,
            receiver_name: newExt.receiver_name,
        });
        setDocTitle(newExt.title);
        setDocDate(newExt.delivery_date);
        setDocNo(newExt.delivery_no);
        setDocPartnerName(newExt.partner_name);
    };

    // ── 행정처리용 추가 거래명세서 삭제 ──
    const handleDeleteExtraStatement = async (extId, e) => {
        if (e) e.stopPropagation();
        const target = extraStatements.find(x => x.id === extId);
        const label = target?.title || '행정용 명세서';
        if (!window.confirm(`'${label}' 문서를 삭제하시겠습니까?\n(원본 거래명세서는 그대로 유지됩니다.)`)) return;

        const { nextOriginal, nextExtras } = buildUpdatedDocs();
        const filteredExtras = nextExtras.filter(x => x.id !== extId);
        setOriginalDoc(nextOriginal);
        setExtraStatements(filteredExtras);

        if (activeTabId === extId) {
            setActiveTabId('original');
            setItems(nextOriginal.items);
            setRemarks(nextOriginal.remarks);
            setFooterInfo({
                prev_balance: nextOriginal.prev_balance,
                paid_amount: nextOriginal.paid_amount,
                receiver_name: nextOriginal.receiver_name,
            });
            setDocTitle('원본 거래명세서');
            setDocDate(data.delivery_date || '');
            setDocNo(getDefaultBaseNo());
            setDocPartnerName(data.override_partner_name || data.partner?.name || '');
        }

        // 서버에도 즉시 반영
        if (data.delivery_id || data.id) {
            try {
                const historyId = data.delivery_id || data.id;
                const orderId = data.order_id || data.id;
                const origSupply = (nextOriginal.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
                const origTax = (nextOriginal.items || []).reduce((s, i) => s + Math.floor((i.quantity || 0) * (i.unit_price || 0) * 0.1), 0);
                const extrasWithTotals = filteredExtras.map(ext => {
                    const s = (ext.items || []).reduce((acc, i) => acc + (i.quantity || 0) * (i.unit_price || 0), 0);
                    const t = (ext.items || []).reduce((acc, i) => acc + Math.floor((i.quantity || 0) * (i.unit_price || 0) * 0.1), 0);
                    return { ...ext, totalSupply: s, totalTax: t, totalAmount: s + t };
                });
                await api.put(`/sales/orders/${orderId}/delivery/${historyId}`, {
                    statement_json: {
                        ...(data.statement_json || {}),
                        items: nextOriginal.items,
                        totalSupply: origSupply,
                        totalTax: origTax,
                        totalAmount: origSupply + origTax,
                        prev_balance: nextOriginal.prev_balance,
                        paid_amount: nextOriginal.paid_amount,
                        receiver_name: nextOriginal.receiver_name,
                        remarks: nextOriginal.remarks,
                        extra_statements: extrasWithTotals,
                    }
                });
                if (onSuccess) onSuccess();
            } catch (err) {
                console.error('Failed to persist extra statement deletion:', err);
            }
        }
    };

    // ── 행정용 명세서에 원본 품목 다시 불러오기 ──
    const handleResetFromOriginal = () => {
        if (!window.confirm('현재 행정용 명세서의 품목 내역을 원본 거래명세서 품목으로 초기화하시겠습니까?')) return;
        setItems(JSON.parse(JSON.stringify(originalDoc.items)));
    };

    // ── Resizable Columns State & Logic ─────────────────────── (localStorage 유지)
    const [colWidths, setColWidths] = useState(() => {
        try {
            const saved = localStorage.getItem('tsm_col_widths');
            if (saved) return JSON.parse(saved);
        } catch {}
        return { date: 35, name: 160, spec: 75, qty: 35, price: 60, supply: 65, tax: 50 };
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
        // localStorage에 저장
        setColWidths(prev => {
            try { localStorage.setItem('tsm_col_widths', JSON.stringify(prev)); } catch {}
            return prev;
        });
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
        const defaultDate = (activeTabId === 'original' ? data.delivery_date : docDate) || new Date().toISOString().split('T')[0];
        setItems(prev => [...prev, {
            date: defaultDate,
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
            const orderId = data.order_id || data.id;

            const { nextOriginal, nextExtras } = buildUpdatedDocs();
            setOriginalDoc(nextOriginal);
            setExtraStatements(nextExtras);

            const origSupply = (nextOriginal.items || []).reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
            const origTax = (nextOriginal.items || []).reduce((s, i) => s + Math.floor((i.quantity || 0) * (i.unit_price || 0) * 0.1), 0);
            const origAmount = origSupply + origTax;

            const extrasWithTotals = nextExtras.map(ext => {
                const s = (ext.items || []).reduce((acc, i) => acc + (i.quantity || 0) * (i.unit_price || 0), 0);
                const t = (ext.items || []).reduce((acc, i) => acc + Math.floor((i.quantity || 0) * (i.unit_price || 0) * 0.1), 0);
                return {
                    ...ext,
                    totalSupply: s,
                    totalTax: t,
                    totalAmount: s + t,
                };
            });

            const payload = {
                statement_json: {
                    ...(data.statement_json || {}),
                    items: nextOriginal.items,
                    totalSupply: origSupply,
                    totalTax: origTax,
                    totalAmount: origAmount,
                    prev_balance: nextOriginal.prev_balance,
                    paid_amount: nextOriginal.paid_amount,
                    receiver_name: nextOriginal.receiver_name,
                    remarks: nextOriginal.remarks,
                    extra_statements: extrasWithTotals,
                }
            };
 
            await api.put(`/sales/orders/${orderId}/delivery/${historyId}`, payload);
            alert(activeTabId === 'original'
                ? "원본 거래명세서 정보가 저장되었습니다."
                : `행정처리용 거래명세서(${docTitle || '추가 명세서'})가 저장되었습니다.\n※ 결산자료 및 재고에는 반영되지 않습니다.`);
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
    const totalTax = items.reduce((s, i) => s + Math.floor((i.quantity || 0) * (i.unit_price || 0) * 0.1), 0);
    const totalAmount = totalSupply + totalTax;
    const balance = (footerInfo.prev_balance + totalAmount) - footerInfo.paid_amount;

    const ROWS = 12;

    const effectiveDocNo = activeTabId === 'original' ? getDefaultBaseNo() : (docNo || getDefaultBaseNo());
    const effectiveDocDate = activeTabId === 'original' ? (data.delivery_date || '') : (docDate || data.delivery_date || '');
    const effectivePartnerName = activeTabId === 'original'
        ? (data.override_partner_name || data.partner?.name || '')
        : (docPartnerName !== undefined ? docPartnerName : (data.override_partner_name || data.partner?.name || ''));

    // ── PDF 다운로드 ────────────────────────────
    const handleDownloadPDF = async () => {
        if (!printRef.current) return;
        setIsGeneratingPdf(true);
        try {
            const partnerName = effectivePartnerName || '고객사';
            const firstItemName = items[0]?.product?.name || items[0]?.product_name || items[0]?.item_name || '품명';
            const extraCount = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
            const deliveryDate = effectiveDocDate || '날짜';
            const suffix = activeTabId === 'original' ? '' : `-${docTitle || '행정용'}`;
            const fileName = `거래명세서-${partnerName}-${firstItemName}${extraCount}-${deliveryDate}${suffix}.pdf`;
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
                    /* 세로 중앙정렬 강제 */
                    .tsm-form-paper td { vertical-align: middle !important; }
                    .tsm-form-paper textarea { vertical-align: middle; }
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
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '13px', fontWeight: 'bold', color: C }}>
                                {effectiveDocNo}
                            </div>
                        </div>
                        <div style={{ display: 'flex', height: '22px', borderBottom: `1.5px solid ${C}` }}>
                            <div style={{ width: '40px', borderRight: `1.5px solid ${C}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: C }}>일자</div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '12px', color: C }}>
                                {effectiveDocDate}
                            </div>
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
                                    {effectivePartnerName}
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

                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px', verticalAlign: 'middle' }}>
                                        <textarea 
                                            rows={1}
                                            value={(item.date || effectiveDocDate || '').replace(/^(\d{4})-/, '')} 
                                            onChange={e => {
                                                // 사용자는 MM-DD 형식으로 입력, 저장은 YYYY-MM-DD 형식 유지
                                                const origDate = item.date || effectiveDocDate || '';
                                                const year = origDate.match(/^\d{4}/) 
                                                    ? origDate.slice(0, 4) 
                                                    : new Date().getFullYear().toString();
                                                const userVal = e.target.value; // e.g. "06-20"
                                                // 완전한 YYYY-MM-DD로 복원하여 저장
                                                updateItem(idx, 'date', `${year}-${userVal}`);
                                            }}
                                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                            style={{ width: '100%', border: 'none', textAlign: 'center', background: 'transparent', color: C, fontSize: '11px', outline: 'none', resize: 'none', padding: '0', height: 'auto', fontFamily: 'inherit', overflow: 'hidden', verticalAlign: 'middle' }}
                                        />
                                    </td>

                                    <td style={{ ...td(C, { whiteSpace: 'normal', wordBreak: 'break-all' }), fontWeight: 'bold', fontSize: '11.5px', position: 'relative', verticalAlign: 'middle' }}>
                                        <textarea 
                                            rows={1}
                                            value={item.product_name || ''} 
                                            onChange={e => updateItem(idx, 'product_name', e.target.value)}
                                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                            style={{ width: '100%', border: 'none', background: 'transparent', color: C, fontSize: '11.5px', fontWeight: 'bold', outline: 'none', resize: 'none', padding: '0 4px', height: 'auto', fontFamily: 'inherit', overflow: 'hidden', verticalAlign: 'middle' }}
                                        />
                                        <button 
                                            onClick={() => removeItem(idx)}
                                            className="tsm-no-print"
                                            style={{ position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', padding: '2px 4px', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s' }}
                                        >삭제</button>
                                        <style>{`.tsm-item-row:hover button { opacity: 0.8 !important; }`}</style>
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'center', fontSize: '11px', verticalAlign: 'middle' }}>
                                        <textarea 
                                            rows={1}
                                            value={item.specification || ''} 
                                            onChange={e => updateItem(idx, 'specification', e.target.value)}
                                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                            style={{ width: '100%', border: 'none', textAlign: 'center', background: 'transparent', color: C, fontSize: '11px', outline: 'none', resize: 'none', padding: '0', height: 'auto', fontFamily: 'inherit', overflow: 'hidden', verticalAlign: 'middle' }}
                                        />
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'right', fontSize: '11.5px', verticalAlign: 'middle' }}>
                                        <input 
                                            value={formatNumber(item.quantity)} 
                                            onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value.replace(/,/g, '')) || 0)}
                                            style={{ width: '100%', border: 'none', textAlign: 'right', background: 'transparent', color: C, fontSize: '11.5px', outline: 'none', verticalAlign: 'middle', padding: '0 4px' }}
                                        />
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'right', fontSize: '11.5px', verticalAlign: 'middle' }}>
                                        <input 
                                            value={formatNumber(item.unit_price)} 
                                            onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value.replace(/,/g, '')) || 0)}
                                            style={{ width: '100%', border: 'none', textAlign: 'right', background: 'transparent', color: C, fontSize: '11.5px', outline: 'none', fontWeight: 'bold', verticalAlign: 'middle' }}
                                        />
                                    </td>
                                    <td style={{ ...td(C), textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>{formatNumber((item.quantity || 0) * (item.unit_price || 0))}</td>
                                    <td style={{ ...td(C), textAlign: 'right', fontSize: '12px' }}>{formatNumber(Math.floor((item.quantity || 0) * (item.unit_price || 0) * 0.1))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* 이하여백 - flex:1로 렌더링 영역을 동적으로 채움 */}
                    {items.length >= ROWS && (
                        <div style={{ borderLeft: `1.5px solid ${C}`, borderRight: `1.5px solid ${C}`, borderTop: 'none', borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, height: '24px' }}>
                            <span style={{ color: '#bbb', fontSize: '11.5px' }}>= 이하여백 =</span>
                        </div>
                    )}
                    {items.length < ROWS && (
                        <div style={{ flex: 1, borderLeft: `1.5px solid ${C}`, borderRight: `1.5px solid ${C}`, borderTop: 'none', borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '24px' }}>
                            <span style={{ color: '#bbb', fontSize: '11.5px' }}>= 이하여백 =</span>
                        </div>
                    )}
                    {/* 품목테이블 최하단 공급가액/세액 합계 행 */}
                    <table style={{ ...tblStyle(C), tableLayout: 'fixed', width: '100%', flexShrink: 0 }}>
                        <colgroup>
                            <col style={{ width: colWidths.date }} />
                            <col style={{ width: colWidths.name }} />
                            <col style={{ width: colWidths.spec }} />
                            <col style={{ width: colWidths.qty }} />
                            <col style={{ width: colWidths.price }} />
                            <col style={{ width: colWidths.supply }} />
                            <col style={{ width: colWidths.tax }} />
                        </colgroup>
                        <tbody>
                            <tr style={{ backgroundColor: 'rgba(0,0,0,0.03)', height: '24px' }}>
                                <td
                                    colSpan={5}
                                    style={{
                                        ...td(C),
                                        width: colWidths.date + colWidths.name + colWidths.spec + colWidths.qty + colWidths.price,
                                        textAlign: 'center',
                                        fontWeight: '900',
                                        fontSize: '11.5px',
                                        letterSpacing: '4px'
                                    }}
                                >
                                    합계
                                </td>
                                <td
                                    style={{
                                        ...td(C),
                                        width: colWidths.supply,
                                        textAlign: 'right',
                                        fontWeight: '900',
                                        fontSize: '12px'
                                    }}
                                >
                                    {formatNumber(totalSupply)}
                                </td>
                                <td
                                    style={{
                                        ...td(C),
                                        width: colWidths.tax,
                                        textAlign: 'right',
                                        fontWeight: '900',
                                        fontSize: '12px'
                                    }}
                                >
                                    {formatNumber(totalTax)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                {/* 비고 - 상승하는 items table 밖, 항상 하단 고정 */}
                <div style={{ border: `1.5px solid ${C}`, borderTop: 'none', padding: '4px 8px', height: '60px', flexShrink: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px', color: C }}>비고:</div>
                    <textarea value={remarks} onChange={(e) => onRemarksChange(e.target.value)} placeholder="비고 사항을 입력하세요..." style={{ width: '100%', height: '35px', border: 'none', resize: 'none', background: 'transparent', fontSize: '11px', color: C, outline: 'none', padding: '0', fontFamily: 'inherit' }} className="tsm-remarks-textarea" />
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
                                <input value={footerInfo.receiver_name} onChange={e => setFooterInfo(p => ({ ...p, receiver_name: e.target.value }))} style={{ border: 'none', width: '60px', outline: 'none', color: C, fontSize: '11px', background: 'transparent', borderBottom: `1px solid ${C}`, textAlign: 'center', padding: '0 4px' }} />
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
            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '96vw', maxWidth: '1220px', maxHeight: '98vh', display: 'flex', flexDirection: 'column', bgcolor: '#ffffff', boxShadow: 24, borderRadius: 2, overflow: 'hidden' }}>
                {/* 상단 헤더 */}
                <Box className="tsm-no-print" sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#1e293b', fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Printer size={16} /> 거래명세서 출력 및 관리
                        </span>
                        {activeTabId !== 'original' && (
                            <span style={{ backgroundColor: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', borderRadius: '999px', padding: '2px 10px', fontSize: '11px', fontWeight: 800 }}>
                                🔒 행정처리용 추가 명세서 (결산·매출·재고 미반영)
                            </span>
                        )}
                    </div>
                    <IconButton onClick={onClose} sx={{ color: '#64748b' }}><X size={20} /></IconButton>
                </Box>

                {/* 원본 / 행정처리용 추가 명세서 탭 바 */}
                <Box className="tsm-no-print" sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0', bgcolor: '#f1f5f9', flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={() => handleSelectTab('original')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            border: activeTabId === 'original' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            backgroundColor: activeTabId === 'original' ? '#eff6ff' : '#ffffff',
                            color: activeTabId === 'original' ? '#1d4ed8' : '#475569',
                            boxShadow: activeTabId === 'original' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
                        }}
                    >
                        <FileText size={14} /> 원본 거래명세서
                    </button>

                    {extraStatements.map((ext, idx) => {
                        const isSelected = activeTabId === ext.id;
                        const labelText = isSelected ? (docTitle || ext.title || `행정용 #${idx + 1}`) : (ext.title || `행정용 #${idx + 1}`);
                        return (
                            <div
                                key={ext.id}
                                onClick={() => handleSelectTab(ext.id)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '5px 10px 5px 12px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    border: isSelected ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                                    backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                                    color: isSelected ? '#6d28d9' : '#475569',
                                    boxShadow: isSelected ? '0 1px 3px rgba(124,58,237,0.2)' : 'none',
                                }}
                            >
                                <span>📑 {labelText}</span>
                                <span
                                    onClick={(e) => handleDeleteExtraStatement(ext.id, e)}
                                    title="이 행정용 명세서 삭제"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '4px',
                                        color: '#ef4444',
                                        marginLeft: '2px',
                                    }}
                                >
                                    <Trash2 size={12} />
                                </span>
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={handleAddExtraStatement}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            border: '1px dashed #7c3aed',
                            backgroundColor: '#faf5ff',
                            color: '#7c3aed',
                            marginLeft: '4px',
                        }}
                    >
                        <Plus size={14} /> 행정처리용 명세서 추가 (결산 미반영)
                    </button>
                </Box>

                {/* 행정처리용 추가 명세서 활성 시 상단 메타 편집 바 */}
                {activeTabId !== 'original' && (
                    <Box className="tsm-no-print" sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderBottom: '1px solid #e9d5ff', bgcolor: '#faf5ff', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: '#6b21a8' }}>구분 별칭(메모):</label>
                            <input
                                type="text"
                                value={docTitle}
                                onChange={(e) => setDocTitle(e.target.value)}
                                placeholder="예: 거래처 요청 품명변경분"
                                style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #c084fc', backgroundColor: '#fff', color: '#1e293b', fontWeight: 700, width: '180px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: '#6b21a8' }}>발행일자:</label>
                            <input
                                type="date"
                                value={docDate}
                                onChange={(e) => setDocDate(e.target.value)}
                                style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#1e293b', fontWeight: 700 }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: '#6b21a8' }}>문서번호(No.):</label>
                            <input
                                type="text"
                                value={docNo}
                                onChange={(e) => setDocNo(e.target.value)}
                                style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#1e293b', fontWeight: 700, width: '135px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: '#6b21a8' }}>공급받는자(귀하):</label>
                            <input
                                type="text"
                                value={docPartnerName}
                                onChange={(e) => setDocPartnerName(e.target.value)}
                                style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#1e293b', fontWeight: 700, width: '160px' }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleResetFromOriginal}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                color: '#475569',
                                marginLeft: 'auto',
                            }}
                        >
                            <RotateCcw size={12} /> 원본 품목 다시 불러오기
                        </button>
                    </Box>
                )}

                <Box ref={wrapRef} sx={{ flexGrow: 1, overflowY: 'auto', p: 3, bgcolor: '#ffffff !important', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {pdfStatus === 'success' && <Alert severity="success" icon={<CheckCircle2 />} sx={{ mb: 2, borderRadius: 2, width: '100%' }}>✅ PDF 파일이 성공적으로 생성되었습니다.</Alert>}
                    {pdfStatus === 'error' && <Alert severity="error" sx={{ mb: 2, borderRadius: 2, width: '100%' }}>PDF 생성에 실패했습니다. 다시 시도해 주세요.</Alert>}
                    <div ref={printRef} className="tsm-print-container print-safe-area a4-paper-root landscape" style={{ width: '297mm', height: '210mm', boxSizing: 'border-box', overflow: 'hidden', position: 'relative', transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: `calc(210mm * ${scale} - 210mm)`, display: 'flex', flexDirection: 'row', boxShadow: '0 12px 60px rgba(0,0,0,0.5)', padding: '10mm', backgroundColor: 'white' }}>
                        {/* 좌측 폼 (500px) */}
                        <div style={{ width: '500px', flexShrink: 0, visibility: showRecipient ? 'visible' : 'hidden' }}>{StatementForm({ color: 'blue', typeLabel: '<공급받는자용>', remarks, onRemarksChange: setRemarks })}</div>
                        
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
                        <div style={{ width: '500px', flexShrink: 0, visibility: showSupplier ? 'visible' : 'hidden' }}>{StatementForm({ color: 'red', typeLabel: '<공급자용>', remarks, onRemarksChange: setRemarks })}</div>
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
                    <Button variant="contained" size="large" startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 />} onClick={handleSaveStatement} disabled={isSaving} sx={{ bgcolor: activeTabId === 'original' ? '#4f46e5' : '#7c3aed', fontWeight: 'bold', px: 3, borderRadius: 2 }}>
                        {activeTabId === 'original' ? '원본 명세서 저장' : '행정용 명세서 저장'}
                    </Button>
                    <Button variant="contained" size="large" startIcon={isGeneratingPdf ? <CircularProgress size={16} color="inherit" /> : <FileDown />} onClick={handleDownloadPDF} disabled={isGeneratingPdf} sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 3, borderRadius: 2 }}>PDF 다운로드</Button>
                    <Button variant="contained" size="large" startIcon={<Printer />} onClick={handlePrint} sx={{ bgcolor: '#2563eb', fontWeight: 'bold', px: 3, borderRadius: 2 }}>인쇄</Button>
                    <Button variant="outlined" size="large" onClick={onClose} sx={{ borderColor: '#cbd5e1', color: '#64748b', fontWeight: 'bold', px: 3, borderRadius: 2 }}>닫기</Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default TransactionStatementModal;
