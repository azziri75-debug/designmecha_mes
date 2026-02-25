import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Edit2, FileSpreadsheet } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';

const EstimateSheetModal = ({ isOpen, onClose, estimate, onSave }) => {
    const [company, setCompany] = useState(null);
    const [template, setTemplate] = useState(null);
    const [saving, setSaving] = useState(false);

    // Editable State (Metadata)
    const [metadata, setMetadata] = useState({
        title: "견  적  서",
        header_note: "아래와 같이 견적합니다.",
        footer_note: "1. 부가세 별도\n2. 납기 : 발주 후 협의\n3. 결제조건 : 현금 결제",
        show_stamp: true,
        recipient: "",
        reference: "",
        valid_until: "",
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            fetchCompany();
            fetchTemplate();
            initializeData();
        }
    }, [isOpen, estimate]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (error) { console.error("Failed to fetch company info", error); }
    };

    const fetchTemplate = async () => {
        try {
            const res = await api.get('/basics/form-templates/');
            const estTemplate = res.data.find(t => t.form_type === 'ESTIMATE');
            if (estTemplate) setTemplate(estTemplate);
        } catch (error) { console.error("Failed to fetch template", error); }
    };

    const initializeData = () => {
        if (estimate) {
            let initialMetadata = {
                title: "견  적  서",
                header_note: "아래와 같이 견적합니다.",
                footer_note: "1. 부가세 별도\n2. 납기 : 발주 후 협의\n3. 결제조건 : 현금 결제",
                show_stamp: true,
                recipient: estimate.partner?.name || "",
                reference: "",
                valid_until: estimate.valid_until || "",
            };
            if (estimate.sheet_metadata) {
                try {
                    const savedMeta = typeof estimate.sheet_metadata === 'string'
                        ? JSON.parse(estimate.sheet_metadata)
                        : estimate.sheet_metadata;
                    initialMetadata = { ...initialMetadata, ...savedMeta };
                } catch (e) { console.error("Failed to parse metadata", e); }
            }
            setMetadata(initialMetadata);
        }
    };

    const handleMetadataChange = (key, value) => {
        setMetadata(prev => ({ ...prev, [key]: value }));
    };

    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const canvas = await html2canvas(sheetRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

            if (action === 'download') {
                pdf.save(`estimate_${estimate.id}.pdf`);
            } else if (action === 'save') {
                const blob = pdf.output('blob');
                const file = new File([blob], `estimate_${estimate.id}_${Date.now()}.pdf`, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                let currentAttachments = [];
                try {
                    if (estimate.attachment_file) {
                        currentAttachments = typeof estimate.attachment_file === 'string'
                            ? JSON.parse(estimate.attachment_file)
                            : estimate.attachment_file;
                        if (!Array.isArray(currentAttachments)) currentAttachments = [currentAttachments];
                    }
                } catch (e) { currentAttachments = []; }
                const newAttachments = [...currentAttachments, { name: uploadRes.data.filename, url: uploadRes.data.url }];
                await api.put(`/sales/estimates/${estimate.id}`, {
                    attachment_file: newAttachments,
                    sheet_metadata: metadata
                });
                alert("견적서가 저장되고 첨부되었습니다.");
                if (onSave) onSave();
                onClose();
            }
        } catch (error) {
            console.error("PDF Generation failed", error);
            alert("PDF 생성 및 저장 실패");
        } finally { setSaving(false); }
    };

    const handleExcelExport = async () => {
        try {
            setSaving(true);
            await api.put(`/sales/estimates/${estimate.id}`, { sheet_metadata: metadata });
            await api.post(`/sales/estimates/${estimate.id}/export_excel`);
            alert("엑셀 파일이 생성되어 첨부파일에 저장되었습니다.");
            if (onSave) onSave();
            onClose();
        } catch (error) {
            console.error("Excel Generation failed", error);
            alert("엑셀 생성 및 저장 실패");
        } finally { setSaving(false); }
    };

    if (!isOpen || !estimate) return null;

    const fmt = (n) => n?.toLocaleString() || "0";
    const today = new Date().toISOString().split('T')[0];
    const totalAmount = estimate.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const vat = totalAmount * 0.1;
    const grandTotal = totalAmount + vat;

    const renderBlock = (block) => {
        const config = block.config || {};
        switch (block.type) {
            case 'header':
                return (
                    <div className="text-center mb-8 relative" key={block.id}>
                        <h1 className="text-4xl font-bold underline decoration-double underline-offset-4 tracking-[1em] indent-[1em]">
                            {config.title || metadata.title}
                        </h1>
                    </div>
                );
            case 'boxedHeader':
                return (
                    <div className="flex justify-center mb-8" key={block.id}>
                        <div className="border-2 border-black px-16 py-2 text-3xl font-bold tracking-[1em] indent-[1em]">
                            {config.title || "견 적 서"}
                        </div>
                    </div>
                );
            case 'supplierTable':
                return (
                    <div className="flex justify-end mb-6" key={block.id}>
                        <div className="w-[85mm] border-2 border-[#000] p-2 relative">
                            <table className="w-full text-xs leading-relaxed">
                                <tbody>
                                    <tr>
                                        <td rowSpan="5" className="text-center align-middle font-bold text-lg w-8 border-r border-[#000] writing-vertical" style={{ backgroundColor: '#f3f4f6' }}>공<br />급<br />자</td>
                                        <td className="pl-2 border-b border-[#d1d5db] py-1"><span className="inline-block w-12 text-gray-400">등록번호</span> {company?.registration_number}</td>
                                    </tr>
                                    <tr>
                                        <td className="pl-2 border-b border-[#d1d5db] py-1 flex justify-between items-center pr-2">
                                            <span><span className="inline-block w-12 text-gray-400">상호</span> {company?.name}</span>
                                            <span><span className="inline-block w-12 text-gray-400">성명</span> {company?.owner_name || company?.representative}</span>
                                        </td>
                                    </tr>
                                    <tr><td className="pl-2 border-b border-[#d1d5db] py-1"><span className="inline-block w-12 text-gray-400">주소</span> {company?.address}</td></tr>
                                    <tr><td className="pl-2 border-b border-[#d1d5db] py-1"><span className="inline-block w-12 text-gray-400">업태</span> {company?.business_type || '제조'} / {company?.business_item || '정밀가공'}</td></tr>
                                    <tr><td className="pl-2 py-1"><span className="inline-block w-12 text-gray-400">연락처</span> {company?.phone} / {company?.fax}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'approval':
                const steps = config.steps || ["담당", "대표이사"];
                return (
                    <div className="flex justify-end mb-6" key={block.id}>
                        <div className="flex border border-black text-[10px]">
                            <div className="w-6 border-r border-black bg-gray-50 flex items-center justify-center font-bold writing-vertical py-2">결제</div>
                            {steps.map((step, i) => (
                                <div key={i} className={`w-16 flex flex-col ${i !== steps.length - 1 ? 'border-r border-black' : ''}`}>
                                    <div className="border-b border-black bg-gray-50 py-0.5 text-center font-bold">{step}</div>
                                    <div className="h-10"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'infoTable':
                const rows = config.rows || [{ label1: "성명", value1: metadata.recipient, label2: "연락처", value2: "" }];
                return (
                    <div className="p-2" key={block.id}>
                        <table className="w-full border-collapse border border-black text-xs">
                            <tbody>
                                {rows.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="border border-black bg-gray-50 p-2 font-bold w-24">{row.label1}</td>
                                        <td className="border border-black p-2">{row.value1 || (idx === 0 ? metadata.recipient : '')}</td>
                                        <td className="border border-black bg-gray-50 p-2 font-bold w-24">{row.label2}</td>
                                        <td className="border border-black p-2">{row.value2}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            case 'sumBox':
                return (
                    <div className="border-t-2 border-b-2 border-[#000] py-2 mb-6 flex items-center" key={block.id}>
                        <span className="font-bold text-lg w-32 text-center">합계금액(VAT별도)</span>
                        <span className="flex-1 text-right text-xl font-bold font-mono tracking-wider pr-4">￦ {fmt(totalAmount)}</span>
                    </div>
                );
            case 'productList':
                const showSum = !template?.layout_data?.blocks?.some(b => b.type === 'sumBox');
                return (
                    <div key={block.id}>
                        {showSum && (
                            <div className="border-t-2 border-b-2 border-[#000] py-2 mb-6 flex items-center">
                                <span className="font-bold text-lg w-24 text-center">합계금액</span>
                                <span className="flex-1 text-right text-xl font-bold font-mono tracking-wider pr-4">￦ {fmt(grandTotal)} <span className="text-sm font-normal ml-2">(VAT 포함)</span></span>
                            </div>
                        )}
                        <table className="w-full border-collapse border border-[#000] mb-6 text-sm">
                            <thead>
                                <tr className="text-center bg-gray-100">
                                    <th className="border border-[#000] py-2 w-10">No</th>
                                    <th className="border border-[#000] py-2">품명</th>
                                    <th className="border border-[#000] py-2 w-24">규격/사양</th>
                                    <th className="border border-[#000] py-2 w-12">수량</th>
                                    <th className="border border-[#000] py-2 w-24">단가</th>
                                    <th className="border border-[#000] py-2 w-28">공급가액</th>
                                    <th className="border border-[#000] py-2 w-24">세액</th>
                                    <th className="border border-[#000] py-2 w-24">비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {estimate.items.map((item, idx) => (
                                    <tr key={idx} className="text-center">
                                        <td className="border border-[#000] py-1">{idx + 1}</td>
                                        <td className="border border-[#000] py-1 text-left px-2">{item.product?.name || item.product_name}</td>
                                        <td className="border border-[#000] py-1">{item.product?.code || item.spec || '-'}</td>
                                        <td className="border border-[#000] py-1">{fmt(item.quantity)}</td>
                                        <td className="border border-[#000] py-1 text-right px-2">{fmt(item.unit_price)}</td>
                                        <td className="border border-[#000] py-1 text-right px-2">{fmt(item.quantity * item.unit_price)}</td>
                                        <td className="border border-[#000] py-1 text-right px-2">{fmt((item.quantity * item.unit_price) * 0.1)}</td>
                                        <td className="border border-[#000] py-1 text-xs">{item.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-bold text-center bg-gray-50">
                                    <td colSpan="3" className="border border-[#000] py-2">소 계</td>
                                    <td className="border border-[#000] py-2">{fmt(estimate.items.reduce((s, i) => s + i.quantity, 0))}</td>
                                    <td className="border border-[#000] py-2"></td>
                                    <td className="border border-[#000] py-2 text-right px-2">{fmt(totalAmount)}</td>
                                    <td className="border border-[#000] py-2 text-right px-2">{fmt(vat)}</td>
                                    <td className="border border-[#000] py-2"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                );
            case 'memo':
                return (
                    <div className="mt-8" key={block.id}>
                        <h4 className="font-bold border-b border-[#000] w-24 mb-2">특이사항</h4>
                        <textarea value={metadata.footer_note} onChange={(e) => handleMetadataChange('footer_note', e.target.value)} className="w-full resize-none outline-none bg-transparent text-sm leading-relaxed min-h-[100px]" />
                    </div>
                );
            default: return null;
        }
    };

    const blocks = template?.layout_data?.blocks || [
        { id: 'h1', type: 'header' },
        { id: 'i1', type: 'infoTable' },
        { id: 'p1', type: 'productList' },
        { id: 'm1', type: 'memo' }
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Edit2 className="w-5 h-5 text-blue-500" /> 견적서 미리보기 및 편집 (시각적 양식 적용)
                    </h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => generatePDF('download')} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors"><Download className="w-4 h-4" /> 다운로드</button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"><Save className="w-4 h-4" /> {saving ? "저장 중..." : "PDF 저장 및 첨부"}</button>
                        <button onClick={handleExcelExport} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-green-900/20 ml-2"><FileSpreadsheet className="w-4 h-4" /> {saving ? "저장 중..." : "엑셀 저장 및 첨부"}</button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2"><X className="w-6 h-6" /></button>
                    </div>
                </div>
                <div className="p-4 bg-gray-800 border-b border-gray-700 flex gap-4 overflow-x-auto text-sm">
                    <div className="flex items-center gap-2 text-gray-400">제목: <input value={metadata.title} onChange={(e) => handleMetadataChange('title', e.target.value)} className="bg-gray-700 border-gray-600 rounded px-2 py-1 text-white w-32" /></div>
                </div>
                <div className="flex-1 overflow-auto bg-gray-950 p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] shadow-xl origin-top" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
                        <div className="flex flex-wrap content-start w-full">
                            {blocks.map(block => {
                                const widthMap = {
                                    '100%': 'w-full',
                                    '75%': 'w-3/4',
                                    '66%': 'w-2/3',
                                    '50%': 'w-1/2',
                                    '33%': 'w-1/3',
                                    '25%': 'w-1/4'
                                };
                                return (
                                    <div key={block.id} className={widthMap[block.width || '100%']}>
                                        {renderBlock(block)}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EstimateSheetModal;
