import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Download, FileText } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

/**
 * ProcessChartTemplate
 * A4 Portrait optimized work standard / process chart template.
 * Benchmarked against ProductionSheetModal and PurchaseOrderTemplate for reliable printing.
 */
const ProcessChartTemplate = ({ productId, onClose }) => {
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [company, setCompany] = useState(null);
    const printRef = useRef(null);

    useEffect(() => {
        if (productId) {
            fetchData();
            fetchCompany();
        }
    }, [productId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/product/products/${productId}`);
            setProduct(res.data);
        } catch (err) {
            console.error('Failed to fetch product for process chart:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) {
            console.error('Failed to fetch company info:', err);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (!productId) return null;

    // Loading State Layer
    const ModalOverlay = ({ children }) => (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto no-print">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col h-[95vh] overflow-hidden">
                {children}
            </div>
        </div>
    );

    if (loading) {
        return createPortal(
            <ModalOverlay>
                <div className="flex-1 flex items-center justify-center text-white text-lg font-bold">
                    데이터를 불러오는 중...
                </div>
            </ModalOverlay>,
            document.body
        );
    }

    if (!product) {
        return createPortal(
            <ModalOverlay>
                <div className="flex-1 flex items-center justify-center text-white text-lg font-bold">
                    제품 데이터를 찾을 수 없습니다.
                </div>
                <button onClick={onClose} className="absolute top-4 right-4 text-white"><X size={32} /></button>
            </ModalOverlay>,
            document.body
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 overflow-y-auto">
            {/* Scoped Style Tag - The "Proven" CSS logic */}
            <style>{`
                @media screen {
                    .a4-preview-container {
                        background-color: #525659;
                        padding: 40px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 40px;
                    }
                }
                @media print {
                    /* 1. Hide everything by default */
                    body * {
                        visibility: hidden;
                    }
                    /* 2. Show only the specific chart area */
                    #process-chart-printable, #process-chart-printable * {
                        visibility: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    /* 3. Reset positions for print engine */
                    #process-chart-printable {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 210mm !important;
                        margin: 0 !important;
                        padding: 10mm !important;
                        box-shadow: none !important;
                        border: none !important;
                        background: white !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                }
            `}</style>

            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col h-full md:h-[95vh] overflow-hidden no-print">
                {/* Header Controls */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
                    <div className="flex items-center gap-2 text-white font-bold">
                        <FileText className="w-5 h-5 text-blue-400" />
                        <span>공정도(작업표준서) 인쇄 미리보기</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handlePrint}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                        >
                            <Printer className="w-4 h-4" /> 인쇄하기 / PDF 저장
                        </button>
                        <button 
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-8 h-8" />
                        </button>
                    </div>
                </div>

                {/* PDF Viewer-like Area */}
                <div className="flex-1 overflow-auto a4-preview-container">
                    <div 
                        id="process-chart-printable"
                        ref={printRef}
                        className="bg-white text-black flex flex-col a4-wrapper print-safe-area"
                        style={{
                            width: '210mm',
                            minHeight: '297mm',
                            padding: '15mm',
                            boxSizing: 'border-box',
                            fontFamily: '"Malgun Gothic", sans-serif',
                            boxShadow: '0 0 20px rgba(0,0,0,0.3)',
                            background: 'white'
                        }}
                    >
                        {/* ── Title Header ── */}
                        <div className="text-center py-6 border-b-4 border-black mb-8">
                            <h1 className="text-4xl font-black tracking-[0.8em] indent-[0.8em]">
                                공 정 도
                            </h1>
                            <div className="mt-2 text-sm text-gray-500 font-bold uppercase tracking-widest">
                                Work Standard / Process Chart
                            </div>
                        </div>

                        {/* ── Top Info Section (Grid) ── */}
                        <div className="grid grid-cols-2 gap-0 border-2 border-black mb-8 text-sm">
                            <div className="border-r-2 border-black">
                                <div className="flex border-b border-black">
                                    <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-2">제품명</div>
                                    <div className="flex-1 px-3 flex items-center font-bold">{product.name}</div>
                                </div>
                                <div className="flex border-b border-black">
                                    <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-2">제품코드</div>
                                    <div className="flex-1 px-3 flex items-center font-mono">{product.code}</div>
                                </div>
                                <div className="flex">
                                    <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-2">규격</div>
                                    <div className="flex-1 px-3 flex items-center">{product.specification || '-'}</div>
                                </div>
                            </div>
                            <div>
                                <div className="flex border-b border-black">
                                    <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-2">작성일</div>
                                    <div className="flex-1 px-3 flex items-center">{new Date().toLocaleDateString()}</div>
                                </div>
                                <div className="flex border-b border-black">
                                    <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-2">작성부서</div>
                                    <div className="flex-1 px-3 flex items-center">생산기술팀</div>
                                </div>
                                <div className="flex">
                                    <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-2">작성자</div>
                                    <div className="flex-1 px-3 flex items-center">시스템 관리자</div>
                                </div>
                            </div>
                        </div>

                        {/* ── Process Table ── */}
                        <div className="flex-1">
                            <table className="w-full border-collapse border-2 border-black text-sm">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-black px-2 py-3 w-12">순번</th>
                                        <th className="border border-black px-2 py-3 w-32">공정명</th>
                                        <th className="border border-black px-2 py-3 w-24">공정구분</th>
                                        <th className="border border-black px-2 py-3">주요 작업 내용 및 품질 관리 항목</th>
                                        <th className="border border-black px-2 py-3 w-24">비고</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(product.standard_processes || []).length > 0 ? (
                                        product.standard_processes.sort((a,b) => a.sequence - b.sequence).map((proc, idx) => (
                                            <tr key={idx} className="h-16">
                                                <td className="border border-black text-center font-bold">{idx + 1}</td>
                                                <td className="border border-black px-3 font-bold">{proc.process_name}</td>
                                                <td className="border border-black text-center">
                                                    <span className={cn(
                                                        "px-2 py-1 rounded text-[10px] font-bold",
                                                        proc.course_type === 'INTERNAL' ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                                                    )}>
                                                        {proc.course_type === 'INTERNAL' ? '사내' : '외주'}
                                                    </span>
                                                </td>
                                                <td className="border border-black px-3 text-xs leading-relaxed">
                                                    {proc.note || '-'}
                                                </td>
                                                <td className="border border-black px-2 text-center text-[10px]">
                                                    {proc.work_center || '-'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="border border-black py-20 text-center text-gray-400">
                                                등록된 표준 공정 정보가 없습니다.
                                            </td>
                                        </tr>
                                    )}
                                    {/* Fill empty rows for professional look */}
                                    {Array.from({ length: Math.max(0, 10 - (product.standard_processes?.length || 0)) }).map((_, i) => (
                                        <tr key={`empty-${i}`} className="h-12">
                                            <td className="border border-black"></td>
                                            <td className="border border-black"></td>
                                            <td className="border border-black"></td>
                                            <td className="border border-black"></td>
                                            <td className="border border-black"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Section */}
                        <div className="mt-8 flex justify-between items-end border-t-2 border-black pt-4">
                            <div className="text-[10px] text-gray-400 font-mono">
                                DESIGNMECHA MES v2.0 | {product.code} | PAGE 1 / 1
                            </div>
                            <div className="text-xl font-black tracking-widest">
                                {company?.name || '(주)디자인메카'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ProcessChartTemplate;
