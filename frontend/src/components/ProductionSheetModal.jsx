import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Printer, Edit2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { cn, getImageUrl } from '../lib/utils';

const ProductionSheetModal = ({ isOpen, onClose, plan, onSave }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [company, setCompany] = useState(null);

    // Editable State (Metadata)
    const [metadata, setMetadata] = useState({
        order_amount: "", // 수주금액 (수동 입력 가능하도록)
        manager: "0",      // 수주담당자
        memo: "",         // Memo
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && plan) {
            fetchCompany();
            initializeData();
        }
    }, [isOpen, plan]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (error) {
            console.error("Failed to fetch company info", error);
        }
    };

    const initializeData = () => {
        if (plan) {
            let initialMetadata = { ...metadata };
            // Auto calculate amount from order if not saved yet
            let defaultAmount = "0";
            if (plan.order && plan.order.total_amount) {
                defaultAmount = plan.order.total_amount.toLocaleString();
            }

            if (plan.sheet_metadata) {
                try {
                    const savedMeta = typeof plan.sheet_metadata === 'string'
                        ? JSON.parse(plan.sheet_metadata)
                        : plan.sheet_metadata;
                    initialMetadata = { ...initialMetadata, ...savedMeta };
                } catch (e) {
                    console.error("Failed to parse metadata", e);
                }
            } else {
                initialMetadata.order_amount = defaultAmount;
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
                pdf.save(`production_sheet_${plan.id}.pdf`);
                setSaving(false);
            } else if (action === 'save') {
                // 1. Save File
                const blob = pdf.output('blob');
                const file = new File([blob], `prod_sheet_${plan.id}_${Date.now()}.pdf`, { type: 'application/pdf' });

                const formData = new FormData();
                formData.append('file', file);

                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                const fileUrl = uploadRes.data.url;
                const fileName = uploadRes.data.filename;

                let currentAttachments = [];
                try {
                    if (plan.attachment_file) {
                        currentAttachments = typeof plan.attachment_file === 'string'
                            ? JSON.parse(plan.attachment_file)
                            : plan.attachment_file;
                        if (!Array.isArray(currentAttachments)) currentAttachments = [currentAttachments];
                    }
                } catch (e) {
                    currentAttachments = [];
                }

                // Add new file
                const newAttachments = [...currentAttachments, { name: fileName, url: fileUrl }];

                await api.put(`/production/plans/${plan.id}`, {
                    attachment_file: newAttachments,
                    sheet_metadata: metadata
                });

                alert("생산관리시트가 저장되었습니다.");
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

    if (!isOpen || !plan) return null;

    // Derived Data
    const fmt = (n) => n?.toLocaleString() || "0";

    // Aggregate unique products from plan.items
    const uniqueProductsMap = new Map();
    (plan.items || []).forEach(item => {
        if (item.product && !uniqueProductsMap.has(item.product.id)) {
            uniqueProductsMap.set(item.product.id, {
                product: item.product,
                quantity: item.quantity || 0, // Get quantity from first process step
                note: item.note || ''
            });
        }
    });
    const uniqueProducts = Array.from(uniqueProductsMap.values());

    // Top Info
    const customerName = plan.order?.partner?.name || '-';
    const orderDate = plan.order?.order_date || '-';
    const deliveryDate = plan.order?.delivery_date || '-';

    const summaryProductName = uniqueProducts.length > 0
        ? (uniqueProducts.length > 1 ? `${uniqueProducts[0].product.name} 외 ${uniqueProducts.length - 1}건` : uniqueProducts[0].product.name)
        : '-';

    // Type casting logic for "구분" (Type)
    const getTypeLabel = (courseType) => {
        if (!courseType) return '-';
        if (courseType.includes('INTERNAL') || courseType.includes('내부')) return '내부';
        if (courseType.includes('OUTSOURCING') || courseType.includes('외주')) return '외주';
        if (courseType.includes('PURCHASE') || courseType.includes('원재료') || courseType.includes('구매')) return '원재료';
        return courseType;
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Edit2 className="w-5 h-5 text-blue-500" />
                        생산관리시트 미리보기 및 편집
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
                            {saving ? "저장 중..." : "저장 및 첨부"}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Preview Area (A4 Container) */}
                <div className="flex-1 overflow-auto bg-gray-500 p-8 flex justify-center">
                    <div
                        ref={sheetRef}
                        className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] shadow-xl origin-top"
                        style={{ fontFamily: '"Malgun Gothic", "Sunny", sans-serif' }}
                    >
                        {/* Title and Logo/Stamp */}
                        <div className="mb-2 relative flex justify-between items-center h-12">
                            <span className="text-sm font-bold border border-black px-4 py-1">생산관리</span>
                            <div className="flex items-center gap-4">
                                {company?.logo_image && (
                                    <img
                                        crossOrigin="anonymous"
                                        src={getImageUrl(typeof company.logo_image === 'string' ? JSON.parse(company.logo_image).url : company.logo_image.url)}
                                        alt="Logo"
                                        className="h-8 object-contain"
                                    />
                                )}
                                {company?.stamp_image && (
                                    <img
                                        crossOrigin="anonymous"
                                        src={getImageUrl(typeof company.stamp_image === 'string' ? JSON.parse(company.stamp_image).url : company.stamp_image.url)}
                                        alt="Stamp"
                                        className="h-10 w-10 object-contain opacity-80 mix-blend-multiply"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Top Info Table */}
                        <table className="w-full border-collapse border border-black text-sm mb-4">
                            <colgroup>
                                <col className="w-[15%]" />
                                <col className="w-[35%]" />
                                <col className="w-[15%]" />
                                <col className="w-[35%]" />
                            </colgroup>
                            <tbody>
                                <tr className="text-center">
                                    <td className="border border-black bg-gray-100 py-1.5 font-bold">고객</td>
                                    <td className="border border-black py-1.5">{customerName}</td>
                                    <td className="border border-black bg-gray-100 py-1.5 font-bold">수주일</td>
                                    <td className="border border-black py-1.5">{orderDate}</td>
                                </tr>
                                <tr className="text-center">
                                    <td className="border border-black bg-gray-100 py-1.5 font-bold">품명</td>
                                    <td className="border border-black py-1.5">{summaryProductName}</td>
                                    <td className="border border-black bg-gray-100 py-1.5 font-bold">요구납기일</td>
                                    <td className="border border-black py-1.5">{deliveryDate}</td>
                                </tr>
                                <tr className="text-center">
                                    <td className="border border-black bg-gray-100 py-1.5 font-bold">수주금액</td>
                                    <td className="border border-black p-0">
                                        <input
                                            value={metadata.order_amount}
                                            onChange={(e) => handleMetadataChange('order_amount', e.target.value)}
                                            className="w-full h-full text-center outline-none bg-transparent"
                                        />
                                    </td>
                                    <td className="border border-black bg-gray-100 py-1.5 font-bold">수주담당자</td>
                                    <td className="border border-black p-0">
                                        <input
                                            value={metadata.manager}
                                            onChange={(e) => handleMetadataChange('manager', e.target.value)}
                                            className="w-full h-full text-center outline-none bg-transparent"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Middle Table (Products) */}
                        <table className="w-full border-collapse border border-black text-sm mb-0">
                            <colgroup>
                                <col className="w-[20%]" />
                                <col className="w-[30%]" />
                                <col className="w-[15%]" />
                                <col className="w-[10%]" />
                                <col className="w-[25%]" />
                            </colgroup>
                            <thead>
                                <tr className="bg-gray-100 text-center">
                                    <th className="border border-black font-bold py-1.5">품명</th>
                                    <th className="border border-black font-bold py-1.5">규격</th>
                                    <th className="border border-black font-bold py-1.5">재질</th>
                                    <th className="border border-black font-bold py-1.5">수량</th>
                                    <th className="border border-black font-bold py-1.5">비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {uniqueProducts.map((p, idx) => (
                                    <tr key={idx} className="text-center h-8">
                                        <td className="border border-black px-1 text-left">{p.product.name}</td>
                                        <td className="border border-black px-1">{p.product.code || '-'}</td>
                                        <td className="border border-black px-1">{p.product.material || '-'}</td>
                                        <td className="border border-black px-1">{fmt(p.quantity)}</td>
                                        <td className="border border-black px-1 text-xs">{p.note}</td>
                                    </tr>
                                ))}
                                {/* Fill empty rows to make it 3 rows minimum like image */}
                                {Array.from({ length: Math.max(0, 3 - uniqueProducts.length) }).map((_, i) => (
                                    <tr key={`empty-prod-${i}`} className="text-center h-8">
                                        <td className="border border-black">0</td>
                                        <td className="border border-black">0</td>
                                        <td className="border border-black">0</td>
                                        <td className="border border-black">0</td>
                                        <td className="border border-black"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Memo Row */}
                        <div className="flex border-x border-b border-black mb-8 min-h-[60px]">
                            <div className="w-[15%] border-r border-black flex items-center justify-center bg-white text-sm">
                                Memo
                            </div>
                            <div className="w-[85%]">
                                <textarea
                                    value={metadata.memo}
                                    onChange={(e) => handleMetadataChange('memo', e.target.value)}
                                    className="w-full h-full resize-none outline-none p-2 text-sm bg-transparent"
                                />
                            </div>
                        </div>

                        {/* Bottom Table (Processes) */}
                        <table className="w-full border-collapse border border-black text-xs">
                            <colgroup>
                                <col className="w-[8%]" />
                                <col className="w-[6%]" />
                                <col className="w-[12%]" />
                                <col className="w-[20%]" />
                                <col className="w-[15%]" />
                                <col className="w-[10%]" />
                                <col className="w-[10%]" />
                                <col className="w-[7%]" />
                                <col className="w-[6%]" />
                                <col className="w-[6%]" />
                            </colgroup>
                            <thead>
                                <tr className="bg-gray-100 text-center">
                                    <th className="border border-black font-bold py-1.5">구분</th>
                                    <th className="border border-black font-bold py-1.5">순번</th>
                                    <th className="border border-black font-bold py-1.5">공정</th>
                                    <th className="border border-black font-bold py-1.5">공정내용</th>
                                    <th className="border border-black font-bold py-1.5">업체</th>
                                    <th className="border border-black font-bold py-1.5">품명</th>
                                    <th className="border border-black font-bold py-1.5">규격</th>
                                    <th className="border border-black font-bold py-1.5">수량</th>
                                    <th className="border border-black font-bold py-1.5">시작</th>
                                    <th className="border border-black font-bold py-1.5">종료</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(plan.items || []).map((item, idx) => (
                                    <tr key={item.id || idx} className="text-center h-7">
                                        <td className="border border-black">{getTypeLabel(item.course_type)}</td>
                                        <td className="border border-black">{item.sequence || (idx + 1)}</td>
                                        <td className="border border-black">{item.process_name}</td>
                                        <td className="border border-black px-1 text-left truncate max-w-[120px]">{item.note || '-'}</td>
                                        <td className="border border-black px-1 text-left truncate max-w-[100px]">{item.partner_name || '-'}</td>
                                        <td className="border border-black">-</td>
                                        <td className="border border-black">-</td>
                                        <td className="border border-black">{fmt(item.quantity) || '-'}</td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                    </tr>
                                ))}
                                {/* Fill empty rows to make it look full if needed. E.g up to 16 */}
                                {Array.from({ length: Math.max(0, 16 - (plan.items?.length || 0)) }).map((_, i) => (
                                    <tr key={`empty-proc-${i}`} className="text-center h-7">
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50">-</td>
                                        <td className="border border-black bg-gray-50"></td>
                                        <td className="border border-black bg-gray-50"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionSheetModal;
