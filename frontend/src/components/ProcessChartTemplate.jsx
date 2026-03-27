import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../lib/api';
import { Package, Settings, FileText, Loader2, X } from 'lucide-react';

const ProcessChartTemplate = ({ productId, onClose }) => {
    const [product, setProduct] = useState(null);
    const [bomItems, setBomItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (productId) {
            fetchData();
        }
    }, [productId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const prodRes = await api.get(`/product/products/${productId}`);
            setProduct(prodRes.data);

            const bomRes = await api.get(`/product/products/${productId}/bom`);
            setBomItems(bomRes.data);

            setTimeout(() => {
                window.print();
            }, 1500);
        } catch (error) {
            console.error("Failed to fetch process chart data", error);
            alert("데이터를 불러오는 데 실패했습니다.");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    if (!productId) return null;

    // Portal content
    const content = (
        <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto print-overlay">
            <style>
                {`
                @media screen {
                    .no-print { display: flex !important; }
                }
                @media print {
                    /* 1. 불필요한 모든 UI 요소 완벽히 숨김 */
                    body > :not(.print-overlay) { display: none !important; }
                    .no-print { display: none !important; }
                    
                    /* 2. 모달 배경 해제 및 문서 흐름 정상화 */
                    .print-overlay {
                        position: relative !important;
                        background: none !important;
                        inset: auto !important;
                        overflow: visible !important;
                        display: block !important;
                        padding: 0 !important;
                        width: 100% !important;
                    }
                    
                    /* 3. 인쇄 대상 규격 고정 */
                    #process-chart-printable {
                        position: relative !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        break-after: page;
                        visibility: visible !important;
                    }
                    
                    @page { 
                        size: A4 portrait; 
                        margin: 10mm; 
                    }
                }

                #process-chart-printable {
                    background: white;
                    color: #1a202c;
                    width: 210mm;
                    min-height: 297mm;
                    padding: 20mm;
                    box-shadow: 0 10px 50px rgba(0,0,0,0.8);
                    font-family: 'Inter', 'Noto Sans KR', sans-serif;
                    line-height: 1.5;
                    margin: 20px auto;
                    border-radius: 4px;
                }

                .chart-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    border: 2px solid #2d3748;
                }

                .chart-table th, .chart-table td {
                    border: 1px solid #718096;
                    padding: 8px 12px;
                    font-size: 13px;
                }

                .chart-table th {
                    background-color: #edf2f7;
                    font-weight: 700;
                    text-align: left;
                    color: #2d3748;
                    font-size: 12px;
                    text-transform: uppercase;
                }

                .section-header {
                    font-weight: 800;
                    font-size: 18px;
                    border-left: 5px solid #2d3748;
                    padding-left: 10px;
                    margin: 30px 0 15px 0;
                    color: #1a202c;
                }

                .main-title {
                    text-align: center;
                    font-size: 32px;
                    font-weight: 900;
                    letter-spacing: 5px;
                    margin-bottom: 40px;
                    padding-bottom: 10px;
                    border-bottom: 4px double #2d3748;
                }

                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 30px;
                }

                .info-item {
                    display: flex;
                    border-bottom: 1px solid #e2e8f0;
                    padding: 5px 0;
                }

                .info-label {
                    font-weight: 700;
                    width: 100px;
                    color: #4a5568;
                }

                /* Control Button Styles (Screen Only) */
                .print-controls {
                    position: sticky;
                    top: 20px;
                    right: 20px;
                    z-index: 10001;
                    justify-content: flex-end;
                    margin-bottom: -50px;
                }
                `}
            </style>

            <div className="relative w-full max-w-[215mm] mx-auto min-h-screen py-10">
                {/* Print Control Overlay (Visible only on screen) */}
                <div className="flex gap-3 no-print print-controls">
                    <button 
                        onClick={() => window.print()}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 transform active:scale-95 transition-all"
                    >
                        <FileText className="w-5 h-5" /> 인쇄 / PDF 저장
                    </button>
                    <button 
                        onClick={onClose}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 transform active:scale-95 transition-all"
                    >
                        <X className="w-5 h-5" /> 닫기 (ESC)
                    </button>
                </div>

                {loading ? (
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-20 flex flex-col items-center gap-6 text-white w-[210mm] mx-auto mt-20 shadow-2xl">
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                        <p className="text-xl font-bold tracking-tight">인쇄 데이터를 신속하게 준비 중입니다...</p>
                    </div>
                ) : (
                    <div id="process-chart-printable">
                        <div className="main-title">작 업 표 준 서 / 공 정 도</div>

                        <div className="info-grid">
                            <div>
                                <div className="info-item">
                                    <div className="info-label">품 명</div>
                                    <div>{product?.name}</div>
                                </div>
                                <div className="info-item">
                                    <div className="info-label">규 격</div>
                                    <div>{product?.specification || '-'}</div>
                                </div>
                                <div className="info-item">
                                    <div className="info-label">재 질</div>
                                    <div>{product?.material || '-'}</div>
                                </div>
                            </div>
                            <div>
                                <div className="info-item">
                                    <div className="info-label">제 품 코 드</div>
                                    <div>{product?.product_code || '-'}</div>
                                </div>
                                <div className="info-item">
                                    <div className="info-label">거 래 처</div>
                                    <div>{product?.partner_name || '-'}</div>
                                </div>
                                <div className="info-item">
                                    <div className="info-label">단 위</div>
                                    <div>{product?.unit || 'EA'}</div>
                                </div>
                            </div>
                        </div>

                        {/* BOM Section */}
                        <div className="section-header">1. 소요 자재 및 부품 (BOM)</div>
                        <table className="chart-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>No</th>
                                    <th>부품명</th>
                                    <th>규격</th>
                                    <th style={{ width: '80px', textAlign: 'right' }}>소요량</th>
                                    <th style={{ width: '60px', textAlign: 'center' }}>단위</th>
                                    <th>비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bomItems.length > 0 ? bomItems.map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                        <td style={{ fontWeight: 600 }}>{item.child_product?.name}</td>
                                        <td>{item.child_product?.specification || '-'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.required_quantity}</td>
                                        <td style={{ textAlign: 'center' }}>{item.child_product?.unit || 'EA'}</td>
                                        <td>{item.child_product?.note || ''}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', color: '#a0aec0' }}>등록된 BOM 정보가 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Routing Section */}
                        <div className="section-header">2. 표준 공정 흐름 (Routing)</div>
                        <table className="chart-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>순서</th>
                                    <th>공정명</th>
                                    <th>구분</th>
                                    <th>작업처 / 장비</th>
                                    <th style={{ width: '80px', textAlign: 'right' }}>예상시간</th>
                                    <th>작업 내용 및 주의사항</th>
                                </tr>
                            </thead>
                            <tbody>
                                {product?.standard_processes && product.standard_processes.length > 0 ? 
                                    [...product.standard_processes].sort((a, b) => a.sequence - b.sequence).map((pp, idx) => (
                                    <tr key={idx}>
                                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{pp.sequence}</td>
                                        <td style={{ fontWeight: 600 }}>{pp.process?.name}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            {pp.process?.course_type === 'INTERNAL' ? '내부' : 
                                             pp.process?.course_type === 'OUTSOURCING' ? '외주' : '구매'}
                                        </td>
                                        <td>{pp.partner_name || pp.equipment_name || '-'}</td>
                                        <td style={{ textAlign: 'right' }}>{pp.estimated_time || 0} 분</td>
                                        <td style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{pp.notes || '-'}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', color: '#a0aec0' }}>등록된 공정 정보가 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div style={{ marginTop: '50px', fontSize: '11px', color: '#718096', textAlign: 'right' }}>
                            출력일시: {new Date().toLocaleString()} | MES System Generated
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

export default ProcessChartTemplate;
