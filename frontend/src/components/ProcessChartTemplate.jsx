import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Package, Settings, FileText, Loader2 } from 'lucide-react';

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
            // 1. Fetch Product (includes routing/standard_processes)
            const prodRes = await api.get(`/product/products/${productId}`);
            setProduct(prodRes.data);

            // 2. Fetch BOM
            const bomRes = await api.get(`/product/products/${productId}/bom`);
            setBomItems(bomRes.data);

            // Wait for DOM to render then print
            setTimeout(() => {
                window.print();
                // We keep the modal open briefly for the print dialog, 
                // but the user can close it manually or we could onClose after a delay.
                // However, window.print() is blocking in most browsers until dialog closes.
            }, 1000);
        } catch (error) {
            console.error("Failed to fetch process chart data", error);
            alert("데이터를 불러오는 데 실패했습니다.");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    if (!productId) return null;

    return (
        <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
            <style>
                {`
                @media screen {
                    .no-print { display: flex !important; }
                }
                @media print {
                    .no-print { display: none !important; }
                    
                    /* 기존 화면의 모든 요소를 숨김 */
                    body * { visibility: hidden; }
                    /* 인쇄할 공정도 영역과 그 하위 요소만 보이게 강제 설정 */
                    #process-chart-printable, #process-chart-printable * { visibility: visible; }
                    
                    #process-chart-printable { 
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 210mm !important;
                        background: white !important;
                        color: black !important;
                        box-shadow: none !important;
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
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    font-family: 'Inter', 'Noto Sans KR', sans-serif;
                    line-height: 1.5;
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
                `}
            </style>

            <div className="relative max-h-full">
                {/* Print Control Overlay (Visible only on screen) */}
                <div className="absolute -top-12 right-0 flex gap-2 no-print">
                    <button 
                        onClick={() => window.print()}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                        <FileText className="w-4 h-4" /> 인쇄 / PDF 저장
                    </button>
                    <button 
                        onClick={onClose}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold"
                    >
                        닫기
                    </button>
                </div>

                {loading ? (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-12 flex flex-col items-center gap-4 text-white w-[210mm]">
                        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                        <p className="text-lg font-medium">인쇄 데이터를 준비 중입니다...</p>
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
};

export default ProcessChartTemplate;
