import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Edit2, FileSpreadsheet } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';

const ProductionSheetModal = ({ isOpen, onClose, plan, onSave }) => {
    const [company, setCompany] = useState(null);
    const [template, setTemplate] = useState(null);
    const [saving, setSaving] = useState(false);

    // Editable State (Metadata)
    const [metadata, setMetadata] = useState({
        order_amount: "",
        manager: "",
        memo: "",
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && plan) {
            fetchCompany();
            fetchTemplate();
            initializeData();
        }
    }, [isOpen, plan]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (error) { console.error("Failed to fetch company info", error); }
    };

    const fetchTemplate = async () => {
        try {
            const res = await api.get('/basics/form-templates/');
            const prodTemplate = res.data.find(t => t.form_type === 'PRODUCTION');
            if (prodTemplate) setTemplate(prodTemplate);
        } catch (error) { console.error("Failed to fetch template", error); }
    };

    const initializeData = () => {
        if (plan) {
            let initialMetadata = {
                order_amount: plan.order?.total_amount?.toLocaleString() || "0",
                manager: "",
                memo: "",
            };
            if (plan.sheet_metadata) {
                try {
                    const savedMeta = typeof plan.sheet_metadata === 'string'
                        ? JSON.parse(plan.sheet_metadata)
                        : plan.sheet_metadata;
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
                pdf.save(`production_sheet_${plan.id}.pdf`);
            } else if (action === 'save') {
                const blob = pdf.output('blob');
                const file = new File([blob], `prod_sheet_${plan.id}_${Date.now()}.pdf`, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                let currentAttachments = [];
                try {
                    if (plan.attachment_file) {
                        currentAttachments = typeof plan.attachment_file === 'string'
                            ? JSON.parse(plan.attachment_file)
                            : plan.attachment_file;
                    }
                } catch (e) { currentAttachments = []; }

                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];
                await api.put(`/production/plans/${plan.id}`, {
                    attachment_file: newAttachments,
                    sheet_metadata: metadata
                });
                alert("생산시트가 저장되었습니다.");
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
            await api.put(`/production/plans/${plan.id}`, { sheet_metadata: metadata });
            await api.post(`/production/plans/${plan.id}/export_excel`);
            alert("엑셀 파일이 생성되었습니다.");
            if (onSave) onSave();
            onClose();
        } catch (error) {
            console.error("Excel Generation failed", error);
            alert("엑셀 생성 실패");
        } finally { setSaving(false); }
    };

    if (!isOpen || !plan) return null;

    const fmt = (n) => n?.toLocaleString() || "0";
    const getTypeLabel = (courseType) => {
        if (!courseType) return '-';
        if (courseType.includes('INTERNAL') || courseType.includes('내부')) return '내부';
        if (courseType.includes('OUTSOURCING') || courseType.includes('외주')) return '외주';
        if (courseType.includes('PURCHASE') || courseType.includes('원재료')) return '원재료';
        return courseType;
    };

    const uniqueProductsMap = new Map();
    (plan.items || []).forEach(item => {
        if (item.product && !uniqueProductsMap.has(item.product.id)) {
            uniqueProductsMap.set(item.product.id, { product: item.product, quantity: item.quantity || 0, note: item.note || '' });
        }
    });
    const uniqueProducts = Array.from(uniqueProductsMap.values());

    const renderBlock = (block) => {
        const config = block.config || {};
        switch (block.type) {
            case 'header':
                return (
                    <div className="mb-2 relative flex justify-between items-center h-12" key={block.id}>
                        <span className="text-sm font-bold border border-black px-4 py-1">{config.title || "생산관리"}</span>
                        <div className="flex items-center gap-4">
                            {company?.logo_image && (
                                <img crossOrigin="anonymous" src={getImageUrl(typeof company.logo_image === 'string' ? JSON.parse(company.logo_image).url : company.logo_image.url)} alt="Logo" className="h-8 object-contain" />
                            )}
                            {company?.stamp_image && (
                                <img crossOrigin="anonymous" src={getImageUrl(typeof company.stamp_image === 'string' ? JSON.parse(company.stamp_image).url : company.stamp_image.url)} alt="Stamp" className="h-10 w-10 object-contain" />
                            )}
                        </div>
                    </div>
                );
            case 'infoTable':
                return (
                    <table className="w-full border-collapse border border-black text-sm mb-4" key={block.id}>
                        <tbody>
                            <tr className="text-center">
                                <td className="border border-black bg-gray-100 py-1.5 font-bold">고객</td>
                                <td className="border border-black py-1.5">{plan.order?.partner?.name || '-'}</td>
                                <td className="border border-black bg-gray-100 py-1.5 font-bold">수주일</td>
                                <td className="border border-black py-1.5">{plan.order?.order_date || '-'}</td>
                            </tr>
                            <tr className="text-center">
                                <td className="border border-black bg-gray-100 py-1.5 font-bold">수주금액</td>
                                <td className="border border-black p-0">
                                    <input value={metadata.order_amount} onChange={(e) => handleMetadataChange('order_amount', e.target.value)} className="w-full h-full text-center outline-none bg-transparent" />
                                </td>
                                <td className="border border-black bg-gray-100 py-1.5 font-bold">담당자</td>
                                <td className="border border-black p-0">
                                    <input value={metadata.manager} onChange={(e) => handleMetadataChange('manager', e.target.value)} className="w-full h-full text-center outline-none bg-transparent" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                );
            case 'productList':
                return (
                    <table className="w-full border-collapse border border-black text-sm mb-0" key={block.id}>
                        <thead>
                            <tr className="bg-gray-100 text-center">
                                <th className="border border-black font-bold py-1.5">품명</th>
                                <th className="border border-black font-bold py-1.5">규격</th>
                                <th className="border border-black font-bold py-1.5">수량</th>
                                <th className="border border-black font-bold py-1.5">비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {uniqueProducts.map((p, idx) => (
                                <tr key={idx} className="text-center h-8">
                                    <td className="border border-black px-1 text-left">{p.product.name}</td>
                                    <td className="border border-black px-1">{p.product.code || '-'}</td>
                                    <td className="border border-black px-1">{fmt(p.quantity)}</td>
                                    <td className="border border-black px-1 text-xs">{p.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );
            case 'memo':
                return (
                    <div className="flex border-x border-b border-black mb-4 min-h-[60px]" key={block.id}>
                        <div className="w-[15%] border-r border-black flex items-center justify-center bg-white text-sm">Memo</div>
                        <div className="w-[85%]">
                            <textarea value={metadata.memo} onChange={(e) => handleMetadataChange('memo', e.target.value)} className="w-full h-full resize-none outline-none p-2 text-sm bg-transparent" />
                        </div>
                    </div>
                );
            case 'processTable':
                return (
                    <table className="w-full border-collapse border border-black text-[10px]" key={block.id}>
                        <thead>
                            <tr className="bg-gray-100 text-center">
                                <th className="border border-black font-bold py-1">구분</th>
                                <th className="border border-black font-bold py-1">순번</th>
                                <th className="border border-black font-bold py-1">공정</th>
                                <th className="border border-black font-bold py-1">공정내용</th>
                                <th className="border border-black font-bold py-1">업체</th>
                                <th className="border border-black font-bold py-1">수량</th>
                                <th className="border border-black font-bold py-1">시작</th>
                                <th className="border border-black font-bold py-1">종료</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(plan.items || []).map((item, idx) => (
                                <tr key={item.id || idx} className="text-center h-7 font-bold">
                                    <td className="border border-black">{getTypeLabel(item.course_type)}</td>
                                    <td className="border border-black">{item.sequence || (idx + 1)}</td>
                                    <td className="border border-black font-extrabold">{item.process_name}</td>
                                    <td className="border border-black px-1 text-left">{item.note || '-'}</td>
                                    <td className="border border-black">{item.partner_name || '-'}</td>
                                    <td className="border border-black">{fmt(item.quantity) || '-'}</td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );
            default: return null;
        }
    };

    const blocks = template?.layout_data?.blocks || [
        { id: 'h1', type: 'header' },
        { id: 'i1', type: 'infoTable' },
        { id: 'p1', type: 'productList' },
        { id: 'm1', type: 'memo' },
        { id: 't1', type: 'processTable' }
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Edit2 className="w-5 h-5 text-blue-500" />
                        생산관리시트 미리보기 및 편집 (시각적 양식 적용)
                    </h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => generatePDF('download')} disabled={saving} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors">
                            <Download className="w-4 h-4" /> 다운로드
                        </button>
                        <button onClick={() => generatePDF('save')} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20">
                            <Save className="w-4 h-4" /> {saving ? "저장 중..." : "PDF 저장 및 첨부"}
                        </button>
                        <button onClick={handleExcelExport} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-green-900/20 ml-2">
                            <FileSpreadsheet className="w-4 h-4" /> {saving ? "저장 중..." : "엑셀 저장 및 첨부"}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-gray-950 p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] shadow-xl origin-top" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>
                        {blocks.map(block => renderBlock(block))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionSheetModal;
