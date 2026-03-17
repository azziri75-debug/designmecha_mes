import React, { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { EditableText, StampOverlay, ResizableTable } from './DocumentUtils';
import { cn } from '../lib/utils';
import api from '../lib/api';
import ApprovalGrid from './ApprovalGrid';

const PurchaseOrderForm = ({ data, onChange, isReadOnly, currentUser, documentData }) => {
    const [company, setCompany] = useState(null);

    useEffect(() => {
        fetchCompany();
    }, []);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) {
            console.error('Failed to fetch company', err);
        }
    };

    // Initialize items if empty
    useEffect(() => {
        if (!data.items || data.items.length === 0) {
            const defaultItems = Array(10).fill({ idx: "", name: "", spec: "", qty: "", price: "", total: "" });
            onChange('items', defaultItems);
        }
        if (!data.colWidths) {
            onChange('colWidths', [40, 200, 120, 60, 80, 100]);
        }
    }, []);

    const handleMetaChange = (key, val) => onChange(key, val);

    const updateItem = (rIdx, key, val) => {
        const newItems = [...(data.items || [])];
        let cleanVal = val;
        if (typeof val === 'string' && (key === 'qty' || key === 'price' || key === 'total')) {
            cleanVal = val.replace(/,/g, '');
        }
        newItems[rIdx] = { ...newItems[rIdx], [key]: cleanVal };

        if (key === 'qty' || key === 'price') {
            const q = parseFloat(newItems[rIdx].qty) || 0;
            const p = parseFloat(newItems[rIdx].price) || 0;
            newItems[rIdx].total = q * p;
        }
        onChange('items', newItems);
    };

    const fmt = (n) => {
        if (n === null || n === undefined || n === '') return '';
        const parsed = parseFloat(n);
        return isNaN(parsed) ? n : parsed.toLocaleString();
    };

    const totalAmount = (data.items || []).reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const totalQty = (data.items || []).reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);

    const columns = [
        { key: 'idx', label: '순번', subLabel: 'Order', align: 'center' },
        { key: 'name', label: '품목', subLabel: 'Description', align: 'left' },
        { key: 'spec', label: '규격', subLabel: 'Gauge', align: 'center' },
        { key: 'qty', label: '수량', subLabel: 'Qty', align: 'center' },
        { key: 'price', label: '단가', subLabel: 'Unit Price', align: 'right' },
        { key: 'total', label: '금액', subLabel: 'Total Amount', align: 'right' }
    ];

    const formattedItems = (data.items || []).map((item, idx) => ({
        ...item,
        idx: item.idx || idx + 1,
        qty: fmt(item.qty),
        price: fmt(item.price),
        total: fmt(item.total)
    }));

    let stampUrl = null;
    if (company?.stamp_image?.url) stampUrl = company.stamp_image.url;
    else if (Array.isArray(company?.stamp_image)) stampUrl = company.stamp_image[0]?.url;
    else if (company?.stamp_file?.[0]?.url) stampUrl = company.stamp_file[0].url;

    if (stampUrl && !stampUrl.startsWith('http') && !stampUrl.startsWith('/')) {
        stampUrl = '/' + stampUrl;
    }

    return (
        <div className="bg-white text-black w-full min-h-[297mm] p-[10mm] relative flex flex-col shadow-sm border border-gray-200" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div className="w-[160px] text-[10px] space-y-0.5 pt-8">
                    <p className="flex items-center gap-1">NO : <EditableText value={data.order_no} onChange={(v) => handleMetaChange('order_no', v)} className="flex-1 border-b border-gray-100 min-h-0" /></p>
                </div>
                <div className="flex-1 flex flex-col items-center">
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1, fontSize: '14px' }}>주식회사 디자인메카</Typography>
                    <div className="border-[3px] border-black px-8 py-2 text-2xl font-bold tracking-[0.5em] indent-[0.5em] text-center leading-none">
                        구 매 발 주 서
                    </div>
                </div>
                <div className="w-[320px]">
                    <ApprovalGrid documentData={documentData} currentUser={currentUser} />
                </div>
            </div>

            {/* Info Section */}
            <div className="flex justify-between mb-6 text-xs items-start">
                <div className="space-y-4 flex-1">
                    <div className="flex items-end gap-2 text-xl font-bold border-b-2 border-black pb-1 mb-2 max-w-[260px]">
                        <EditableText value={data.partner_name || '공급처'} onChange={(v) => handleMetaChange('partner_name', v)} className="flex-1" />
                        <span className="text-sm pb-1 font-normal">귀하</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-gray-500">
                        <p>TEL : <span className="text-black">{data.partner_phone || '-'}</span></p>
                        <p>FAX : <span className="text-black">{data.partner_fax || '-'}</span></p>
                        <p className="pt-2">발주일 : <span className="text-black font-bold">{data.order_date || '-'}</span></p>
                    </div>
                </div>
                <div className="text-right w-[220px]">
                    <h2 className="text-xl font-bold">{company?.name || '디자인메카'}</h2>
                    <p className="tracking-widest uppercase text-[9px] text-gray-400">Designmecha Enterprise</p>
                    <div className="mt-4 space-y-0.5 text-gray-800 text-[9px]">
                        <p>{company?.address || '충남 아산시 음봉면 월암로 336-39'}</p>
                        <p>T. {company?.phone || '041-544-6220'} / F. {company?.fax || '-'}</p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1">
                <ResizableTable
                    columns={columns}
                    data={formattedItems}
                    colWidths={data.colWidths}
                    onUpdateWidths={(w) => handleMetaChange('colWidths', w)}
                    onUpdateData={updateItem}
                    className="text-[10px]"
                />
                
                {/* Summary */}
                <div className="flex border-2 border-black border-t-0 font-bold text-[10px] h-10 items-center bg-gray-50">
                    <div className="border-r border-black flex-1 text-center uppercase tracking-widest text-gray-500">
                        합계 (VAT 별도)
                    </div>
                    <div className="w-[60px] border-r border-black text-center text-gray-700">
                        {fmt(totalQty)}
                    </div>
                    <div className="w-[80px] border-r border-black"></div>
                    <div className="w-[100px] text-right px-2 text-black">{fmt(totalAmount)} 원</div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-[10px]">
                <div className="border border-black p-4 mb-4 min-h-[100px]">
                    <h4 className="font-bold border-b border-black w-20 mb-2 pb-1 italic">Note.</h4>
                    <EditableText
                        value={data.special_notes}
                        onChange={(v) => handleMetaChange('special_notes', v)}
                        className="leading-relaxed items-start min-h-[60px]"
                        placeholder="상세 내용을 입력하세요..."
                        autoFit
                    />
                </div>

                <div className="flex border-2 border-black">
                    <div className="w-20 border-r-2 border-black flex flex-col items-center justify-center font-bold bg-gray-50">
                        <div>발주</div><div>조건</div>
                    </div>
                    <div className="flex-1 grid grid-cols-2 text-[9px]">
                        <div className="border-b border-r border-black p-2 flex items-center gap-2">
                            <span className="font-bold">◆ 납기기한 :</span>
                            <EditableText value={data.delivery_date} onChange={(v) => handleMetaChange('delivery_date', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                        </div>
                        <div className="border-b border-black p-2 flex items-center gap-2">
                            <span className="font-bold">◆ 납품장소 :</span>
                            <EditableText value={data.delivery_place} onChange={(v) => handleMetaChange('delivery_place', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                        </div>
                        <div className="border-r border-black p-2 flex items-center gap-2">
                            <span className="font-bold">◆ 유효기간 :</span>
                            <EditableText value={data.valid_until} onChange={(v) => handleMetaChange('valid_until', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                        </div>
                        <div className="p-2 flex items-center gap-2">
                            <span className="font-bold">◆ 결제조건 :</span>
                            <EditableText value={data.payment_terms} onChange={(v) => handleMetaChange('payment_terms', v)} className="flex-1 border-b border-gray-50 min-h-0" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseOrderForm;
