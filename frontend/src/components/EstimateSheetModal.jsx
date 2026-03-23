import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download } from 'lucide-react';
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

        const defaultWidths = [35, 200, 140, 45, 85, 95, 60];

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

            // Re-format price if it was changed
            if (key === 'price') {
                const numVal = parseFloat(val.toString().replace(/,/g, ''));
                if (!isNaN(numVal)) newItems[rIdx].price = numVal.toLocaleString();
            }

            const newTotal = newItems.reduce((s, i) => s + (parseFloat(i.total?.toString().replace(/,/g, '')) || 0), 0);
            handleMetaChange('total_amount_text', numberToKorean(newTotal));
        }
        setMetadata(prev => ({ ...prev, items: newItems }));
    };

    const fmt = (n) => typeof n === 'number' ? n.toLocaleString() : n;

    const handlePrintWindow = async () => {
        await printAsImage(sheetRef.current, { title: '견적서', orientation: 'portrait' });
    };

        const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const fileName = `estimate_${estimate.id}_${Date.now()}.pdf`;
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
                    <div ref={sheetRef} className="bg-white shadow-2xl">
                        <ResizableTable
                            data={metadata}
                            onChange={handleMetaChange}
                            onItemChange={updateItem}
                            company={company}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EstimateSheetModal;
