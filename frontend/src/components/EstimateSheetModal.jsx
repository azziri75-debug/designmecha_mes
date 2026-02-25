import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn } from '../lib/utils';

const numberToKorean = (num) => {
    const units = ['', '만', '억', '조'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const positions = ['', '십', '백', '천'];
    let result = '';
    let numStr = (num || 0).toString();

    const parts = [];
    while (numStr.length > 0) {
        parts.push(numStr.substring(numStr.length - 4));
        numStr = numStr.substring(0, numStr.length - 4);
    }

    for (let i = 0; i < parts.length; i++) {
        let partResult = '';
        let part = parts[i].padStart(4, '0');
        for (let j = 0; j < 4; j++) {
            let d = parseInt(part[j]);
            if (d > 0) {
                partResult += digits[d] + positions[3 - j];
            }
        }
        if (partResult !== '') {
            result = partResult + units[i] + result;
        }
    }
    return result ? `일금 ${result}원정` : '일금 영원정';
};

const EstimateSheetModal = ({ isOpen, onClose, estimate, onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);

    const [metadata, setMetadata] = useState({
        title: "견 적 서",
        recipient: "",
        estimate_date: "",
        company_reg_no: "312-81-38446",
        company_name: "디자인메카",
        company_ceo: "조인호",
        company_address: "충남 아산시 음봉면 월암로 336-39\n(www.designmecha.co.kr)",
        company_contact: "TEL : 041-544-6220 / FAX : 041-544-6207\n(E-mail : juno@designmecha.co.kr)",
        colWidths: [35, 200, 140, 45, 85, 95, 60],
        items: []
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && estimate) {
            fetchCompany();
            initializeMetadata();
        }
    }, [isOpen, estimate]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) { console.error('Failed to fetch company', err); }
    };

    const initializeMetadata = () => {
        if (!estimate) return;
        const items = (estimate.items || []).map((item, idx) => ({
            idx: idx + 1,
            name: item.product?.name || "",
            spec: item.product?.specification || item.product?.code || "",
            qty: item.quantity,
            price: item.unit_price || 0,
            total: item.quantity * (item.unit_price || 0),
            note: item.note || ""
        }));

        while (items.length < 15) {
            items.push({ idx: "", name: "", spec: "", qty: "", price: "", total: "", note: "" });
        }

        const total = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

        setMetadata(prev => ({
            ...prev,
            title: "견 적 서",
            recipient: (estimate.partner?.name || "") + (estimate.manager_name ? " " + estimate.manager_name : ""),
            estimate_date: estimate.estimate_date || new Date().toISOString().split('T')[0].replace(/-/g, '. '),
            total_amount_text: numberToKorean(total),
            notes: estimate.note || "1) 납기 : 발주 후 15일 이내",
            company_reg_no: company?.business_no || "312-81-38446",
            company_name: company?.name || "디자인메카",
            company_ceo: company?.ceo_name || "조인호",
            company_address: (company?.address || "충남 아산시 음봉면 월암로 336-39") + (company?.website ? `\n(${company.website})` : "\n(www.designmecha.co.kr)"),
            company_contact: `TEL : ${company?.phone || '041-544-6220'} / FAX : ${company?.fax || '041-544-6207'}\n(E-mail : ${company?.email || 'juno@designmecha.co.kr'})`,
            items: items
        }));
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const updateItem = (rIdx, key, val) => {
        const newItems = [...metadata.items];
        newItems[rIdx][key] = val;
        if (key === 'qty' || key === 'price') {
            const q = parseFloat(newItems[rIdx].qty) || 0;
            const p = parseFloat(newItems[rIdx].price) || 0;
            newItems[rIdx].total = q * p;
            const newTotal = newItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
            handleMetaChange('total_amount_text', numberToKorean(newTotal));
        }
        setMetadata(prev => ({ ...prev, items: newItems }));
    };

    const fmt = (n) => typeof n === 'number' ? n.toLocaleString() : n;

    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const images = sheetRef.current.getElementsByTagName('img');
            await Promise.all(Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
            }));

            const canvas = await html2canvas(sheetRef.current, {
                scale: 3,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: true,
                windowWidth: 794,
                windowHeight: 1123,
                onclone: (clonedDoc) => {
                    const style = clonedDoc.createElement('style');
                    style.innerHTML = `
                            * {
                                color-scheme: light !important;
                                -webkit-print-color-adjust: exact !important;
                                --oklch-none: 0 0 0;
                            }
                            body, div, p, span, table, td, th {
                                font-family: "Malgun Gothic", sans-serif !important;
                            }
                            .bg-white { background-color: #ffffff !important; }
                            .text-black { color: #000000 !important; }
                            :root {
                                --color-white: #ffffff !important;
                                --color-black: #000000 !important;
                            }
                        `;
                    clonedDoc.head.appendChild(style);

                    // Robust CSS Cleansing for all styles including CSS Variables
                    try {
                        const styleSheets = clonedDoc.styleSheets;
                        for (let i = 0; i < styleSheets.length; i++) {
                            const sheet = styleSheets[i];
                            try {
                                const rules = sheet.cssRules || sheet.rules;
                                for (let j = 0; j < rules.length; j++) {
                                    const rule = rules[j];
                                    if (rule.style && rule.style.cssText.includes('oklch')) {
                                        rule.style.cssText = rule.style.cssText.replace(/oklch\([^)]+\)/g, '#000000');
                                    }
                                }
                            } catch (e) { /* ignore cross-origin */ }
                        }
                    } catch (e) { console.error("CSS Cleansing error:", e); }

                    const allElems = clonedDoc.getElementsByTagName("*");
                    for (let i = 0; i < allElems.length; i++) {
                        const node = allElems[i];
                        if (node.style) {
                            if (node.style.color?.includes('oklch')) node.style.color = '#000000';
                            if (node.style.backgroundColor?.includes('oklch')) node.style.backgroundColor = '#ffffff';
                            if (node.style.borderColor?.includes('oklch')) node.style.borderColor = '#000000';
                        }
                    }
                }
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            const fileName = `estimate_${estimate.id}_${Date.now()}.pdf`;

            if (action === 'download') {
                pdf.save(fileName);
            } else {
                const blob = pdf.output('blob');
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

                let currentAttachments = [];
                try { if (estimate.attachment_file) currentAttachments = typeof estimate.attachment_file === 'string' ? JSON.parse(estimate.attachment_file) : estimate.attachment_file; } catch { currentAttachments = []; }
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                await api.put(`/sales/estimates/${estimate.id}`, { attachment_file: newAttachments, sheet_metadata: metadata });
                alert("저장 및 첨부되었습니다.");
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF 생성 실패: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !estimate) return null;

    const totalAmount = metadata.items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

    const columns = [
        { key: 'idx', label: '번호', align: 'center' },
        { key: 'name', label: '품 명', align: 'left' },
        { key: 'spec', label: '규 격', align: 'center' },
        { key: 'qty', label: '수 량', align: 'center' },
        { key: 'price', label: '단 가', align: 'right' },
        { key: 'total', label: '금 액', align: 'right' },
        { key: 'note', label: '비 고', align: 'center' },
    ];

    // Fix Stamp URL Data Binding
    let stampUrl = null;
    if (company?.stamp_image?.url) {
        stampUrl = company.stamp_image.url;
    } else if (Array.isArray(company?.stamp_image)) {
        stampUrl = company.stamp_image[0]?.url;
    } else if (company?.stamp_file?.[0]?.url) {
        stampUrl = company.stamp_file[0].url;
    }

    // Ensure absolute if needed, but usually '/static/...' is fine via proxy
    if (stampUrl && !stampUrl.startsWith('http') && !stampUrl.startsWith('/')) {
        stampUrl = '/' + stampUrl;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-white font-bold flex items-center gap-2">견적서 미리보기 및 정밀 편집</h3>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mr-4 italic">
                        * 항목 너비와 내용을 직접 수정할 수 있습니다.
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                        >
                            {saving ? '처리 중...' : 'PDF 저장 및 첨부'}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white p-2 flex items-center justify-center font-bold"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] flex flex-col shadow-none origin-top relative" style={{ fontFamily: '"Malgun Gothic", sans-serif', border: '1px solid #e5e7eb' }}>

                        {/* Title Section - Ensure no cut-off */}
                        <div className="text-center mb-10 relative flex justify-center items-center h-20">
                            <div className="text-4xl font-bold tracking-[1em] indent-[1em] border-b-4 border-black pb-2 max-w-[500px] w-full text-center leading-none">
                                <EditableText value={metadata.title} onChange={(v) => handleMetaChange('title', v)} isHeader className="justify-center" />
                            </div>
                        </div>

                        {/* Top Info Section */}
                        <div className="flex justify-between items-start mb-6 text-xs px-2">
                            <div className="flex-1 space-y-8 pr-4">
                                <div className="text-[12px] font-bold border-b border-gray-100 flex items-center gap-2 min-w-[140px] pb-1">
                                    <span>Date :</span>
                                    <EditableText value={metadata.estimate_date} onChange={(v) => handleMetaChange('estimate_date', v)} className="flex-1" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-end gap-2 text-2xl font-bold border-b-2 border-black pb-1 mb-2 max-w-[350px]">
                                        <EditableText value={metadata.recipient} onChange={(v) => handleMetaChange('recipient', v)} className="flex-1" />
                                        <span className="text-base pb-1 font-normal">귀하</span>
                                    </div>
                                    <p className="italic" style={{ fontSize: '12px', color: '#6b7280' }}>아래와 같이 견적해 드립니다.</p>
                                </div>
                            </div>

                            {/* Company Info Box - Ensure fixed width and no collapse */}
                            <div className="w-[320px] shrink-0 border-2 border-black flex text-[9px] h-36 overflow-hidden">
                                <div className="w-8 border-r border-black flex flex-col items-center justify-center font-bold" style={{ backgroundColor: '#f9fafb' }}>
                                    <div>공</div><div>급</div><div>자</div>
                                </div>
                                <div className="flex-1">
                                    <table className="w-full border-collapse h-full">
                                        <tbody>
                                            <tr className="border-b border-black h-8">
                                                <td className="w-16 border-r border-black font-bold p-1 text-center" style={{ backgroundColor: '#f9fafb' }}>등록번호</td>
                                                <td colSpan="3" className="p-1 font-bold text-center text-[11px]">
                                                    <EditableText value={metadata.company_reg_no} onChange={(v) => handleMetaChange('company_reg_no', v)} className="justify-center" />
                                                </td>
                                            </tr>
                                            <tr className="border-b border-black h-8">
                                                <td className="border-r border-black font-bold p-1 text-center" style={{ backgroundColor: '#f9fafb' }}>상 호</td>
                                                <td className="border-r border-black p-1 text-center font-bold">
                                                    <EditableText value={metadata.company_name} onChange={(v) => handleMetaChange('company_name', v)} className="justify-center" />
                                                </td>
                                                <td className="w-12 border-r border-black font-bold p-1 text-center" style={{ backgroundColor: '#f9fafb' }}>대표</td>
                                                <td className="p-1 text-center relative font-bold text-[11px]">
                                                    <EditableText value={metadata.company_ceo} onChange={(v) => handleMetaChange('company_ceo', v)} className="justify-center" />
                                                    {stampUrl && <StampOverlay url={stampUrl} className="w-12 h-12 -top-2 -left-2" />}
                                                </td>
                                            </tr>
                                            <tr className="border-b border-black h-10">
                                                <td className="border-r border-black font-bold p-1 text-center leading-tight" style={{ backgroundColor: '#f9fafb' }}>사업장<br />소재지</td>
                                                <td colSpan="3" className="p-1 leading-tight text-[8px]">
                                                    <EditableText
                                                        value={metadata.company_address}
                                                        onChange={(v) => handleMetaChange('company_address', v)}
                                                        className="items-start whitespace-pre-wrap leading-tight text-[8px]"
                                                    />
                                                </td>
                                            </tr>
                                            <tr className="h-10">
                                                <td className="border-r border-black font-bold p-1 text-center" style={{ backgroundColor: '#f9fafb' }}>연락처</td>
                                                <td colSpan="3" className="p-1 leading-tight text-[8px]">
                                                    <EditableText
                                                        value={metadata.company_contact}
                                                        onChange={(v) => handleMetaChange('company_contact', v)}
                                                        className="items-start whitespace-pre-wrap leading-tight text-[8px]"
                                                    />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Amount Bar */}
                        <div className="mx-2 flex border-t-2 border-b-2 border-black py-2 mb-6 font-bold text-base px-6 justify-between items-center h-14" style={{ backgroundColor: '#f9fafb' }}>
                            <div className="flex items-center gap-6 flex-1">
                                <span className="whitespace-nowrap text-sm">합 계 금 액 <span className="text-[9px] font-normal opacity-60">(부가세 별도)</span></span>
                                <EditableText value={metadata.total_amount_text} onChange={(v) => handleMetaChange('total_amount_text', v)} className="text-lg tracking-[0.1em] flex-1" style={{ color: '#1e3a8a' }} />
                            </div>
                            <div className="text-2xl whitespace-nowrap min-w-[150px] text-right font-mono">
                                ₩ {fmt(totalAmount)}
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="px-2">
                            <ResizableTable
                                columns={columns}
                                data={metadata.items}
                                colWidths={metadata.colWidths}
                                onUpdateWidths={(w) => handleMetaChange('colWidths', w)}
                                onUpdateData={updateItem}
                                className="text-[10px]"
                            />
                        </div>

                        {/* Footer Summary */}
                        <div className="mx-2 flex border-2 border-black border-t-0 font-bold text-[10px] items-center h-10" style={{ backgroundColor: '#f9fafb' }}>
                            <div className="flex-1 px-4 uppercase">합 계 (Total Amount)</div>
                            <div className="w-[100px] text-right px-4 text-sm font-mono tracking-tight">₩ {fmt(totalAmount)}</div>
                            <div className="w-[60px]"></div>
                        </div>

                        {/* Footer Section - Balanced Margin */}
                        <div className="mt-auto px-2 pt-6">
                            <h4 className="font-bold border-b-2 border-black w-24 mb-2 pb-1 text-[11px]">견 적 기 준</h4>
                            <div className="leading-relaxed border-2 border-black p-4 min-h-[100px]" style={{ backgroundColor: 'rgba(249, 250, 251, 0.2)' }}>
                                <EditableText
                                    value={metadata.notes}
                                    onChange={(v) => handleMetaChange('notes', v)}
                                    className="min-h-[80px] items-start whitespace-pre-wrap leading-6 text-[11px]"
                                />
                            </div>
                        </div>

                        {/* Bottom Decoration */}
                        <div className="text-center mt-8 mb-2 shrink-0" style={{ opacity: 0.4 }}>
                            <div className="font-bold tracking-[2em] uppercase" style={{ fontSize: '10px', color: '#9ca3af' }}>
                                디자인메카
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default EstimateSheetModal;
