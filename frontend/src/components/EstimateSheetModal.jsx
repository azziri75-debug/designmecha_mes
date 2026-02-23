import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Printer, Edit2, RotateCcw, FileSpreadsheet } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { cn, getImageUrl } from '../lib/utils';

const EstimateSheetModal = ({ isOpen, onClose, estimate, onSave }) => {
    const [company, setCompany] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Editable State (Metadata)
    const [metadata, setMetadata] = useState({
        title: "견  적  서",
        header_note: "아래와 같이 견적합니다.",
        footer_note: "1. 부가세 별도\n2. 납기 : 발주 후 협의\n3. 결제조건 : 현금 결제",
        show_stamp: true,
        recipient: "", // 수신
        reference: "", // 참조
        valid_until: "", // 유효기간 (override)
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            fetchCompany();
            initializeData();
        }
    }, [isOpen, estimate]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (error) {
            console.error("Failed to fetch company info", error);
        }
    };

    const initializeData = () => {
        if (estimate) {
            // Load existing metadata if available
            let initialMetadata = { ...metadata };
            if (estimate.sheet_metadata) {
                try {
                    const savedMeta = typeof estimate.sheet_metadata === 'string'
                        ? JSON.parse(estimate.sheet_metadata)
                        : estimate.sheet_metadata;
                    initialMetadata = { ...initialMetadata, ...savedMeta };
                } catch (e) {
                    console.error("Failed to parse metadata", e);
                }
            } else {
                // Default values from estimate
                initialMetadata.recipient = estimate.partner?.name || "";
                initialMetadata.valid_until = estimate.valid_until || "";
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
                setSaving(false);
            } else if (action === 'save') {
                // 1. Save File
                const blob = pdf.output('blob');
                const file = new File([blob], `estimate_${estimate.id}_${Date.now()}.pdf`, { type: 'application/pdf' });

                const formData = new FormData();
                formData.append('file', file);

                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                const fileUrl = uploadRes.data.url;
                const fileName = uploadRes.data.filename;

                // 2. Update Estimate with file and metadata
                // We need to fetch current attachments first to append, or replace?
                // Usually we append.
                let currentAttachments = [];
                try {
                    if (estimate.attachment_file) {
                        currentAttachments = typeof estimate.attachment_file === 'string'
                            ? JSON.parse(estimate.attachment_file)
                            : estimate.attachment_file;
                        if (!Array.isArray(currentAttachments)) currentAttachments = [currentAttachments];
                    }
                } catch (e) {
                    currentAttachments = [];
                }

                // Add new file
                const newAttachments = [...currentAttachments, { name: fileName, url: fileUrl }];

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
        } finally {
            setSaving(false);
        }
    };

    const handleExcelExport = async () => {
        try {
            setSaving(true);

            // 1. Sync metadata
            await api.put(`/sales/estimates/${estimate.id}`, {
                sheet_metadata: metadata
            });

            // 2. Export Excel
            await api.post(`/sales/estimates/${estimate.id}/export_excel`);

            alert("엑셀 파일이 생성되어 첨부파일에 저장되었습니다.");
            if (onSave) onSave();
            onClose();
        } catch (error) {
            console.error("Excel Generation failed", error);
            const errDetail = error.response?.data?.detail || error.message || "알 수 없는 오류";
            alert(`엑셀 생성 및 저장 실패:\n${typeof errDetail === 'object' ? JSON.stringify(errDetail) : errDetail}`);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !estimate) return null;

    // Helper for currency formatting
    const fmt = (n) => n?.toLocaleString() || "0";
    const today = new Date().toISOString().split('T')[0];

    // Total Amount Calculation
    const totalAmount = estimate.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const vat = totalAmount * 0.1;
    const grandTotal = totalAmount + vat;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Edit2 className="w-5 h-5 text-blue-500" />
                        견적서 미리보기 및 편집
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => generatePDF('download')}
                            disabled={saving}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            다운로드
                        </button>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? "저장 중..." : "PDF 저장 및 첨부"}
                        </button>
                        <button
                            onClick={handleExcelExport}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-green-900/20 ml-2"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            {saving ? "저장 중..." : "엑셀 저장 및 첨부"}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Toolbar / Options */}
                <div className="p-4 bg-gray-800 border-b border-gray-700 flex gap-4 overflow-x-auto text-sm">
                    <label className="flex items-center gap-2 text-gray-300">
                        <input
                            type="checkbox"
                            checked={metadata.show_stamp}
                            onChange={(e) => handleMetadataChange('show_stamp', e.target.checked)}
                            className="rounded border-gray-600 bg-gray-700 text-[#2563eb]"
                        />
                        직인 표시
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">제목:</span>
                        <input
                            value={metadata.title}
                            onChange={(e) => handleMetadataChange('title', e.target.value)}
                            className="bg-gray-700 border-gray-600 rounded px-2 py-1 text-white w-32"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">유효기간:</span>
                        <input
                            value={metadata.valid_until}
                            onChange={(e) => handleMetadataChange('valid_until', e.target.value)}
                            className="bg-gray-700 border-gray-600 rounded px-2 py-1 text-white w-32"
                            placeholder="YYYY-MM-DD"
                        />
                    </div>
                </div>

                {/* Preview Area (A4 Container) */}
                <div className="flex-1 overflow-auto bg-[#f9fafb]0 p-8 flex justify-center">
                    <div
                        ref={sheetRef}
                        className="bg-[#fff] text-[#000] w-[210mm] min-h-[297mm] p-[10mm] shadow-xl origin-top"
                        style={{ fontFamily: '"Malgun Gothic", "Sunny", sans-serif' }}
                    >
                        {/* Title */}
                        <div className="text-center mb-8 relative">
                            <h1 className="text-4xl font-bold underline decoration-double underline-offset-4 tracking-[1em] indent-[1em]">{metadata.title}</h1>
                            {/* <div className="absolute right-0 top-0 text-xs border border-[#000] p-1">
                                문서번호: {}
                            </div> */}
                        </div>

                        {/* Top Info Grid */}
                        <div className="flex justify-between items-start mb-6 gap-4">
                            {/* Left: Recipient */}
                            <div className="flex-1 space-y-2">
                                <div className="flex items-end gap-2 text-lg border-b border-[#000] pb-1 mb-2">
                                    <input
                                        value={metadata.recipient}
                                        onChange={(e) => handleMetadataChange('recipient', e.target.value)}
                                        className="font-bold flex-1 outline-none bg-transparent"
                                        placeholder="수신처 입력"
                                    />
                                    <span>귀하</span>
                                </div>
                                <div className="text-sm space-y-1">
                                    <p className="flex"><span className="w-16">참조:</span> <input value={metadata.reference} onChange={(e) => handleMetadataChange('reference', e.target.value)} className="flex-1 outline-none bg-transparent border-b border-dotted border-gray-400" /></p>
                                    <p className="flex"><span className="w-16">견적일:</span> <span>{estimate.estimate_date || today}</span></p>
                                    <p className="flex"><span className="w-16">견적번호:</span> <span>{estimate.id}</span></p>
                                </div>
                                <div className="mt-4 text-sm whitespace-pre-wrap">
                                    <textarea
                                        value={metadata.header_note}
                                        onChange={(e) => handleMetadataChange('header_note', e.target.value)}
                                        className="w-full resize-none outline-none bg-transparent"
                                        rows={3}
                                    />
                                </div>
                            </div>

                            {/* Right: Supplier (Company Info) */}
                            <div className="w-[85mm] border-2 border-[#000] p-2 relative">
                                <table className="w-full text-xs leading-relaxed">
                                    <colgroup>
                                        <col className="w-6" />
                                        <col />
                                    </colgroup>
                                    <tbody>
                                        <tr>
                                            <td rowSpan="5" className="text-center align-middle font-bold text-lg w-8 border-r border-[#000] writing-vertical bg-[#f3f4f6]">공<br />급<br />자</td>
                                            <td className="pl-2 border-b border-[#d1d5db] py-1">
                                                <span className="inline-block w-12 text-[#6b7280]">등록번호</span> {company?.registration_number}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="pl-2 border-b border-[#d1d5db] py-1 flex justify-between items-center pr-2">
                                                <span><span className="inline-block w-12 text-[#6b7280]">상호</span> {company?.name}</span>
                                                <span className="relative">
                                                    <span className="inline-block w-12 text-[#6b7280]">성명</span> {company?.owner_name || company?.representative}
                                                    {(metadata.show_stamp && (company?.stamp_image || company?.logo_image)) && (
                                                        <img
                                                            crossOrigin="anonymous"
                                                            src={getImageUrl((typeof company.stamp_image === 'string' ? JSON.parse(company.stamp_image).url : company.stamp_image?.url) ||
                                                                (typeof company.logo_image === 'string' ? JSON.parse(company.logo_image).url : company.logo_image?.url))}
                                                            alt="Stamp"
                                                            className="absolute -top-3 -right-2 w-12 h-12 object-contain opacity-80 mix-blend-multiply"
                                                        />
                                                    )}
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="pl-2 border-b border-[#d1d5db] py-1">
                                                <span className="inline-block w-12 text-[#6b7280]">주소</span> {company?.address}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="pl-2 border-b border-[#d1d5db] py-1">
                                                <span className="inline-block w-12 text-[#6b7280]">업태</span> {company?.business_type || '제조'} / {company?.business_item || '정밀가공'}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="pl-2 py-1">
                                                <span className="inline-block w-12 text-[#6b7280]">연락처</span> {company?.phone} / {company?.fax}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Grand Total */}
                        <div className="border-t-2 border-b-2 border-[#000] py-2 mb-6 flex items-center">
                            <span className="font-bold text-lg w-24 text-center">합계금액</span>
                            <span className="flex-1 text-right text-xl font-bold font-mono tracking-wider pr-4">
                                ￦ {fmt(grandTotal)} <span className="text-sm font-normal ml-2">(VAT 포함)</span>
                            </span>
                        </div>

                        {/* Item Table */}
                        <table className="w-full border-collapse border border-[#000] mb-6 text-sm">
                            <thead>
                                <tr className="bg-[#f3f4f6] text-center">
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
                                {/* Empty rows to fill space if needed */}
                                {Array.from({ length: Math.max(0, 10 - estimate.items.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="text-center text-transparent">
                                        <td className="border border-[#000] py-1">.</td>
                                        <td className="border border-[#000] py-1">.</td>
                                        <td className="border border-[#000] py-1">.</td>
                                        <td className="border border-[#000] py-1">.</td>
                                        <td className="border border-[#000] py-1">.</td>
                                        <td className="border border-[#000] py-1">.</td>
                                        <td className="border border-[#000] py-1">.</td>
                                        <td className="border border-[#000] py-1">.</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-[#f9fafb] font-bold text-center">
                                    <td colSpan="3" className="border border-[#000] py-2">소 계</td>
                                    <td className="border border-[#000] py-2">{fmt(estimate.items.reduce((s, i) => s + i.quantity, 0))}</td>
                                    <td className="border border-[#000] py-2"></td>
                                    <td className="border border-[#000] py-2 text-right px-2">{fmt(totalAmount)}</td>
                                    <td className="border border-[#000] py-2 text-right px-2">{fmt(vat)}</td>
                                    <td className="border border-[#000] py-2"></td>
                                </tr>
                            </tfoot>
                        </table>

                        {/* Footer Notes */}
                        <div className="mt-8">
                            <h4 className="font-bold border-b border-[#000] w-24 mb-2">특이사항</h4>
                            <textarea
                                value={metadata.footer_note}
                                onChange={(e) => handleMetadataChange('footer_note', e.target.value)}
                                className="w-full resize-none outline-none bg-transparent text-sm leading-relaxed min-h-[100px]"
                            />
                        </div>

                        {/* Footer Stamp/Date */}
                        <div className="mt-12 text-center text-sm text-[#6b7280]">
                            {/* Optional footer branding or date */}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EstimateSheetModal;
