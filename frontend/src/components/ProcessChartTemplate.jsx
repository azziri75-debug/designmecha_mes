import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, FileText, ChevronRight } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

/**
 * ProcessChartTemplate
 * A4 Portrait optimized work standard / process chart template.
 * Perfectly isolated for professional A4 printing.
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

    // Loading/Error Layers
    if (loading) {
        return createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-800 text-white text-lg font-bold no-print">
                데이터를 불러오는 중...
            </div>,
            document.body
        );
    }

    if (!product) {
        return createPortal(
            <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-gray-800 text-white no-print">
                <div className="text-lg font-bold mb-4">제품 데이터를 찾을 수 없습니다.</div>
                <button onClick={onClose} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors"><X size={32} /></button>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[10000] bg-gray-800 flex justify-center overflow-y-auto py-10">
            {/* Scoped Style Tag - User's Perfect Print Logic */}
            <style>{`
                @media screen {
                    .no-print { display: flex !important; }
                }
                @media print {
                    /* 브라우저 기본 여백 및 페이지 설정 */
                    @page { size: A4 portrait; margin: 0; }

                    /* 기존 화면 모두 투명화 (공간은 남겨둠) */
                    body * { visibility: hidden !important; }

                    /* 프린트 영역만 강제로 끄집어내서 종이 좌상단에 고정 */
                    #process-chart-printable, #process-chart-printable * {
                        visibility: visible !important;
                    }
                    
                    #process-chart-printable {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 210mm !important;
                        margin: 0 !important;
                        padding: 10mm 15mm !important;
                        box-shadow: none !important;
                        background: white !important;
                        color: black !important;
                    }

                    /* [핵심] 매 페이지 상단 헤더 반복 설정 */
                    thead { display: table-header-group; }
                    tbody { display: table-row-group; }
                    
                    /* 행 쪼개짐 방지 */
                    tr { page-break-inside: avoid; break-inside: avoid; }

                    /* 인쇄 시 불필요한 요소 제거 */
                    .no-print, .no-print * { display: none !important; }
                }
            `}</style>

            {/* Float Controls */}
            <div className="fixed top-6 right-10 z-[10001] no-print flex gap-2">
                <button 
                    onClick={handlePrint}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                >
                    <Printer className="w-4 h-4" /> 인쇄
                </button>
                <button 
                    onClick={onClose}
                    className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors backdrop-blur-md"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* The Actual Document - Using Table for Header Repetition */}
            <table 
                id="process-chart-printable"
                ref={printRef}
                className="bg-white text-black shadow-2xl border-collapse"
                style={{
                    width: '210mm',
                    backgroundColor: 'white',
                    padding: '10mm 15mm',
                    boxSizing: 'border-box',
                    fontFamily: '"Malgun Gothic", sans-serif'
                }}
            >
                {/* ── [thead] Repeated Header Section ── */}
                <thead>
                    <tr>
                        <th className="font-normal text-left">
                            {/* ── Title Header ── */}
                            <div className="text-center py-4 border-b-4 border-black mb-4">
                                <h1 className="text-4xl font-black tracking-[0.8em] indent-[0.8em]">
                                    공 정 도
                                </h1>
                                <div className="mt-1 text-xs text-gray-500 font-bold uppercase tracking-widest">
                                    Work Standard / Process Chart
                                </div>
                            </div>

                            {/* ── Top Info Section (Grid) ── */}
                            <div className="grid grid-cols-2 gap-0 border-2 border-black mb-4 text-sm">
                                <div className="border-r-2 border-black">
                                    <div className="flex border-b border-black">
                                        <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-1.5">제품명</div>
                                        <div className="flex-1 px-3 flex items-center font-bold">{product.name}</div>
                                    </div>
                                    <div className="flex border-b border-black">
                                        <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-1.5">제품코드</div>
                                        <div className="flex-1 px-3 flex items-center font-mono">{product.code}</div>
                                    </div>
                                    <div className="flex">
                                        <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-1.5">규격</div>
                                        <div className="flex-1 px-3 flex items-center">{product.specification || '-'}</div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex border-b border-black">
                                        <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-1.5">작성일</div>
                                        <div className="flex-1 px-3 flex items-center">{new Date().toLocaleDateString()}</div>
                                    </div>
                                    <div className="flex border-b border-black">
                                        <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-1.5">재질</div>
                                        <div className="flex-1 px-3 flex items-center font-bold">{product.material || '-'}</div>
                                    </div>
                                    <div className="flex">
                                        <div className="w-24 bg-gray-100 flex items-center justify-center font-bold border-r border-black py-1.5">거래처</div>
                                        <div className="flex-1 px-3 flex items-center">{product.partner_name || product.partner?.name || '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </th>
                    </tr>
                </thead>

                {/* ── [tbody] Natural Flowing Content ── */}
                <tbody>
                    <tr>
                        <td className="align-top">
                            {/* ── BOM (소요 자재 및 부품) Table (Conditional) ── */}
                            {(product.bom_items || []).length > 0 && (
                                <div className="mb-4">
                                    <div className="text-xs font-bold mb-1 flex items-center gap-1">
                                        <FileText size={14} /> [BOM] 소요 자재 및 부품 상세
                                    </div>
                                    <table className="w-full border-collapse border border-black text-[11px]">
                                        <thead>
                                            <tr className="bg-gray-50">
                                                <th className="border border-black px-1 py-1 w-10">No</th>
                                                <th className="border border-black px-2 py-1">부품명(자재명)</th>
                                                <th className="border border-black px-2 py-1 w-32">규격</th>
                                                <th className="border border-black px-1 py-1 w-16">소요량</th>
                                                <th className="border border-black px-1 py-1 w-12">단위</th>
                                                <th className="border border-black px-2 py-1 w-24">비고</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {product.bom_items.map((bom, idx) => (
                                                <tr key={idx} className="h-7 text-center">
                                                    <td className="border border-black">{idx + 1}</td>
                                                    <td className="border border-black px-2 text-left font-bold">
                                                        {bom.child_product?.name || bom.product_name || '-'}
                                                    </td>
                                                    <td className="border border-black px-2 text-left">
                                                        {bom.child_product?.specification || bom.specification || '-'}
                                                    </td>
                                                    <td className="border border-black font-bold">{bom.quantity}</td>
                                                    <td className="border border-black">{bom.child_product?.unit || 'EA'}</td>
                                                    <td className="border border-black text-[9px]">{bom.note || '-'}</td>
                                                </tr>
                                            ))}
                                            {/* Minimal filler if needed, but not required if length > 0 */}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ── Process Table ── */}
                            <div className="flex-1">
                                <div className="text-xs font-bold mb-1 flex items-center gap-1">
                                    <ChevronRight size={14} /> [Routing] 주요 공정 흐름 및 작업 표준
                                </div>
                                <table className="w-full border-collapse border-2 border-black text-sm">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="border border-black px-2 py-2 w-12 text-xs">순번</th>
                                            <th className="border border-black px-2 py-2 w-32 text-xs">공정명</th>
                                            <th className="border border-black px-2 py-2 w-24 text-xs">공정구분</th>
                                            <th className="border border-black px-2 py-2 text-xs">주요 작업 내용 및 품질 관리 항목</th>
                                            <th className="border border-black px-2 py-2 w-24 text-xs">비고</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(product.standard_processes || []).length > 0 ? (
                                            product.standard_processes.sort((a,b) => a.sequence - b.sequence).map((proc, idx) => (
                                                <tr key={idx} className="h-14">
                                                    <td className="border border-black text-center font-bold text-xs">{idx + 1}</td>
                                                    <td className="border border-black px-3 font-bold text-xs">
                                                        {proc.process?.name || proc.process_name || '-'}
                                                    </td>
                                                    <td className="border border-black text-center">
                                                        <span className={cn(
                                                            "px-2 py-1 rounded text-[10px] font-bold",
                                                            proc.course_type === 'INTERNAL' ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                                                        )}>
                                                            {proc.course_type === 'INTERNAL' ? '사내' : '외주'}
                                                        </span>
                                                    </td>
                                                    <td className="border border-black px-3 text-[11px] leading-relaxed">
                                                        {proc.note || '-'}
                                                    </td>
                                                    <td className="border border-black px-2 text-center text-[10px]">
                                                        {proc.work_center || '-'}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="border border-black py-10 text-center text-gray-400">
                                                    등록된 표준 공정 정보가 없습니다.
                                                </td>
                                            </tr>
                                        )}
                                        {/* Reduced filler rows to conserve space */}
                                        {Array.from({ length: Math.max(0, 5 - (product.standard_processes?.length || 0)) }).map((_, i) => (
                                            <tr key={`empty-${i}`} className="h-10">
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

                            {/* Footer Section (Inner) */}
                            <div className="mt-6 flex justify-between items-end border-t-2 border-black pt-2 mb-4">
                                <div className="text-[10px] text-gray-400 font-mono">
                                    DESIGNMECHA MES v2.0 | {product.code} | WORK STANDARD
                                </div>
                                <div className="text-lg font-black tracking-widest">
                                    {company?.name || '(주)디자인메카'}
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>,
        document.body
    );
};

export default ProcessChartTemplate;
