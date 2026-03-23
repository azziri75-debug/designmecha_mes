import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Printer } from 'lucide-react';
import { toPng } from 'html-to-image';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
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
        company_contact: "TEL : 041-544-6220\nFAX : 041-544-6207\n(Email : juno@designmecha.co.kr)",
        colWidths: [30, 250, 100, 40, 80, 80, 60],
        items: []
    });

    const sheetRef = useRef(null);

    const columns = [
        { key: 'idx', label: '순번', align: 'center' },
        { key: 'name', label: '품목명', align: 'left' },
        { key: 'spec', label: '규격', align: 'center' },
        { key: 'qty', label: '수량', align: 'center' },
        { key: 'price', label: '단가', align: 'right' },
        { key: 'total', label: '금액', align: 'right' },
        { key: 'note', label: '비고', align: 'left' },
    ];

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

        const total = items.reduce((s, i) => {
            const val = i.total?.toString().replace(/,/g, '');
            return s + (parseFloat(val) || 0);
        }, 0);

        let savedColWidths;
        try {
            if (estimate.sheet_metadata) {
                const sm = typeof estimate.sheet_metadata === 'string' ? JSON.parse(estimate.sheet_metadata) : estimate.sheet_metadata;
                if (sm.colWidths) savedColWidths = sm.colWidths;
            }
        } catch (e) { }

        const defaultWidths = [30, 240, 100, 40, 80, 80, 60];

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
            company_contact: `TEL : ${company?.phone || '041-544-6220'}\nFAX : ${company?.fax || '041-544-6207'}\n(Email : ${company?.email || 'juno@designmecha.co.kr'})`,
            colWidths: savedColWidths || defaultWidths,
            items: items.map(i => ({
                ...i,
                price: typeof i.price === 'number' ? i.price.toLocaleString() : i.price,
                total: typeof i.total === 'number' ? i.total.toLocaleString() : i.total
            }))
        }));
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const updateItem = (rIdx, key, val) => {
        const newItems = [...metadata.items];
        newItems[rIdx][key] = val;
        if (key === 'qty' || key === 'price') {
            const q = parseFloat(newItems[rIdx].qty?.toString().replace(/,/g, '')) || 0;
            const p = parseFloat(newItems[rIdx].price?.toString().replace(/,/g, '')) || 0;
            newItems[rIdx].total = (q * p).toLocaleString();

            if (key === 'price') {
                const numVal = parseFloat(val.toString().replace(/,/g, ''));
                if (!isNaN(numVal)) newItems[rIdx].price = numVal.toLocaleString();
            }

            const newTotal = newItems.reduce((s, i) => s + (parseFloat(i.total?.toString().replace(/,/g, '')) || 0), 0);
            handleMetaChange('total_amount_text', numberToKorean(newTotal));
        }
        setMetadata(prev => ({ ...prev, items: newItems }));
    };

    const handlePrintWindow = async () => {
        await printAsImage(sheetRef.current, { title: '견적서', orientation: 'portrait' });
    };

    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const partnerName = estimate.partner?.name || '고객사';
            const items = estimate.items || [];
            const firstItemName = items[0]?.product?.name || '품명';
            const extraCount = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
            const date = estimate.estimate_date || '날짜';
            const fileName = `견적서-${partnerName}-${firstItemName}${extraCount}-${date}.pdf`;
            const blob = await generateA4PDF(sheetRef.current, {
                fileName,
                orientation: 'portrait',
                action: 'blob',
                pixelRatio: 3,
                multiPage: true
            });

            if (action === 'download') {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName; a.click();
            } else {
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

                let currentAttachments = [];
                try { if (estimate.attachment_file) currentAttachments = typeof estimate.attachment_file === 'string' ? JSON.parse(estimate.attachment_file) : estimate.attachment_file; } catch { currentAttachments = []; }
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                await api.put(`/sales/estimates/${estimate.id}`, { attachment_file: newAttachments });
                alert('저장 및 첨부되었습니다.');
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF 생성 실패: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !estimate) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                    <h2 className="text-xl font-bold text-white">견적서 상세</h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrintWindow}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                        >
                            <Printer className="w-4 h-4" /> 인쇄
                        </button>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg"
                        >
                            {saving ? '처리 중...' : 'PDF 저장 및 첨부'}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white p-2 transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white shadow-2xl p-[20mm] w-[210mm] min-h-[297mm] flex flex-col text-black font-['Malgun_Gothic']">
                        {/* Header Section */}
                        <div className="flex flex-col items-center mb-10 w-full">
                            <h1 className="text-3xl font-extrabold tracking-[0.5em] mb-12 text-center border-b-[6px] border-black pb-4 w-full">견 적 서</h1>
                            
                            <div className="flex justify-between items-start w-full">
                                <div className="flex-1">
                                    <div className="flex items-end gap-4 border-b-2 border-black pb-1 w-fit whitespace-nowrap">
                                        <EditableText 
                                            value={metadata.recipient} 
                                            onChange={(v) => handleMetaChange('recipient', v)}
                                            className="text-[120px] font-extrabold"
                                        />
                                        <span className="text-sm font-normal pb-4 text-black">귀하</span>
                                    </div>
                                    <div className="mt-6 text-xs space-y-2">
                                        <p className="flex items-center gap-2">
                                            <span className="font-bold">견적일자:</span> <EditableText value={metadata.estimate_date} onChange={(v) => handleMetaChange('estimate_date', v)} className="w-32" />
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <span className="font-bold">합계금액:</span> <span className="font-bold underline text-base">{metadata.total_amount_text}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="w-[340px] border-2 border-black flex">
                                    <div className="w-8 bg-gray-50 border-r-2 border-black flex items-center justify-center text-[10px] font-bold p-1 leading-tight text-center [writing-mode:vertical-rl] tracking-widest uppercase">
                                        공급자
                                    </div>
                                    <div className="flex-1 text-[11px]">
                                        <div className="flex border-b-2 border-black">
                                            <div className="w-16 bg-gray-50 border-r-2 border-black p-1 flex items-center justify-center font-bold">등록번호</div>
                                            <div className="flex-1 p-1 flex items-center justify-center font-bold text-sm tracking-tighter">
                                                <EditableText value={metadata.company_reg_no} onChange={(v) => handleMetaChange('company_reg_no', v)} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[64px_1fr_40px_1fr] border-b-2 border-black">
                                            <div className="bg-gray-50 border-r-2 border-black p-1 flex items-center justify-center font-bold text-[10px]">상 호</div>
                                            <div className="border-r-2 border-black p-1 flex items-center justify-center font-extrabold text-sm">
                                                <EditableText value={metadata.company_name} onChange={(v) => handleMetaChange('company_name', v)} />
                                            </div>
                                            <div className="bg-gray-50 border-r-2 border-black p-1 flex items-center justify-center font-bold text-[10px]">성 명</div>
                                            <div className="p-1 flex items-center justify-center font-bold relative group">
                                                <EditableText value={metadata.company_ceo} onChange={(v) => handleMetaChange('company_ceo', v)} />
                                                {company?.stamp_image?.url && (
                                                    <StampOverlay url={company.stamp_image.url} className="w-12 h-12 -top-1 -right-1 opacity-70" />
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex border-b-2 border-black">
                                            <div className="w-16 bg-gray-50 border-r-2 border-black p-1 flex items-center justify-center font-bold">주 소</div>
                                            <div className="flex-1 p-1 flex items-center leading-tight text-[8px]">
                                                <EditableText value={metadata.company_address} onChange={(v) => handleMetaChange('company_address', v)} autoFit />
                                            </div>
                                        </div>
                                        <div className="flex">
                                            <div className="w-16 bg-gray-50 border-r-2 border-black p-1 flex items-center justify-center font-bold">연락처</div>
                                            <div className="flex-1 p-1 flex items-center leading-tight text-[8px]">
                                                <EditableText value={metadata.company_contact} onChange={(v) => handleMetaChange('company_contact', v)} autoFit />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Summary Bar */}
                        <div className="bg-gray-50 border-2 border-black p-3 mb-6 flex justify-between items-center font-bold text-base shadow-sm">
                            <span>합계금액 (VAT 별도)</span>
                            <div className="flex items-center gap-6">
                                <span className="text-gray-600 font-normal text-sm">{metadata.total_amount_text}</span>
                                <span className="text-xl tracking-tight">￦ {metadata.items.reduce((s, i) => s + (parseFloat(i.total?.toString().replace(/,/g, '')) || 0), 0).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Table Section */}
                        <div className="w-full border-2 border-black">
                            <ResizableTable
                                columns={columns}
                                data={metadata.items}
                                colWidths={metadata.colWidths}
                                onUpdateWidths={(w) => handleMetaChange('colWidths', w)}
                                onItemChange={updateItem}
                                onUpdateData={updateItem}
                                company={company}
                                className="!border-t-0 !border-b-0"
                            />
                        </div>

                        {/* Bottom Section */}
                        <div className="mt-8 flex flex-col gap-8">
                            <div className="border-2 border-black p-4 min-h-[140px] bg-white">
                                <h4 className="font-bold border-b-2 border-black w-20 mb-3 pb-1 italic text-sm">Note.</h4>
                                <EditableText 
                                    value={metadata.notes} 
                                    onChange={(v) => handleMetaChange('notes', v)}
                                    autoFit
                                    className="text-xs items-start leading-relaxed"
                                />
                            </div>

                            <div className="text-center font-extrabold text-2xl mt-4 border-t-2 border-black pt-10">
                                <p className="mb-10 text-xl">위와 같이 견적함.</p>
                                <div className="flex items-center justify-center gap-6">
                                    <span className="text-4xl tracking-widest">{metadata.company_name}</span>
                                    <div className="relative inline-block">
                                        <span className="text-red-500 font-normal text-xl">(인)</span>
                                        {company?.stamp_image?.url && (
                                            <StampOverlay url={company.stamp_image.url} className="w-24 h-24 -top-10 -left-6" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EstimateSheetModal;
